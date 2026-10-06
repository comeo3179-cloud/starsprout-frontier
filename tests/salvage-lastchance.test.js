'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game } = require('../action-engine.js');

// Boundary fixtures isolate optional cargo, timers and queue ownership. They
// position the player and clear danger; they do not claim natural playthroughs.
function run(seed = 731, geometry = false) {
  const game = new Game({ mode: 'salvage', seed }); game.start(); game.drainEvents();
  game.enemies = []; game.bullets = []; game.hazards = []; game.pickups = [];
  game.salvage.pending = []; game.salvage.spawnTimer = 1e6;
  if (!geometry) { game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = []; game.stations = []; game.crates = []; }
  return game;
}
function position(game, target, dx = 0) { game.player.x = target.x + dx; game.player.y = target.y; }
function call(game, index = 0) {
  const exit = game.salvage.exits[index]; position(game, exit); assert.equal(game.interact(), true);
  assert.ok(game.salvage.lastChance, 'Calling an exit creates one optional cargo opportunity'); return game.salvage.lastChance;
}
function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += 1 / 60)
    game.update(Math.min(1 / 60, seconds - elapsed), input);
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected); }
function collect(game, cargo) { position(game, cargo); assert.equal(game.interactionState().target, cargo); assert.equal(game.interact(), true); }

test('no last-chance target or danger exists until the first real extraction call', () => {
  const game = run(); assert.equal(game.salvage.lastChance, null); assert.equal(game.salvage.sources.length, 5);
  assert.equal(game.salvage.sources.reduce((sum, source) => sum + source.value, 0), 17);
  assert.equal(game._salvageTargets().some(target => target.type === 'salvage-lastchance'), false);
  const cargo = call(game); assert.equal(cargo.type, 'salvage-lastchance'); assert.equal(cargo.name, '应急货箱');
  assert.equal(cargo.status, 'available'); assert.equal(cargo.value, 4); assert.equal(cargo.duration, 18); assert.equal(cargo.remaining, 18);
  assert.equal(game.salvage.pending.length, 6); assert.ok(game.salvage.pending.every(ticket => ticket.reason === 'evac'));
  assert.equal(game.salvage.alarm, 0); assert.equal(game.salvage.selectedId, game.salvage.exits[0].id);
  const event = game.drainEvents().find(value => value.type === 'salvage-lastchance-appear');
  assert.ok(event); assert.equal(event.sourceId, cargo.id); assert.equal(event.value, 4); assert.equal(event.remaining, 18);
});

test('same seed and extraction side reproduce the detour without consuming combat randomness or moving old targets', () => {
  const a = run(912, true), b = run(912, true), original = JSON.stringify({ sources: a.salvage.sources, cargo: a.salvage.hotCargo, comms: a.salvage.comms, exits: a.salvage.exits, rocks: a.obstacles });
  const cargo = call(a), second = call(b); assert.deepEqual(cargo, second);
  assert.equal(JSON.stringify({ sources: a.salvage.sources, cargo: a.salvage.hotCargo, comms: a.salvage.comms, exits: a.salvage.exits, rocks: a.obstacles }), original);
  const uncalled = run(912, true); for (let i = 0; i < 100; i++) assert.equal(a.random(), uncalled.random());
  const positions = new Set([0, 1, 2, 17, 731, 912, 2147483647, 4294967295].map(seed => { const c = call(run(seed, true)); return c.x + ',' + c.y; }));
  assert.ok(positions.size >= 3, 'Seed changes optional route choices');
});

test('both exits across 256 seeds offer an outside-circle cargo with a clear real walking approach and independent E range', () => {
  for (let seed = 0; seed < 256; seed++) for (const side of [0, 1]) {
    const game = run(seed, true), exit = game.salvage.exits[side], cargo = call(game, side), gap = Math.hypot(cargo.x - exit.x, cargo.y - exit.y);
    assert.ok(gap > exit.radius + 94, 'Cargo requires leaving the extraction circle for seed ' + seed + '/' + side);
    assert.ok(gap < 500, 'Detour stays nearby');
    for (const target of [...game.salvage.sources, ...game.salvage.exits, game.salvage.hotCargo, game.salvage.comms, ...game.stations, ...game.crates])
      assert.ok(Math.hypot(cargo.x - target.x, cargo.y - target.y) > (target.type === 'salvage-exit' ? target.radius + 94 : 188), 'No competing E target seed ' + seed + '/' + side);
    for (const field of game.battlefield.props) assert.ok(Math.hypot(cargo.x - field.x, cargo.y - field.y) > field.blastRadius + cargo.radius);
    const steps = Math.ceil(gap / 5), dx = (cargo.x - exit.x) / steps, dy = (cargo.y - exit.y) / steps;
    for (let step = 0; step < steps; step++) game._move(game.player, dx, dy);
    near(game.player.x, cargo.x); near(game.player.y, cargo.y);
    assert.equal(game.interactionState().target, cargo);
  }
});

