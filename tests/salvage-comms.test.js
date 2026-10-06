'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game } = require('../action-engine.js');

// Explicit boundary fixtures isolate timers and queue ownership. These are not
// ordinary-input playthroughs: actors/fields are cleared and the player moves
// directly to the rule boundary; normal public interactions still start work.
function run(options = {}, geometry = false) {
  const game = new Game({ mode: 'salvage', seed: 731, ...options });
  game.start(); game.drainEvents(); game.salvage.pending = [];
  game.enemies = []; game.bullets = []; game.hazards = []; game.pickups = [];
  game.stations = []; game.crates = [];
  if (!geometry) { game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = []; }
  return game;
}
function comms(game) { assert.ok(game.salvage.comms, 'One optional communications station exists'); return game.salvage.comms; }
function position(game, target, dx = 0, dy = 0) { game.player.x = target.x + dx; game.player.y = target.y + dy; }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected); }
function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += 1 / 60)
    game.update(Math.min(1 / 60, seconds - elapsed), input);
}
function start(game) {
  const station = comms(game); position(game, station);
  assert.equal(game.interactionState().target, station); assert.ok(game.interactionState().action);
  assert.equal(game.interact(), true); assert.equal(station.status, 'linking'); return station;
}
function arm(game) { const station = start(game); advance(game, 5); assert.equal(station.status, 'armed'); return station; }

test('communications station has a seeded independent position without altering samples, cargo or finite patrol rules', () => {
  const a = new Game({ mode: 'salvage', seed: 912, random: () => .1 }), b = new Game({ mode: 'salvage', seed: 912, random: () => .9 });
  const station = comms(a); assert.deepEqual(station, comms(b));
  assert.equal(station.type, 'salvage-comms'); assert.equal(station.name, '通讯站');
  assert.equal(station.status, 'idle'); assert.equal(station.progress, 0); assert.equal(station.duration, 5); assert.equal(station.workRadius, 120);
  assert.equal(a.salvage.sources.length, 5); assert.equal(a.salvage.sources.reduce((sum, source) => sum + source.value, 0), 17);
  assert.equal(a.salvage.hotCargo.bonus, 480); assert.equal(a.salvage.pending.length, 8); assert.equal(a.player.skillCooldownMax, 13);
  for (let index = 0; index < 300; index++) a.random();
  assert.deepEqual(station, comms(b)); assert.deepEqual(station, comms(new Game({ mode: 'salvage', seed: 912, difficulty: 'overload' })));
  const positions = new Set([0, 1, 2, 17, 731, 912, 2147483647, 4294967295].map(seed => {
    const item = comms(new Game({ mode: 'salvage', seed })); return item.x + ',' + item.y;
  }));
  assert.ok(positions.size >= 3, 'Seeds offer different optional communications routes');
});

test('boundary seeds keep the communications work circle clear, outside vault EMP range, and reachable from spawn', () => {
  for (const seed of [0, 1, 2, 17, 731, 912, 2147483647, 4294967295]) {
    const game = new Game({ mode: 'salvage', seed }), station = comms(game);
    for (const rock of game.obstacles) assert.ok(Math.hypot(station.x - rock.x, station.y - rock.y) > rock.radius + station.workRadius, 'Clear work circle for seed ' + seed);
    for (const field of game.battlefield.props) assert.ok(Math.hypot(station.x - field.x, station.y - field.y) > field.blastRadius + station.radius, 'No armed field covers the station');
    for (const source of game.salvage.sources) assert.ok(Math.hypot(station.x - source.x, station.y - source.y) > 188, 'Independent E target, not an overlapping vault unlock');
    const step = 40, queue = [[Math.round(game.spawn.x / step), Math.round(game.spawn.y / step)]], reached = new Set([queue[0].join(',')]);
    for (let index = 0; index < queue.length; index++) {
      const [col, row] = queue[index];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = col + dx, r = row + dy, x = c * step, y = r * step, key = c + ',' + r;
        if (reached.has(key) || x < 40 || y < 40 || x > game.world.width - 40 || y > game.world.height - 40 ||
          game.obstacles.some(rock => Math.hypot(x - rock.x, y - rock.y) <= rock.radius + game.player.radius + 2)) continue;
        reached.add(key); queue.push([c, r]);
      }
    }
    assert.ok(queue.some(([c, r]) => Math.hypot(c * step - station.x, r * step - station.y) <= 70), 'A real traversable approach exists for seed ' + seed);
  }
});

