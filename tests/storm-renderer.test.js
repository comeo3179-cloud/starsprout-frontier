'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);
const Renderer = sandbox.window.ExpeditionRenderer;

function renderer(reducedMotion = false) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length > 0); Object.assign(state, stack.pop()); };
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0, 'Nonnegative radius');
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  return Object.assign(Object.create(Renderer.prototype), { ctx, calls, stack, reducedMotion, time: .2, scale: .65, width: 667, height: 375,
    camera: { x: 500, y: 500 }, particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0 });
}

test('tower rendering preserves gameplay and shows its exact capture radius with one light per charge', () => {
  for (const charges of [0, 1, 2, 3]) {
    const r = renderer(), tower = { mode: 'conduction', id: 'coil', x: 500, y: 500, radius: 147, charges, chargeGoal: 3, status: charges === 3 ? 'active' : 'charging', progress: charges / 3 };
    const before = JSON.stringify(tower); r.drawRelay(tower);
    assert.equal(JSON.stringify(tower), before); assert.equal(r.stack.length, 0);
    assert.equal(r.calls.filter(c => c.key === 'fill' && c.fill === '#b9eeff').length, charges);
    assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 147));
    assert.ok(r.calls.some(c => c.key === 'fillText' && String(c.args[0]).includes(`${charges}/3`)));
    if (charges === 3) assert.ok(!r.calls.some(c => c.key === 'fillText' && String(c.args[0]).includes('锁定后')));
  }
});

test('lightning warns at its real damage radius, has a low-opacity fill and does not alter captured position', () => {
  for (const properties of [{ conductionRelayId: 'coil', capturedAtLock: true }, { conductionRelayId: 'coil', capturedAtLock: false }, { backlashId: 44 }]) {
    for (const remaining of [1.35, .7, Number.EPSILON]) {
      const r = renderer(), hazard = { type: 'blast', x: 500, y: 500, radius: 90, duration: 1.35, remaining, ...properties }, before = JSON.stringify(hazard);
      r.drawHazard(hazard); assert.equal(JSON.stringify(hazard), before); assert.equal(r.stack.length, 0);
      assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 90));
      assert.ok(r.calls.some(c => c.key === 'fill' && c.fill === '#ffc88c' && c.alpha <= .11));
      assert.ok(!r.calls.some(c => c.key === 'fillText'), 'Ground warning geometry does not paint text underneath actors');
    }
  }
});

test('resolved lightning has no stale warning and all storm drawings remain static in reduced motion', () => {
  const first = renderer(true), second = renderer(true); second.time = 91;
  for (const r of [first, second]) {
    r.drawRelay({ mode: 'conduction', id: 'coil', x: 500, y: 500, radius: 147, charges: 1, chargeGoal: 3, status: 'charging' });
    const labelCount = r.calls.filter(c => c.key === 'fillText').length;
    r.drawHazard({ type: 'blast', x: 550, y: 500, radius: 90, resolved: true, conductionRelayId: 'coil', capturedAtLock: true });
    assert.equal(r.calls.filter(c => c.key === 'fillText').length, labelCount);
    r.drawEnemy({ id: 9, type: 'boss', variant: 'storm', x: 580, y: 540, radius: 48, hp: 1300, maxHp: 1500, windup: .5, attackKind: 'storm-call' });
    assert.equal(r.stack.length, 0);
  }
  assert.deepEqual(first.calls, second.calls);
});

test('conduction and backlash feedback obey effect budgets and do not add shake or opaque flashes', () => {
  const r = renderer(true);
  for (let i = 0; i < 200; i++) r.consume([{ type: 'conduction-charge', x: 500, y: 500 }, { type: 'boss-backlash', x: 600, y: 500 }]);
  assert.ok(r.particles.length <= 420 && r.rings.length <= 20 && r.numbers.length <= 50);
  assert.ok(r.rings.every(ring => !ring.fill)); assert.equal(r.shake, 0);
});

test('locked lightning text stays above a cargo obstacle while the damage circle stays underneath actors', () => {
  for (const extra of [{ conductionRelayId: 'coil', capturedAtLock: true }, { conductionRelayId: 'coil', capturedAtLock: false }, { backlashId: 44 }]) {
    const r = renderer(true), player = { x: 500, y: 560, hp: 120, maxHp: 120, dashTimer: 0 };
    const game = { map: { id: 'storm' }, world: { width: 1000, height: 1000 }, player,
      hazards: [{ x: 500, y: 500, radius: 90, remaining: .7, duration: 1.35, type: 'blast', ...extra }],
      obstacles: [{ x: 520, y: 393, radius: 38 }], enemies: [] };
    Object.assign(r, { mapId: 'storm', terrainKey: 'storm:1000:1000', world: game.world, lastPlayer: player, lastPosition: { x: player.x, y: player.y },
      dpr: 1, shakeX: 0, shakeY: 0, dashTrailTimer: 0, camera: { x: 500, y: 560 } });
    // Keep the real render pipeline, hazard, cargo geometry and label painter;
    // unrelated terrain/DOM/effect details do not affect this layering boundary.
    for (const method of ['drawTerrain', 'updatePointerHud', 'updateEffects', 'drawVignette']) r[method] = () => {};
    r.drawPlayer = () => { r.ctx.fillStyle = '#player'; r.ctx.fillRect(492, 552, 16, 16); };
    const before = JSON.stringify(game); r.render(game, 0); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
    const circleIndex = r.calls.findIndex(c => c.key === 'fill' && c.fill === '#ffc88c');
    const cargoIndex = r.calls.findLastIndex(c => c.key === 'fill' && c.fill === '#53566f');
    const playerIndex = r.calls.findIndex(c => c.key === 'fillRect' && c.fill === '#player');
    const expectedText = extra.capturedAtLock || extra.backlashId ? '已锁定 · 躲开雷圈' : '落点偏离塔圈';
    const textIndex = r.calls.findIndex(c => c.key === 'fillText' && c.args[0] === expectedText);
    assert.ok(circleIndex >= 0 && cargoIndex >= 0 && playerIndex >= 0 && textIndex >= 0);
    assert.ok(circleIndex < cargoIndex && circleIndex < playerIndex, 'The danger fill must not tint the player or cargo');
    assert.ok(textIndex > cargoIndex && textIndex > playerIndex, 'The locked warning must remain legible over foreground actors');
  }
});
