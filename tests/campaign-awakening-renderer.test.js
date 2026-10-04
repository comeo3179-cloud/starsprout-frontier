'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['action-renderer.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);

function fixture(reducedMotion = false) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length); Object.assign(state, stack.pop()); };
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0);
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  const renderer = Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion,
    time: 0, scale: .65, width: 844, height: 390, camera: { x: 900, y: 700 }, world: { width: 1800, height: 1400 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0 });
  const game = { phase: 'playing', campaign: { awakeningId: 'return-dash' }, player: { x: 900, y: 700, angle: 0, radius: 16, skillCooldown: 0 },
    awakeningState: { returnAnchor: null, field: null, charge: null, relayTimer: 0 }, skillTarget() { return { x: this.player.x, y: this.player.y, radius: 245, remote: false }; } };
  return { renderer, game };
}

test('return marker stays at the original anchor and labels the route as a direction rather than a guaranteed teleport', () => {
  const { renderer: r, game: g } = fixture();
  g.awakeningState.returnAnchor = { x: 720, y: 690, remaining: .7 };
  const before = JSON.stringify(g); r.drawAwakeningFields(g);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[0] === 720 && c.args[1] === 690 && c.args[2] === 17));
  assert.ok(r.calls.some(c => c.key === 'lineTo' && c.args[0] === 720 && c.args[1] === 690));
  assert.ok(r.stormHazardLabels.some(label => label.text === '折返方向 · 0.7s'));
  assert.ok(!r.calls.some(c => c.key === 'fillText'), 'The route caption is deferred above actors');
  assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
});

test('mobile field follows the live player with the exact clearing radius and no damage-zone fill', () => {
  const { renderer: r, game: g } = fixture(); g.campaign.awakeningId = 'mobile-field';
  g.awakeningState.field = { remaining: 1.2, duration: 2.4, radius: 100, captured: 3 };
  for (const [x, y] of [[900, 700], [960, 680]]) {
    g.player.x = x; g.player.y = y; r.calls.length = 0; const before = JSON.stringify(g); r.drawAwakeningFields(g);
    const circles = r.calls.filter(c => c.key === 'arc' && c.args[2] === 100);
    assert.equal(circles.length, 2); assert.ok(circles.every(c => c.args[0] === x && c.args[1] === y));
    assert.ok(Math.abs(circles[1].args[4] - Math.PI / 2) < 1e-9, 'Remaining arc is half a circle');
    assert.equal(r.calls.filter(c => c.key === 'fill' && c.fill === '#536866').length, 3, 'Captured rounds consume three capacity pips');
    assert.equal(r.calls.filter(c => c.key === 'fill').length, 8, 'Only tiny capacity pips fill; the field remains transparent');
    assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
  }
});

test('charged pulse previews current EMP target and both release radii without a duplicate player-centered remote preview', () => {
  const { renderer: r, game: g } = fixture(); g.campaign.awakeningId = 'charged-pulse';
  g.awakeningState.charge = { remaining: .45, duration: .9 };
  for (const target of [{ x: 1150, y: 600, radius: 245, remote: true }, { x: 900, y: 700, radius: 245, remote: false }]) {
    g.skillTarget = () => target; r.calls.length = 0; r.stormHazardLabels = []; r.encounterLabelRects = [];
    r.drawSecretFields(g); r.drawAwakeningFields(g);
    const bounds = r.calls.filter(c => c.key === 'arc' && c.args[2] >= 245);
    assert.equal(bounds.length, 2); assert.deepEqual(bounds.map(c => c.args[2]), [245, 294]);
    assert.ok(bounds.every(c => c.args[0] === target.x && c.args[1] === target.y));
    assert.ok(!r.calls.some(c => c.key === 'fill'), 'No opaque area fill and no older remote EMP filled circle');
    assert.ok(r.stormHazardLabels.some(label => label.text.startsWith(target.remote ? '远端蓄能' : '脉冲蓄能')));
    assert.equal(r.stack.length, 0);
  }
});

test('awakening fields remain static with reduced motion and disappear for ended or intermission states', () => {
  const first = fixture(true), second = fixture(true); second.renderer.time = 99;
  for (const { renderer: r, game: g } of [first, second]) {
    g.awakeningState = { returnAnchor: { x: 760, y: 650, remaining: .4 }, field: { remaining: 1, duration: 2.4, radius: 100, captured: 5 }, charge: { remaining: .3, duration: .9 }, relayTimer: 1.4 };
    r.drawAwakeningFields(g); assert.equal(r.stack.length, 0);
  }
  assert.deepEqual(first.renderer.calls, second.renderer.calls);
  for (const phase of ['ready', 'won', 'lost', 'campaign-rest']) {
    first.game.phase = phase; first.renderer.calls.length = 0; first.renderer.drawAwakeningFields(first.game);
    assert.equal(first.renderer.calls.length, 0);
  }
});

test('awakening feedback obeys shared particle budgets without shake, flash fills, or floating trigger text', () => {
  const { renderer: r } = fixture(true);
  const stages = ['return', 'slide', 'relay-ready', 'relay', 'interrupt', 'field-capture'];
  for (let i = 0; i < 200; i++) for (const stage of stages) r.consume([{ type: 'awakening-trigger', stage, x: 720, y: 690, color: '#8cf5d3' }]);
  assert.ok(r.particles.length <= 420 && r.rings.length <= 20); assert.equal(r.shake, 0); assert.equal(r.numbers.length, 0);
  assert.ok(r.rings.every(ring => !ring.fill));
});

test('awakening audio uses quiet distinct cues, throttles repeated triggers and respects mute', () => {
  const audio = new sandbox.window.FrontierAudio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' }; audio.note = (...args) => sounds.push(['note', ...args]); audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const stage of ['return', 'slide', 'relay-ready', 'relay', 'interrupt', 'field', 'field-capture', 'charge', 'release']) {
    sounds.length = 0; audio.context.currentTime += 1; audio.play('awakening-trigger', stage); assert.ok(sounds.length > 0); signatures.add(JSON.stringify(sounds));
    assert.ok(sounds.every(sound => sound[0] === 'note' ? sound[4] <= .035 : sound[3] <= .025));
    const count = sounds.length; audio.play('awakening-trigger', stage); assert.equal(sounds.length, count);
  }
  assert.equal(signatures.size, 9);
  sounds.length = 0; audio.play('awakening-acquired'); assert.equal(sounds.length, 3);
  audio.enabled = false; sounds.length = 0; audio.context.currentTime += 1;
  audio.play('awakening-trigger', 'charge'); audio.play('awakening-acquired'); assert.equal(sounds.length, 0);
});