test('public E consumes one available EMP using its current cooldown without invoking any combat EMP effects', () => {
  const game = run(), station = comms(game), vault = game.salvage.sources.find(source => source.kind === 'vault');
  Object.assign(vault, { x: station.x + 105, y: station.y });
  const enemy = game.spawnEnemy('crawler', { x: station.x + 70, y: station.y });
  game.bullets.push({ id: game._id(), owner: 'enemy', x: station.x, y: station.y, radius: 4, lifetime: 2, damage: 8 });
  const field = { id: game._id(), kind: 'capacitor', x: station.x + 50, y: station.y, radius: 20, hp: 50, maxHp: 50, status: 'idle', friendly: false };
  game.battlefield.props.push(field); game.player.skillCooldownMax = 7.5;
  const hp = enemy.hp, score = game.score, credits = game.player.credits;
  start(game); near(game.player.skillCooldown, 7.5);
  assert.equal(game.bullets.length, 1); assert.equal(enemy.hp, hp); assert.equal(vault.quietTimer, 0); assert.equal(field.friendly, false);
  assert.equal(game.score, score); assert.equal(game.player.credits, credits); assert.equal(game.salvage.alarm, 0);
  assert.equal(game.interact(), false); near(game.player.skillCooldown, 7.5);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-comms-start').length, 1);
  assert.equal(events.filter(event => ['pulse', 'salvage-vault-unlock', 'field-capture', 'awakening-trigger'].includes(event.type)).length, 0);
});

test('EMP on cooldown cannot begin work and both public and internal actions respect distance and stage guards', () => {
  const game = run(), station = comms(game); position(game, station); game.player.skillCooldown = .5;
  assert.equal(game.interact(), false); assert.equal(game.interactionState().action, ''); assert.match(game.interactionHint(), /EMP/);
  assert.equal(station.status, 'idle'); assert.equal(station.progress, 0); near(game.player.skillCooldown, .5);
  game.player.skillCooldown = 0; position(game, station, 94.01); assert.equal(game.interact(), false); assert.equal(game._interactSalvage(station), false);
  position(game, station, 94); game.phase = 'upgrade'; assert.equal(game.interact(), false); assert.equal(game._interactSalvage(station), false);
  game.phase = 'playing'; assert.equal(game.interact(), true); assert.equal(station.status, 'linking');
});

test('work accumulates only inside its real circle, pauses outside, then arms once after five game seconds', () => {
  const game = run(), station = start(game); position(game, station, station.workRadius);
  advance(game, 2); near(station.progress, 2); assert.equal(station.status, 'linking');
  position(game, station, station.workRadius + .01); advance(game, 1); near(station.progress, 2);
  assert.equal(game.selectSalvageTarget(station.id), true); near(game.salvageTarget().progress, 2); assert.equal(game.salvageTarget().total, 5);
  position(game, station); advance(game, 2.99); assert.equal(station.status, 'linking'); near(station.progress, 4.99);
  advance(game, .01); assert.equal(station.status, 'armed'); near(station.progress, 5);
  assert.notEqual(game.salvageTarget().id, station.id); assert.equal(game.selectSalvageTarget(station.id), false);
  advance(game, 1); assert.equal(game.interact(), false); assert.equal(station.status, 'armed');
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-comms-ready').length, 1);
});

test('communications work permits real weapon fire and never resets the EMP cooldown by repeated E', () => {
  const game = run(), station = start(game), cooldown = game.player.skillCooldown;
  advance(game, .2, { shoot: true, aimX: station.x + 500, aimY: station.y });
  assert.ok(game.bullets.some(bullet => bullet.owner === 'player')); assert.ok(game.player.ammo < game.player.magSize);
  assert.equal(game.interact(), false); near(game.player.skillCooldown, cooldown - .2); near(station.progress, .2);
});

