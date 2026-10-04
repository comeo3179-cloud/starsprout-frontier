'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['action-renderer.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);

function renderer(reducedMotion = false) {
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
  return Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion, time: 0,
    mapId: 'ruins', scale: .65, width: 844, height: 390, camera: { x: 1600, y: 1200 }, world: { width: 3200, height: 2400 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0 });
}

test('carried crystal follows the current player, dropped crystal stays recoverable, and delivered crystal disappears', () => {
  const r = renderer(true), g = { player: { x: 1600, y: 1200, angle: 0 }, delivery: { cargos: [
    { id: 'c1', x: 100, y: 100, status: 'carried', color: '#ffe3a2' },
    { id: 'c2', x: 1730, y: 1200, status: 'dropped', color: '#ffe3a2' },
    { id: 'c3', x: 1660, y: 1200, status: 'delivered', color: '#ffe3a2' }] } };
  const before = JSON.stringify(g); r.drawDelivery(g);
  assert.ok(r.calls.some(c => c.key === 'translate' && c.args[0] === 1568 && c.args[1] === 1200));
  assert.ok(r.calls.some(c => c.key === 'translate' && c.args[0] === 1730 && c.args[1] === 1200));
  assert.ok(!r.calls.some(c => c.key === 'translate' && c.args[0] === 1660));
  assert.ok(r.stormHazardLabels.some(label => label.text === '回收掉落晶核'));
  assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
});

test('wire and preview display exact engine endpoints without filling the combat area or mutating pin state', () => {
  const r = renderer(), g = { player: { ammo: 3, reloadTimer: 0 }, evolutionId: 'star-bridge',
    starPins: [{ x: 1520, y: 1180, remaining: 5, paired: true }, { x: 1740, y: 1290, remaining: 6, paired: false }],
    starLines: [{ x: 1520, y: 1180, endX: 1740, endY: 1290, remaining: 4, hitIds: [], bridge: true }],
    starlinePreview: () => ({ startX: 1635, startY: 1200, x: 1890, y: 1200, pinX: 1890, pinY: 1200, blocked: false, link: { x: 1740, y: 1290, endX: 1890, endY: 1200 } }) };
  const before = JSON.stringify(g); r.drawStarlineFields(g);
  assert.ok(r.calls.some(c => c.key === 'lineTo' && c.args[0] === 1740 && c.args[1] === 1290));
  assert.ok(r.calls.some(c => c.key === 'lineTo' && c.args[0] === 1890 && c.args[1] === 1200));
  assert.ok(r.calls.some(c => c.key === 'stroke' && c.stroke === '#8ff7db'));
  assert.equal(r.calls.filter(c => c.key === 'fill').length, 4, 'Only two small pin discs and cores fill');
  assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
});

test('cargo pulse warns at the real locked radius and defers readable text above actors', () => {
  const r = renderer(true), hazard = { type: 'blast', x: 1670, y: 1200, radius: 95, duration: 1.4, remaining: .7, cargoPulse: true, color: '#f6c57e' };
  const before = JSON.stringify(hazard); r.drawHazard(hazard);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[0] === 0 && c.args[2] === 95));
  assert.ok(r.stormHazardLabels.some(label => label.text === '晶核锁定 · 离开脉冲圈'));
  assert.ok(!r.calls.some(c => c.key === 'fillText'));
  assert.equal(JSON.stringify(hazard), before); assert.equal(r.stack.length, 0);
});

test('ruins boss, crystal, and wire remain static when reduced motion is enabled', () => {
  const first = renderer(true), second = renderer(true); second.time = 89;
  for (const r of [first, second]) {
    r.drawCargoCrystal(1500, 1200, '#ffe3a2');
    r.drawEnemy({ id: 90, type: 'boss', variant: 'ruins', x: 1740, y: 1200, radius: 50, hp: 2300, maxHp: 3200, windup: .7, attackKind: 'ruins-lattice' });
    r.drawStarlineFields({ player: {}, starPins: [{ x: 1520, y: 1300, remaining: 4 }], starLines: [{ x: 1520, y: 1300, endX: 1750, endY: 1300, remaining: 2 }] });
    assert.equal(r.stack.length, 0);
  }
  assert.deepEqual(first.calls, second.calls);
});

test('cargo and wire feedback respect shared caps without extra camera shake or opaque flashes', () => {
  const r = renderer(true);
  for (let i = 0; i < 200; i++) r.consume(['cargo-picked', 'cargo-dropped', 'cargo-delivered', 'star-pin', 'starline-created', 'starline-trigger'].map(type => ({ type, x: 1600, y: 1200, endX: 1800, endY: 1200 })));
  assert.ok(r.particles.length <= 420 && r.rings.length <= 20 && r.arcs.length <= 20);
  assert.equal(r.shake, 0); assert.equal(r.numbers.length, 0); assert.ok(r.rings.every(ring => !ring.fill));
});

test('new cues are distinct, bounded, throttled, and respect mute', () => {
  const audio = new sandbox.window.FrontierAudio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' }; audio.note = (...args) => sounds.push(['note', ...args]); audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const kind of ['cargo-picked', 'cargo-dropped', 'cargo-delivered', 'star-pin', 'starline-created', 'starline-trigger']) {
    sounds.length = 0; audio.context.currentTime += 1; audio.play(kind); assert.ok(sounds.length > 0); signatures.add(JSON.stringify(sounds));
    assert.ok(sounds.every(sound => sound[0] === 'note' ? sound[4] <= .04 : sound[3] <= .025));
    const count = sounds.length; audio.play(kind); assert.equal(sounds.length, count);
  }
  assert.equal(signatures.size, 6); sounds.length = 0; audio.play('shot', 5); assert.equal(sounds.length, 3);
  audio.enabled = false; sounds.length = 0; audio.context.currentTime += 1; audio.play('cargo-delivered'); audio.play('shot', 5); assert.equal(sounds.length, 0);
});