test('E collects four samples once, preserves all previous tickets and adds only two advertised pursuit enemies', () => {
  const game = run(), cargo = call(game); game.salvage.pending.push({ type: 'crawler', reason: 'patrol' }, { type: 'tank', reason: 'alert-4' });
  const previous = game.salvage.pending.map(ticket => ({ ...ticket })); game.salvage.comms.status = 'armed'; game.salvage.alarm = 54;
  game.salvage.thresholds[0] = true; game.salvage.alertLevel = 2;
  const speed = game.player.speed, score = game.score, credits = game.player.credits, cooldown = game.player.skillCooldown;
  collect(game, cargo); assert.equal(cargo.status, 'collected'); assert.equal(game.salvage.carried, 4);
  assert.deepEqual(game.salvage.pending.filter(ticket => ticket.reason === 'lastchance'), [{ type: 'charger', reason: 'lastchance' }, { type: 'spitter', reason: 'lastchance' }]);
  assert.deepEqual(game.salvage.pending.filter(ticket => ticket.reason !== 'lastchance'), previous);
  assert.equal(game.salvage.alarm, 54); assert.equal(game.salvage.comms.status, 'armed');
  assert.equal(game.player.speed, speed); assert.equal(game.player.skillCooldown, cooldown); assert.equal(game.score, score); assert.equal(game.player.credits, credits);
  assert.equal(game._interactSalvage(cargo), false); assert.equal(game.interact(), false); assert.equal(game.salvage.carried, 4);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-lastchance-collected').length, 1);
  game._raiseSalvageAlarm(1); assert.equal(game.salvage.comms.status, 'spent');
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'lastchance').length, 2);
  assert.equal(game.salvage.pending.some(ticket => ticket.reason === 'alert-3'), false, 'Communications still intercepts the next actual alert only');
});

test('available cargo is explicitly trackable and has a reward and countdown, then falls back to the called exit after pickup', () => {
  const game = run(), cargo = call(game); assert.equal(game.selectSalvageTarget(cargo.id), true);
  const target = game.salvageTarget(); assert.equal(target.id, cargo.id); assert.equal(target.kind, 'lastchance');
  assert.equal(target.total, 18); assert.equal(target.progress, 0); assert.match(target.hint, /320|4/); assert.match(target.hint, /18/);
  collect(game, cargo); assert.equal(game.salvageTarget().id, game.salvage.evac.exitId); assert.equal(game.selectSalvageTarget(cargo.id), false);
});

test('available countdown expires exactly once, cannot be collected at zero, and does not spawn danger for an ignored opportunity', () => {
  const game = run(), cargo = call(game); position(game, cargo, 110); assert.equal(game.selectSalvageTarget(cargo.id), true);
  const pending = game.salvage.pending.map(ticket => ({ ...ticket })); advance(game, 17.99); near(cargo.remaining, .01); assert.equal(cargo.status, 'available');
  advance(game, .01); assert.equal(cargo.remaining, 0); assert.equal(cargo.status, 'expired'); assert.equal(game.salvage.carried, 0);
  assert.equal(game.salvageTarget().id, game.salvage.evac.exitId); assert.equal(game.selectSalvageTarget(cargo.id), false);
  position(game, cargo); assert.equal(game._interactSalvage(cargo), false); assert.equal(game.interact(), false);
  advance(game, 2); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-lastchance-expired').length, 1);
  assert.deepEqual(game.salvage.pending, pending); assert.equal(game.salvage.alarm, 0);
});

for (const phase of ['ready', 'paused', 'upgrade', 'relic', 'tactic', 'won', 'lost']) test('opportunity timer and pickup freeze during ' + phase, () => {
  const game = run(), cargo = call(game); position(game, cargo); advance(game, .5); game.phase = phase; const time = cargo.remaining;
  advance(game, 3); near(cargo.remaining, time); assert.equal(game.interactionState().action, ''); assert.equal(game.interact(), false); assert.equal(game._interactSalvage(cargo), false);
  assert.equal(cargo.status, 'available'); assert.equal(game.salvage.carried, 0);
});