for (const phase of ['ready', 'paused', 'upgrade', 'relic', 'tactic', 'won', 'lost']) test('communications progress and consumed EMP freeze during ' + phase, () => {
  const game = run(), station = start(game); advance(game, .75); game.phase = phase; game.drainEvents();
  const state = JSON.stringify({ comms: station, cooldown: game.player.skillCooldown, alarm: game.salvage.alarm, thresholds: game.salvage.thresholds, pending: game.salvage.pending });
  advance(game, 6); game._finishSalvageStep(.25); game._raiseSalvageAlarm(100);
  assert.equal(game.interact(), false); assert.equal(game._interactSalvage(station), false);
  assert.equal(JSON.stringify({ comms: station, cooldown: game.player.skillCooldown, alarm: game.salvage.alarm, thresholds: game.salvage.thresholds, pending: game.salvage.pending }), state);
  assert.equal(game.drainEvents().length, 0);
});

test('one armed station blocks only the next newly crossed alert wave without reducing alarm, level or later queues', () => {
  const game = run(), station = arm(game); game.drainEvents();
  game._raiseSalvageAlarm(24); assert.equal(station.status, 'armed'); assert.equal(game.salvage.pending.length, 0);
  game._raiseSalvageAlarm(1); assert.equal(station.status, 'spent'); assert.equal(game.salvage.alarm, 25); assert.equal(game.salvage.alertLevel, 2);
  assert.deepEqual(game.salvage.thresholds, [true, false, false]); assert.equal(game.salvage.pending.length, 0);
  let events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-comms-block').length, 1);
  const blocked = events.find(event => event.type === 'salvage-comms-block'); assert.equal(blocked.blocked, 2); assert.equal(blocked.level, 2); assert.equal(blocked.stationId, station.id);
  assert.equal(events.find(event => event.type === 'salvage-alert').blocked, true);
  game._raiseSalvageAlarm(30); assert.equal(game.salvage.alertLevel, 3);
  assert.deepEqual(game.salvage.pending.map(ticket => ticket.reason), ['alert-3', 'alert-3', 'alert-3']);
  game._raiseSalvageAlarm(25); assert.equal(game.salvage.alertLevel, 4); assert.equal(game.salvage.alarm, 80);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'alert-4').length, 4);
  game._raiseSalvageAlarm(100); assert.equal(game.salvage.pending.length, 7);
  events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-comms-block').length, 0);
  assert.ok(events.filter(event => event.type === 'salvage-alert').every(event => !event.blocked));
});

test('a single large alarm jump crosses all three levels while the station skips exactly the first wave', () => {
  const game = run(), station = arm(game); game.drainEvents(); game._raiseSalvageAlarm(100);
  assert.equal(station.status, 'spent'); assert.equal(game.salvage.alarm, 100); assert.equal(game.salvage.alertLevel, 4);
  assert.deepEqual(game.salvage.thresholds, [true, true, true]);
  assert.deepEqual(game.salvage.pending.map(ticket => ticket.reason), ['alert-4', 'alert-4', 'alert-4', 'alert-4', 'alert-3', 'alert-3', 'alert-3']);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-comms-block').length, 1);
  assert.deepEqual(events.filter(event => event.type === 'salvage-alert').map(event => [event.level, !!event.blocked]), [[2, true], [3, false], [4, false]]);
});

test('spent communications cannot restart when the original EMP has fully recharged', () => {
  const game = run(), station = arm(game); game._raiseSalvageAlarm(25); game.salvage.pending = []; advance(game, 8);
  near(game.player.skillCooldown, 0); position(game, station); game.drainEvents();
  assert.equal(game.interact(), false); assert.equal(game._interactSalvage(station), false); assert.equal(game.selectSalvageTarget(station.id), false);
  assert.equal(station.status, 'spent'); near(station.progress, 5); near(game.player.skillCooldown, 0);
  assert.equal(game.drainEvents().length, 0);
});

