'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['action-renderer.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);

function fixture(reducedMotion = true) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length); Object.assign(state, stack.pop()); };
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0);
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha, lineWidth: ctx.lineWidth });
    };
  } });
  const r = Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion,
    time: 0, mapId: 'voyage-cosmos', scale: .65, width: 844, height: 390, camera: { x: 850, y: 600 }, world: { width: 1700, height: 1200 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0 });
  return r;
}

test('only armed fields warn at their actual blast radius; captured fields have no hostile area fill', () => {
  const r = fixture(), field = { id: 1, x: 850, y: 600, kind: 'mine', radius: 11, blastRadius: 125, status: 'idle', settleTimer: .3, remaining: 0, duration: 0, friendly: false };
  const game = { battlefield: { props: [], mines: [field] } };
  r.drawBattlefieldWarnings(game); assert.equal(r.calls.length, 0, 'An idle or settling mine does not falsely warn an active blast');
  for (const friendly of [false, true]) {
    Object.assign(field, { status: 'armed', settleTimer: 0, remaining: .325, duration: .65, friendly }); r.calls.length = 0;
    const before = JSON.stringify(game); r.drawBattlefieldWarnings(game);
    assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 125));
    assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 130 && Math.abs(c.args[4] - Math.PI / 2) < 1e-9), 'Half the real fuse has elapsed');
    assert.ok(r.calls.filter(c => c.key === 'stroke').some(c => c.lineWidth * r.scale >= 2));
    const fill = r.calls.filter(c => c.key === 'fill'); assert.equal(fill.length, friendly ? 0 : 1); assert.ok(fill.every(c => c.alpha <= .04));
    assert.ok(!r.calls.some(c => c.key === 'fillText')); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  }
  field.status = 'spent'; r.calls.length = 0; r.drawBattlefieldWarnings(game); r.drawBattlefieldObject(field); assert.equal(r.calls.length, 0);
});

test('capacitor, mine and landing marker remain distinct and neither label nor mutate gameplay', () => {
  const signatures = new Set();
  for (const kind of ['capacitor', 'mine']) {
    const r = fixture(), object = { id: 1, x: 850, y: 600, kind, radius: kind === 'mine' ? 11 : 20, status: 'idle', friendly: true, hp: 50, maxHp: 50, settleTimer: .4 };
    const before = JSON.stringify(object); r.drawBattlefieldObject(object);
    assert.equal(JSON.stringify(object), before); assert.equal(r.stack.length, 0); assert.ok(!r.calls.some(c => c.key === 'fillText')); signatures.add(JSON.stringify(r.calls));
  }
  const r = fixture(), marker = { x: 950, y: 600, radius: 32, remaining: .8, duration: 1.5, type: 'blast', visualOnly: true, engineerLanding: true };
  const before = JSON.stringify(marker); r.drawHazard(marker);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 32)); assert.ok(!r.calls.some(c => ['fill', 'fillText'].includes(c.key)));
  assert.equal(JSON.stringify(marker), before); assert.equal(r.stack.length, 0); signatures.add(JSON.stringify(r.calls)); assert.equal(signatures.size, 3);
});

test('specialists have different silhouettes and shields match the real facing and 120 degree coverage', () => {
  const signatures = new Set();
  for (const type of ['bulwark', 'breacher', 'engineer']) {
    const first = fixture(), second = fixture(); second.time = 77;
    const enemy = { id: 5, type, x: 850, y: 600, radius: 24, hp: 160, maxHp: 160, angle: 0, shieldAngle: .8, shieldOpenTimer: 0, shotAngle: .4, windup: .7, stunTimer: 0 };
    const before = JSON.stringify(enemy); first.drawEnemy(enemy); second.drawEnemy(enemy);
    assert.deepEqual(first.calls, second.calls, 'Reduced motion leaves gameplay tells intact and static');
    assert.ok(!first.calls.some(c => c.key === 'fillText')); assert.equal(JSON.stringify(enemy), before); assert.equal(first.stack.length, 0); signatures.add(JSON.stringify(first.calls));
    if (type === 'bulwark') {
      assert.ok(first.calls.some(c => c.key === 'rotate' && c.args[0] === .8));
      assert.ok(first.calls.some(c => c.key === 'rotate' && c.args[0] === .4), 'The three-shot warning uses the locked shot direction, not the turning shield');
      assert.ok(first.calls.some(c => c.key === 'arc' && c.args[2] === 32 && c.args[3] === -Math.PI / 3 && c.args[4] === Math.PI / 3));
      first.calls.length = 0; enemy.shieldOpenTimer = 1.3; first.drawEnemy(enemy);
      assert.ok(!first.calls.some(c => c.key === 'arc' && c.args[2] === 32 && c.args[3] === -Math.PI / 3));
      assert.ok(first.calls.some(c => c.key === 'fill' && c.fill === '#c9ffdf'), 'The exposed core replaces the closed shield cue');
    }
  }
  assert.equal(signatures.size, 3);
});

