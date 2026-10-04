'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);
const Renderer = sandbox.window.ExpeditionRenderer;
const ids = ['assault-chain', 'shotgun-breach', 'piercer-mirror', 'grenade-echo', 'boomerang-twin'];

function renderer(reducedMotion = false) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => Object.assign(state, stack.pop());
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0, 'Nonnegative radius');
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  return Object.assign(Object.create(Renderer.prototype), { ctx, calls, stack, reducedMotion, time: .2, scale: .65, width: 667, height: 375,
    camera: { x: 500, y: 500 }, particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], shake: 0 });
}

test('evolution feedback stays within existing budgets and adds no combat labels, shake or opaque fills', () => {
  const events = [
    ...ids.map(evolutionId => ({ type: 'weapon-evolved', evolutionId, x: 500, y: 500 })),
    ...['primed', 'breach', 'ricochet', 'echo-armed', 'echo', 'twin'].map((stage, i) => ({ type: 'evolution-trigger', evolutionId: ids[Math.min(4, i)], stage, x: 500, y: 500, angle: Math.PI / 2 }))
  ];
  const normal = renderer(), calm = renderer(true);
  normal.consume(events); calm.consume(events);
  assert.ok(normal.particles.length > calm.particles.length && calm.particles.length > 0);
  for (const r of [normal, calm]) {
    assert.equal(r.numbers.length, 0); assert.equal(r.shake, 0); assert.ok(r.rings.every(ring => !ring.fill));
    for (let i = 0; i < 200; i++) r.consume(events);
    assert.ok(r.particles.length <= 420 && r.rings.length <= 20 && r.arcs.length <= 20);
    for (const arc of r.arcs) for (const point of arc.points) assert.ok(point.every(Number.isFinite));
    for (const particle of r.particles) assert.ok([particle.x, particle.y, particle.vx, particle.vy].every(Number.isFinite));
  }
});

test('aftershock warning outlines its actual radius and countdown without filling the blast area or mutating state', () => {
  for (const remaining of [.55, .275, Number.EPSILON]) {
    const r = renderer(true), game = { player: { x: 500, y: 500, weapon: 3 }, evolutionId: 'grenade-echo', evolutionState: { breachTimer: 0, echoes: [{ x: 570, y: 500, radius: 110, remaining, duration: .55 }] } };
    const before = JSON.stringify(game); r.drawEvolutionFields(game);
    assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
    const circles = r.calls.filter(call => call.key === 'arc');
    assert.ok(circles.some(call => call.args[2] === 110));
    assert.ok(circles.every(call => call.args[2] === 110 || call.args[2] === 3), 'Only perimeter and tiny center core');
    assert.equal(r.calls.filter(call => call.key === 'fill').length, 1);
    assert.equal(r.calls.filter(call => call.key === 'fillText').length, 0);
    assert.ok(circles.some(call => Math.abs(call.args[4] - (-Math.PI / 2 + Math.PI * 2 * (1 - remaining / .55))) < 1e-8));
  }
  const expired = renderer(); expired.drawEvolutionFields({ player: {}, evolutionState: { echoes: [{ x: 500, y: 500, radius: 110, remaining: 0, duration: .55 }] } }); assert.equal(expired.calls.length, 0);
});

test('breach ready cue follows current weapon and aim, and disappears immediately on consumption', () => {
  const game = { player: { x: 500, y: 500, weapon: 1, angle: Math.PI / 2 }, evolutionId: 'shotgun-breach', evolutionState: { echoes: [], breachTimer: 2 } };
  const active = renderer(); active.drawEvolutionFields(game);
  assert.ok(active.calls.some(call => call.key === 'rotate' && call.args[0] === Math.PI / 2));
  assert.equal(active.calls.filter(call => call.key === 'lineTo').length, 6); assert.equal(active.stack.length, 0);
  game.player.weapon = 0; const switched = renderer(); switched.drawEvolutionFields(game); assert.equal(switched.calls.length, 0);
  game.player.weapon = 1; game.evolutionState.breachTimer = 0; const spent = renderer(); spent.drawEvolutionFields(game); assert.equal(spent.calls.length, 0);
});

test('evolved projectiles have distinct shapes while keeping enemy bullets and charged-blade precedence intact', () => {
  const kinds = ['normal', 'normal', 'normal', 'grenade', 'boomerang'];
  const draw = properties => { const r = renderer(true); r.drawBullet({ owner: 'player', kind: 'normal', x: 500, y: 500, vx: 800, vy: 0, radius: 3, ...properties }); assert.equal(r.stack.length, 0); return r.calls; };
  for (let i = 0; i < ids.length; i++) {
    const plain = draw({ kind: kinds[i] }), evolved = draw({ kind: kinds[i], evolutionId: ids[i], breach: i === 1 });
    assert.notDeepEqual(evolved, plain, ids[i]);
  }
  assert.notDeepEqual(draw({ evolutionId: 'piercer-mirror' }), draw({ evolutionId: 'piercer-mirror', ricocheted: true }));
  assert.deepEqual(draw({ owner: 'enemy' }), draw({ owner: 'enemy', evolutionId: 'piercer-mirror', ricocheted: true, breach: true }));
  const rebound = draw({ kind: 'boomerang', evolutionId: 'boomerang-twin', rockRebounded: true });
  assert.ok(rebound.some(call => call.fill === '#ffd28e'), 'Hidden rebound still has its gold priority');
});

test('reduced-motion evolved shapes do not animate when only renderer time changes', () => {
  const first = renderer(true), second = renderer(true); second.time = 91;
  const game = { player: { x: 500, y: 500, weapon: 1, angle: 1 }, evolutionId: 'shotgun-breach', evolutionState: { breachTimer: 1, echoes: [{ x: 600, y: 500, radius: 110, remaining: .4, duration: .55 }] } };
  for (const r of [first, second]) {
    r.drawEvolutionFields(game);
    r.drawBullet({ owner: 'player', kind: 'boomerang', evolutionId: 'boomerang-twin', x: 530, y: 500, vx: 800, vy: 0 });
    r.consume([{ type: 'arc', evolutionId: 'assault-chain', x: 500, y: 500, toX: 630, toY: 520, color: '#95ffdf' }]);
  }
  assert.deepEqual(first.calls, second.calls); assert.deepEqual(first.arcs, second.arcs);
});