test('clamped large update steps cannot shortcut the five-second work timer or announce readiness twice', () => {
  const game = run(), station = start(game); game.drainEvents();
  for (let index = 0; index < 19; index++) game.update(.25);
  near(station.progress, 4.75); assert.equal(station.status, 'linking');
  game.update(100); near(station.progress, 5); assert.equal(station.status, 'armed');
  game.update(.25); assert.equal(game.drainEvents().filter(event => event.type === 'salvage-comms-ready').length, 1);
});

test('a station started after the first alert blocks the next threshold rather than revisiting an old wave', () => {
  const game = run(); game._raiseSalvageAlarm(25); game.salvage.spawnTimer = 100;
  const old = [...game.salvage.pending]; arm(game); game.drainEvents();
  game._raiseSalvageAlarm(30); assert.equal(comms(game).status, 'spent'); assert.equal(game.salvage.alertLevel, 3);
  for (const ticket of old) assert.ok(game.salvage.pending.includes(ticket), 'Already queued alert ticket remains intact');
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'alert-3').length, 0);
  assert.equal(game.drainEvents().find(event => event.type === 'salvage-comms-block').blocked, 3);
});

test('alerts during linking remain normal and use the protection only after work has actually completed', () => {
  const game = run(), station = start(game); advance(game, 2); game._raiseSalvageAlarm(25);
  assert.equal(station.status, 'linking'); assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'alert-2').length, 2);
  game.salvage.pending = []; advance(game, 3); assert.equal(station.status, 'armed');
  game._raiseSalvageAlarm(30); assert.equal(station.status, 'spent'); assert.equal(game.salvage.pending.length, 0);
});

test('an actual cargo broadcast on the last linking frame queues its alert before the protection is armed', () => {
  const game = run(), station = start(game), cargo = game.salvage.hotCargo;
  advance(game, 4.99); position(game, cargo); assert.equal(game.interact(), true); position(game, station);
  cargo.pulseRemaining = .005; game.salvage.alarm = 24; game.salvage.spawnTimer = 100; game.drainEvents(); game.update(.02);
  assert.equal(station.status, 'armed'); assert.equal(game.salvage.alarm, 30);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'alert-2').length, 2);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-comms-ready').length, 1);
  assert.equal(events.filter(event => event.type === 'salvage-comms-block').length, 0);
  assert.ok(events.findIndex(event => event.type === 'salvage-alert') < events.findIndex(event => event.type === 'salvage-comms-ready'));
});

test('the final alert exhausted by a real last-frame broadcast expires work before any false armed message', () => {
  const game = run(); game._raiseSalvageAlarm(55); game._raiseSalvageAlarm(24); game.salvage.pending = [];
  const station = start(game), cargo = game.salvage.hotCargo; advance(game, 4.99);
  position(game, cargo); assert.equal(game.interact(), true); position(game, station);
  cargo.pulseRemaining = .005; game.salvage.spawnTimer = 100; game.drainEvents(); game.update(.02);
  assert.equal(station.status, 'expired'); near(station.progress, 4.99); assert.equal(game.salvage.alarm, 85);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'alert-4').length, 4);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-comms-expired').length, 1);
  assert.equal(events.filter(event => ['salvage-comms-ready', 'salvage-comms-block'].includes(event.type)).length, 0);
});

test('a ready station preserves current enemies, old alert tickets, cargo pursuers and evacuation responses', () => {
  const game = run(), station = arm(game), enemy = game.spawnEnemy('crawler', { x: game.player.x + 250, y: game.player.y });
  game._queueSalvage(['engineer'], 'alert-2'); game._queueSalvage(['crawler'], 'patrol'); const old = [...game.salvage.pending];
  const cargo = game.salvage.hotCargo; position(game, cargo); assert.equal(game.interact(), true);
  cargo.pulseRemaining = .01; game.salvage.alarm = 24; game.salvage.spawnTimer = 100; game.update(.02);
  assert.equal(station.status, 'spent'); assert.equal(game.salvage.alarm, 30); assert.ok(game.enemies.includes(enemy));
  for (const ticket of old) assert.ok(game.salvage.pending.includes(ticket));
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'cargo').length, 2);
  position(game, game.salvage.exits[0]); assert.equal(game.interact(), true);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'evac').length, 6);
});