test('damaged fragile cover shows a fracture and a real terrain revision invalidates one cached room only once', () => {
  const r = fixture(), rock = { id: 2, x: 810, y: 600, radius: 35, fragile: true, hp: 30, maxHp: 90 };
  const before = JSON.stringify(rock); r.drawRock(rock); assert.equal(JSON.stringify(rock), before);
  assert.ok(r.calls.some(c => c.key === 'stroke' && c.stroke === '#e8cea3')); assert.equal(r.stack.length, 0);
  const game = { phase: 'playing', map: { id: 'voyage-cosmos' }, world: r.world, terrainRevision: 1, player: { x: 850, y: 600, hp: 120, maxHp: 120 },
    obstacles: [rock], enemies: [], voyage: { room: { id: 'v1', biome: 'cosmos', collectors: [], portals: [], exit: null }, effects: {} } };
  Object.assign(r, { lastPlayer: game.player, lastPosition: { ...game.player }, dpr: 1, dashTrailTimer: 0, shakeX: 0, shakeY: 0 });
  for (const name of ['drawTerrain', 'drawPlayer', 'drawObjectivePointers', 'drawVignette', 'updatePointerHud', 'updateEffects']) r[name] = () => {};
  let bakes = 0, rocks = 0; r.makeTerrain = () => bakes++; r.drawRock = () => rocks++;
  r.render(game, 0); r.render(game, 0); assert.equal(bakes, 1); assert.equal(rocks, 2);
  game.obstacles = []; game.terrainRevision++; r.render(game, 0); r.render(game, 0);
  assert.equal(bakes, 2); assert.equal(rocks, 2, 'Removed obstacles cannot leave an actor silhouette'); assert.ok(r.terrainKey.endsWith(':v1')); assert.equal(r.stack.length, 0);
});

test('field chain feedback stays bounded and creates no floating text or opaque flash', () => {
  const r = fixture();
  for (let i = 0; i < 200; i++) r.consume(['field-arm', 'field-capture', 'field-burst', 'cover-break', 'shield-block', 'shield-open', 'breacher-crash'].map(type => ({ type, x: 850, y: 600, radius: 125, friendly: true, angle: 0 })));
  assert.ok(r.particles.length <= 420 && r.rings.length <= 20 && r.arcs.length <= 20 && r.scars.length <= 65);
  assert.equal(r.numbers.length, 0); assert.ok(r.rings.every(ring => !ring.fill)); assert.ok(r.shake <= 1.8);
});

test('battlefield cues are distinct, throttled, and respect the master mute', () => {
  const audio = new sandbox.window.FrontierAudio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' }; audio.note = (...args) => sounds.push(['note', ...args]); audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const kind of ['field-arm', 'field-burst', 'field-capture', 'cover-break', 'shield-block', 'shield-open', 'breacher-crash']) {
    sounds.length = 0; audio.context.currentTime += 1; audio.play(kind, 'mine'); assert.ok(sounds.length); signatures.add(JSON.stringify(sounds));
    const count = sounds.length; audio.play(kind, 'mine'); assert.equal(sounds.length, count);
  }
  assert.equal(signatures.size, 7); sounds.length = 0; audio.context.currentTime += 1; audio.play('field-arm', 'friendly'); const friendly = JSON.stringify(sounds);
  sounds.length = 0; audio.context.currentTime += 1; audio.play('field-arm', 'mine'); assert.notEqual(JSON.stringify(sounds), friendly);
  audio.enabled = false; sounds.length = 0; audio.context.currentTime += 1; audio.play('field-burst', 'friendly'); assert.equal(sounds.length, 0);
});