test('remaining-positive boundary and 94px E range are honored without remote or stale object pickup', () => {
  const game = run(), cargo = call(game); position(game, cargo, 94.01); assert.equal(game._interactSalvage(cargo), false);
  position(game, cargo, 94); assert.equal(game._interactSalvage({ ...cargo }), false); cargo.remaining = 0; assert.equal(game._interactSalvage(cargo), false);
  cargo.remaining = .00001; assert.equal(game._interactSalvage(cargo), true); assert.equal(game.salvage.carried, 4);
});

test('cargo already collected freezes its timer and cannot be re-rolled by either extraction site', () => {
  const game = run(), cargo = call(game), events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-lastchance-appear').length, 1);
  collect(game, cargo); const remaining = cargo.remaining; position(game, cargo, 110); advance(game, 19); assert.equal(cargo.remaining, remaining);
  for (const exit of game.salvage.exits) { position(game, exit); assert.equal(game.interact(), false); }
  assert.equal(game.salvage.lastChance, cargo); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-lastchance-appear').length, 0);
});

for (const side of [0, 1]) test('optional cargo alone banks 320 only after real boarding at extraction side ' + side, () => {
  const game = run(), cargo = call(game, side), exit = game.salvage.exits[side]; collect(game, cargo); assert.equal(game.salvage.bonus, 0);
  position(game, exit); advance(game, exit.arrivalDuration + 2.99); assert.equal(game.phase, 'playing'); assert.equal(game.salvage.bonus, 0);
  advance(game, .01); assert.equal(game.phase, 'won'); assert.equal(game.salvage.status, 'extracted'); assert.equal(game.salvage.settled, 4); assert.equal(game.salvage.bonus, 320);
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.pending.length, 0); assert.equal(game._interactSalvage(cargo), false);
});

test('ignoring the new opportunity preserves empty safe withdrawal and the original extraction duration', () => {
  const game = run(), cargo = call(game), exit = game.salvage.exits[0]; position(game, exit); advance(game, 13);
  assert.equal(game.phase, 'won'); assert.equal(game.salvage.status, 'withdrawn'); assert.equal(game.salvage.bonus, 0); assert.equal(game.salvage.settled, 0);
  assert.equal(game._salvageTargets().length, 0); assert.equal(game._interactSalvage(cargo), false);
});

test('dying while carrying optional cargo loses those samples and pays no bonus', () => {
  const game = run(), cargo = call(game); collect(game, cargo); game.player.hp = 1; game.player.invulnerable = 0;
  assert.equal(game._damagePlayer(100, { kind: 'hazard', name: 'Boundary fixture' }), true);
  assert.equal(game.phase, 'lost'); assert.equal(game.salvage.status, 'failed'); assert.equal(game.salvage.lostSamples, 4); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.bonus, 0);
});

test('same-frame fatal damage wins over the final boarding fraction with optional cargo', () => {
  const game = run(), cargo = call(game), exit = game.salvage.exits[0]; collect(game, cargo); position(game, exit); advance(game, 12.99);
  game.player.hp = 1; game.player.invulnerable = 0;
  game._addHazard('blast', game.player.x, game.player.y, 90, .01, 100, { owner: 'environment' }); advance(game, .01);
  assert.equal(game.phase, 'lost'); assert.equal(game.salvage.lostSamples, 4); assert.equal(game.salvage.bonus, 0);
});

test('a large requested frame keeps normal update clamp while internal timer overshoot expires once', () => {
  const game = run(), cargo = call(game); position(game, cargo, 110); game.update(100); near(cargo.remaining, 17.75);
  game._updateSalvage(100); assert.equal(cargo.remaining, 0); assert.equal(cargo.status, 'expired');
  game._updateSalvage(100); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-lastchance-expired').length, 1);
});

test('a deadline-zero cargo is not trackable even before the next frame expires its status', () => {
  const game = run(), cargo = call(game); cargo.remaining = 0;
  assert.equal(game.selectSalvageTarget(cargo.id), false); assert.equal(game.salvageTarget().id, game.salvage.evac.exitId);
});

test('a player already at zero health cannot claim cargo even before a terminal phase transition', () => {
  const game = run(), cargo = call(game); position(game, cargo); game.player.hp = 0;
  assert.equal(game._interactSalvage(cargo), false); assert.equal(game.salvage.carried, 0); assert.equal(cargo.status, 'available');
});

test('no safe dynamic placement skips the optional offer rather than creating a blocked ghost or preventing evacuation', () => {
  const game = run(); game.obstacles = [{ x: 260, y: 1650, radius: 800 }]; position(game, game.salvage.exits[0]);
  assert.equal(game.interact(), true); assert.equal(game.salvage.lastChance, null); assert.ok(game.salvage.evac);
  assert.equal(game.drainEvents().some(event => event.type === 'salvage-lastchance-appear'), false);
});