test('blocking an alert preserves the high-alert environmental scan and never grants a safe evacuation', () => {
  const game = run(); game._raiseSalvageAlarm(55); game.salvage.pending = []; arm(game); game.salvage.pending = [];
  game._raiseSalvageAlarm(25); assert.equal(comms(game).status, 'spent'); assert.equal(game.salvage.alertLevel, 4);
  game.salvage.hazardTimer = .01; game.update(.02);
  assert.ok(game.hazards.some(hazard => hazard.salvageScan)); assert.equal(game.salvage.alarm, 80);
});

for (const alreadyStarted of [false, true]) test('exhausted alert thresholds expire ' + (alreadyStarted ? 'unfinished work' : 'an unused station') + ' without a refund or false ready signal', () => {
  const game = run(), station = comms(game); if (alreadyStarted) start(game);
  game.drainEvents(); game._raiseSalvageAlarm(100);
  assert.equal(station.status, 'expired'); assert.equal(game.selectSalvageTarget(station.id), false);
  position(game, station); const cooldown = game.player.skillCooldown;
  assert.equal(game.interact(), false); assert.equal(game._interactSalvage(station), false); near(game.player.skillCooldown, cooldown);
  assert.equal(game.salvage.pending.length, 9); const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'salvage-comms-expired').length, 1);
  assert.equal(events.filter(event => ['salvage-comms-ready', 'salvage-comms-block'].includes(event.type)).length, 0);
  assert.equal(cooldown > 0, alreadyStarted);
});

test('fatal damage on the final work frame takes priority over arming the station', () => {
  const game = run(), station = start(game); advance(game, 4.99); game.player.hp = 1; game.player.invulnerable = 0;
  game._addHazard('blast', game.player.x, game.player.y, 50, .005, 10, { owner: 'enemy', name: '致命边界测试' }); game.drainEvents();
  game.update(.02); assert.equal(game.phase, 'lost'); assert.equal(station.status, 'linking'); near(station.progress, 4.99);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-comms-ready').length, 0);
});

test('ordinary executable sources, exits, supplies and cargo keep their established interaction priority', () => {
  const game = run(), station = comms(game), vault = game.salvage.sources.find(source => source.kind === 'vault');
  position(game, station); Object.assign(vault, { x: station.x, y: station.y, status: 'open', hp: 0 });
  assert.equal(game.interactionState().target, vault); assert.equal(game.interact(), true); assert.equal(station.status, 'idle');
  const crate = { id: game._id(), type: 'crate', x: station.x, y: station.y, radius: 20, opened: false }; game.crates.push(crate);
  assert.equal(game.interactionState().target, crate); assert.equal(game.interact(), true); assert.equal(station.status, 'idle');
  const cargo = game.salvage.hotCargo; Object.assign(cargo, { x: station.x, y: station.y });
  assert.equal(game.interactionState().target, cargo); assert.equal(game.interact(), true); assert.equal(station.status, 'idle');
  const exit = game.salvage.exits[0]; Object.assign(exit, { x: station.x, y: station.y });
  assert.equal(game.interactionState().target, exit); assert.equal(game.interact(), true); assert.equal(station.status, 'idle');
});

test('non-salvage modes and reset cannot inherit a completed communications intervention', () => {
  const game = run(); arm(game); game._raiseSalvageAlarm(25); assert.equal(comms(game).status, 'spent');
  const replacement = game.reset(); assert.equal(replacement.salvage, null); assert.equal(replacement.player.skillCooldown, 0);
  for (const mode of ['expedition', 'trial', 'campaign', 'voyage']) {
    const old = new Game({ mode }); assert.equal(old.salvage, null); assert.equal(old.player.skillCooldown, 0);
  }
});
