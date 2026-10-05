'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, MAPS, WEAPONS, SALVAGE_DIFFICULTIES, SALVAGE_MAP } = require('../action-engine.js');

// Explicit boundary fixtures isolate timing/collision/ownership. These are not
// ordinary-input playthroughs: actors, obstacles and pending tickets may be
// cleared, and the player is positioned at the boundary under investigation.
function salvage(options = {}, keepPatrol = false) {
  const game = new Game({ mode: 'salvage', seed: 731, ...options });
  assert.equal(game.mode, 'salvage', 'The new mode is accepted explicitly');
  assert.ok(game.salvage, 'The mode exposes its agreed runtime state');
  game.start(); game.drainEvents();
  if (!keepPatrol) game.salvage.pending = [];
  game.enemies = []; game.hazards = []; game.bullets = []; game.pickups = []; game.stations = [];
  return game;
}
function clearGeometry(game) {
  game.obstacles = [];
  if (game.battlefield) { game.battlefield.props = []; game.battlefield.mines = []; }
  return game;
}
function source(game, kind, index = 0) {
  const value = game.salvage.sources.filter(item => item.kind === kind)[index];
  assert.ok(value, 'Real ' + kind + ' source ' + index); return value;
}
function position(game, target, dx = 0, dy = 0) { game.player.x = target.x + dx; game.player.y = target.y + dy; }
function near(actual, expected, epsilon = 1e-7) { assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`); }
function advance(game, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += 1 / 60) game.update(Math.min(1 / 60, seconds - elapsed), input);
}
function bullet(game, target, extra = {}) {
  const value = { id: game._id(), owner: 'player', kind: 'assault', weapon: 0, x: target.x - 100, y: target.y,
    vx: 800, vy: 0, radius: 4, age: 0, lifetime: 1, damage: 90, pierce: 0, hitIds: [], color: '#78fbd6', ...extra };
  game.bullets.push(value); return value;
}
function collectVault(game, index = 0) {
  const vault = source(game, 'vault', index);
  game._damageSalvageSource(vault, 90); position(game, vault, 50);
  assert.equal(game.interact(), true); assert.equal(vault.status, 'collected'); return vault;
}
function call(game, exit = game.salvage.exits[0]) {
  position(game, exit); assert.equal(game.interact(), true);
  assert.equal(game.salvage.evac.exitId, exit.id); return exit;
}
function waitToBoard(game) {
  // Explicit quiet-timing fixture after real ship call: reinforcement tickets
  // are tested separately, rather than shielding or buffing this player.
  game.salvage.pending = []; game.enemies = [];
  advance(game, 10.05);
  assert.equal(game.salvage.status, 'boarding');
}

test('salvage exports two difficulties and a separate map without changing old map and weapon identities', () => {
  assert.deepEqual(SALVAGE_DIFFICULTIES.map(item => item.id), ['normal', 'overload']);
  assert.ok(SALVAGE_MAP && SALVAGE_MAP.name);
  assert.deepEqual(MAPS.map(item => item.id), ['frontier', 'foundry', 'frost', 'storm', 'ruins']);
  assert.deepEqual(WEAPONS.map(item => item.id), ['assault', 'shotgun', 'piercer', 'grenade', 'boomerang', 'starline']);
});

test('salvage initializes five independent sources, two exits and eight finite patrol tickets', () => {
  const game = salvage({}, true), state = game.salvage;
  assert.deepEqual(game.world, { width: 2600, height: 1900 });
  near(game.spawn.x, 350); near(game.spawn.y, 1580);
  assert.equal(state.status, 'exploring');
  for (const name of ['carried', 'settled', 'lostSamples', 'bonus', 'alarm']) assert.equal(state[name], 0, name);
  assert.equal(state.alertLevel, 1); assert.equal(state.evac, null);
  assert.equal(state.sources.length, 5); assert.equal(state.exits.length, 2); assert.equal(state.pending.length, 8);
  assert.equal(state.sources.filter(item => item.kind === 'vault').length, 2);
  assert.equal(state.sources.filter(item => item.kind === 'drill').length, 2);
  assert.equal(state.sources.filter(item => item.kind === 'drone').length, 1);
  assert.equal(state.sources.reduce((sum, item) => sum + item.value, 0), 17);
  assert.equal(game.relays.length + game.contracts.length + game.encounters.length, 0);
  assert.equal(game.voyage, null); assert.equal(game.trial, null); assert.equal(game.campaign, null);
});

test('same seed keeps source and cover geometry independent from combat random values', () => {
  const a = salvage({ seed: 912, random: () => .1 }), b = salvage({ seed: 912, random: () => .9 });
  const geometry = game => ({ sources: game.salvage.sources.map(item => ({ kind: item.kind, x: item.x, y: item.y, path: item.path })),
    exits: game.salvage.exits.map(item => ({ x: item.x, y: item.y })), rocks: game.obstacles.map(item => ({ x: item.x, y: item.y, radius: item.radius, fragile: item.fragile })) });
  assert.deepEqual(geometry(a), geometry(b));
  for (let index = 0; index < 300; index++) a.random();
  assert.deepEqual(geometry(a), geometry(b));
});

test('protected source and exit circles remain outside cover and armed-field blast placement', () => {
  const game = salvage();
  for (const target of [...game.salvage.sources, ...game.salvage.exits, { ...game.spawn, radius: game.player.radius }]) {
    for (const rock of game.obstacles) assert.ok(Math.hypot(target.x - rock.x, target.y - rock.y) >= (target.radius || 0) + rock.radius, 'No protected target is inside a rock');
  }
  for (const field of game.battlefield.props) for (const item of game.salvage.sources) assert.ok(Math.hypot(field.x - item.x, field.y - item.y) > field.blastRadius + item.radius);
});

test('overload scales ordinary enemies while preserving source health and finite ticket counts', () => {
  const a = clearGeometry(salvage()), b = clearGeometry(salvage({ difficulty: 'overload' }));
  const first = a.spawnEnemy('crawler', { x: 900, y: 900 }), second = b.spawnEnemy('crawler', { x: 900, y: 900 });
  near(second.damage, first.damage * 1.12); assert.equal(second.maxHp, Math.round(first.maxHp * 1.2));
  assert.deepEqual(a.salvage.sources.map(item => [item.kind, item.hp, item.value]), b.salvage.sources.map(item => [item.kind, item.hp, item.value]));
  assert.equal(a.salvage.pending.length, b.salvage.pending.length);
});

test('locked vault cannot be collected until an actual unlock or damage opens it', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault');
  position(game, vault, 50);
  assert.equal(vault.hp, 90); assert.equal(vault.status, 'locked'); assert.equal(vault.quietTimer, 0);
  assert.equal(game.interact(), false); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.alarm, 0);
});

test('actual EMP quietly unlocks a near vault for four seconds and one collection raises alarm by five', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, 50);
  assert.equal(game.useSkill(), true); near(vault.quietTimer, 4); assert.equal(vault.hp, 90);
  assert.equal(game.interact(), true); assert.equal(game.salvage.carried, 3); assert.equal(game.salvage.alarm, 5);
  assert.equal(game.interact(), false); assert.equal(game.salvage.carried, 3); assert.equal(game.salvage.alarm, 5);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-collected').length, 1);
});

test('quiet vault window really expires and does not automatically bank its samples', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, 50);
  assert.equal(game.useSkill(), true); advance(game, 3.9); assert.ok(vault.quietTimer > 0);
  advance(game, .2); assert.equal(vault.quietTimer, 0);
  assert.equal(game.interact(), false); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.alarm, 0);
});

test('vault EMP uses its actual origin, a one-hundred-ten range and clear line of sight', () => {
  for (const scenario of ['near', 'outside', 'blocked']) {
    const game = clearGeometry(salvage()), vault = source(game, 'vault');
    position(game, vault, scenario === 'outside' ? 110.01 : 109.99);
    if (scenario === 'blocked') game.obstacles.push({ id: game._id(), type: 'rock', x: vault.x + 55, y: vault.y, radius: 20 });
    assert.equal(game.useSkill(), true);
    assert.equal(vault.quietTimer > 0, scenario === 'near');
  }
});

test('real bullets break a vault lock once and do not create enemy kill score or XP', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault');
  const score = game.score, xp = game.player.xp;
  bullet(game, vault); game._updateBullets(.2);
  assert.equal(vault.status, 'open'); assert.equal(game.salvage.alarm, 18);
  assert.equal(game.score, score); assert.equal(game.player.xp, xp); assert.equal(game.kills, 0);
  bullet(game, vault); game._updateBullets(.2);
  assert.equal(game.salvage.alarm, 18);
  position(game, vault, 50); assert.equal(game.interact(), true);
  assert.equal(game.salvage.carried, 3); assert.equal(game.salvage.alarm, 18);
});

test('solid cover blocks a swept shot before the vault lock', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault');
  game.obstacles.push({ id: game._id(), type: 'rock', x: vault.x - 55, y: vault.y, radius: 20 });
  bullet(game, vault); game._updateBullets(.2);
  assert.equal(vault.hp, 90); assert.equal(vault.status, 'locked'); assert.equal(game.salvage.alarm, 0);
});

test('EMP cannot retroactively make a shot-broken vault quiet or refund its alarm', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault');
  game._damageSalvageSource(vault, 90); position(game, vault, 50);
  assert.equal(game.useSkill(), true); assert.equal(vault.quietTimer, 0); assert.equal(game.salvage.alarm, 18);
  assert.equal(game.interact(), true); assert.equal(game.salvage.alarm, 18); assert.equal(game.salvage.carried, 3);
});

test('drill starts once, queues six tickets and advances only inside its work circle', () => {
  const game = clearGeometry(salvage()), drill = source(game, 'drill'); position(game, drill, 50);
  assert.equal(game.interact(), true); assert.equal(drill.status, 'drilling'); assert.equal(game.salvage.alarm, 8);
  assert.equal(game.salvage.pending.length, 6);
  assert.equal(game.interact(), false); assert.equal(game.salvage.pending.length, 6);
  game.salvage.pending = [];
  advance(game, 2); near(drill.progress, 2);
  position(game, drill, 151); advance(game, 2); near(drill.progress, 2);
  position(game, drill, 149); advance(game, 5.9); assert.equal(drill.status, 'drilling');
  advance(game, .2); assert.equal(drill.status, 'collected'); assert.equal(game.salvage.carried, 4); assert.equal(game.salvage.alarm, 16);
  advance(game, 1); assert.equal(game.salvage.carried, 4); assert.equal(game.salvage.alarm, 16);
});

test('both drills can run independently without replacing one another or sharing progress', () => {
  const game = clearGeometry(salvage()), a = source(game, 'drill', 0), b = source(game, 'drill', 1);
  position(game, a); assert.equal(game.interact(), true); game.salvage.pending = [];
  advance(game, 1); near(a.progress, 1);
  position(game, b); assert.equal(game.interact(), true); game.salvage.pending = [];
  advance(game, 1); near(a.progress, 1); near(b.progress, 1);
  assert.equal(a.status, 'drilling'); assert.equal(b.status, 'drilling');
});

test('drill is not a destructible bullet blocker', () => {
  const game = clearGeometry(salvage()), drill = source(game, 'drill');
  const enemy = game.spawnEnemy('crawler', { x: drill.x + 90, y: drill.y });
  enemy.hp = enemy.maxHp = 500;
  bullet(game, drill, { damage: 100 }); game._updateBullets(.3);
  near(enemy.hp, 400); assert.equal(drill.status, 'idle'); assert.equal(game.salvage.alarm, 0);
});

test('drone follows its real path at eighty units per second and selection follows it', () => {
  const game = clearGeometry(salvage()), drone = source(game, 'drone');
  assert.equal(game.selectSalvageTarget(drone.id), true);
  const before = { x: drone.x, y: drone.y }; advance(game, .5);
  near(Math.hypot(drone.x - before.x, drone.y - before.y), 40);
  const target = game.salvageTarget(); assert.equal(target.id, drone.id); near(target.x, drone.x); near(target.y, drone.y);
});

test('real projectile destroys drone into stationary open cargo without automatic XP pickup', () => {
  const game = clearGeometry(salvage()), drone = source(game, 'drone');
  const score = game.score, xp = game.player.xp;
  bullet(game, drone); game._updateBullets(.2);
  assert.equal(drone.status, 'open'); assert.equal(game.salvage.alarm, 12);
  const point = { x: drone.x, y: drone.y }; position(game, drone, 20); advance(game, .5);
  near(drone.x, point.x); near(drone.y, point.y);
  assert.equal(game.salvage.carried, 0); assert.equal(game.score, score); assert.equal(game.player.xp, xp); assert.equal(game.kills, 0);
  assert.equal(game.interact(), true); assert.equal(game.salvage.carried, 3);
  assert.equal(game.interact(), false); assert.equal(game.salvage.carried, 3);
});

test('alarm thresholds fire once even for a single jump through all three levels', () => {
  const game = salvage(); game._raiseSalvageAlarm(100);
  assert.equal(game.salvage.alarm, 100); assert.equal(game.salvage.alertLevel, 4); assert.equal(game.salvage.pending.length, 9);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-alert').length, 3);
  game._raiseSalvageAlarm(100);
  assert.equal(game.salvage.alarm, 100); assert.equal(game.salvage.pending.length, 9);
  assert.equal(game.drainEvents().filter(event => event.type === 'salvage-alert').length, 0);
});

test('failed generated spawn retains its pending patrol ticket then retries successfully', () => {
  const game = clearGeometry(salvage({}, true)), spawnPoint = game._salvageSpawnPoint;
  const spawned = [], spawnEnemy = game.spawnEnemy;
  game.spawnEnemy = function(type, point) {
    const enemy = spawnEnemy.call(this, type, point);
    if (enemy) spawned.push({ x: enemy.x, y: enemy.y, playerX: this.player.x, playerY: this.player.y });
    return enemy;
  };
  const count = game.salvage.pending.length;
  game._salvageSpawnPoint = () => null;
  advance(game, 3.5); assert.equal(game.salvage.pending.length, count); assert.equal(game.salvage.spawned, 0);
  game._salvageSpawnPoint = spawnPoint;
  advance(game, 2); assert.ok(game.salvage.pending.length < count); assert.ok(game.salvage.spawned > 0);
  assert.ok(spawned.length > 0);
  for (const enemy of spawned) assert.ok(Math.hypot(enemy.x - enemy.playerX, enemy.y - enemy.playerY) >= 260, 'The actual spawn instant respects player clearance');
});

test('fourteen living enemies do not consume a queued ticket until a real slot opens', () => {
  const game = clearGeometry(salvage({}, true));
  for (let index = 0; index < 14; index++) assert.ok(game.spawnEnemy('crawler', { x: 1300 + index * 30, y: 1100 }));
  const count = game.salvage.pending.length;
  game.salvage.spawnTimer = 0; game.update(.25);
  assert.equal(game.salvage.pending.length, count); assert.equal(game.salvage.spawned, 0);
  game._damageEnemy(game.enemies[0], 1e6);
  advance(game, 2);
  assert.ok(game.salvage.spawned > 0); assert.ok(game.enemies.filter(enemy => enemy.hp > 0).length <= 14);
});

test('source E has priority over overlapping exit and one press cannot both collect and call', () => {
  const game = clearGeometry(salvage()), exit = game.salvage.exits[0], vault = source(game, 'vault');
  vault.x = exit.x; vault.y = exit.y; position(game, exit);
  assert.equal(game.interact(), false); assert.equal(game.salvage.evac, null);
  assert.equal(game.useSkill(), true);
  assert.equal(game.interact(), true); assert.equal(vault.status, 'collected'); assert.equal(game.salvage.carried, 3);
  assert.equal(game.salvage.evac, null);
  assert.equal(game.interact(), true); assert.equal(game.salvage.evac.exitId, exit.id);
});

test('ship call is once-only, fixed to its selected exit and adds six finite reinforcement tickets', () => {
  const game = clearGeometry(salvage()), exit = call(game);
  assert.equal(game.salvage.status, 'approaching'); assert.equal(game.salvage.pending.length, 6);
  assert.deepEqual({ remaining: game.salvage.evac.remaining, progress: game.salvage.evac.progress, duration: game.salvage.evac.duration, boardingDuration: game.salvage.evac.boardingDuration },
    { remaining: 10, progress: 0, duration: 10, boardingDuration: 3 });
  assert.equal(game.interact(), false); assert.equal(game.salvage.pending.length, 6);
  position(game, game.salvage.exits[1]); assert.equal(game.interact(), false);
  assert.equal(game.salvage.evac.exitId, exit.id);
});

test('target selection never collects samples or calls or switches a ship', () => {
  const game = clearGeometry(salvage()), drone = source(game, 'drone'), exit = game.salvage.exits[1];
  assert.equal(game.selectSalvageTarget('absent-target'), false);
  assert.equal(game.selectSalvageTarget(drone.id), true); assert.equal(game.salvageTarget().id, drone.id);
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.evac, null);
  const called = call(game); assert.equal(game.selectSalvageTarget(exit.id), true);
  assert.equal(game.salvage.evac.exitId, called.id); assert.equal(game.salvage.carried, 0);
});

test('ship arrival takes game-time ten seconds and boarding only accumulates in the called circle', () => {
  const game = clearGeometry(salvage()), exit = call(game);
  game.salvage.pending = [];
  advance(game, 9.9); assert.equal(game.salvage.status, 'approaching'); assert.equal(game.salvage.evac.progress, 0);
  position(game, exit, 200); advance(game, .2); assert.equal(game.salvage.status, 'boarding'); near(game.salvage.evac.progress, 0);
  position(game, exit, 50); advance(game, 1); near(game.salvage.evac.progress, 1);
  position(game, exit, 200); advance(game, 1); near(game.salvage.evac.progress, 1);
  position(game, game.salvage.exits[1]); advance(game, 1); near(game.salvage.evac.progress, 1);
});

test('extraction banks carried samples and eighty each exactly once after arrival and boarding', () => {
  const game = clearGeometry(salvage()); collectVault(game); call(game); waitToBoard(game);
  const score = game.score; advance(game, 2.8); assert.equal(game.salvage.status, 'boarding');
  advance(game, .3);
  assert.equal(game.salvage.status, 'extracted'); assert.equal(game.phase, 'won');
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.settled, 3); assert.equal(game.salvage.bonus, 240); assert.equal(game.score, score + 240);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-complete').length, 1); assert.equal(events.filter(event => event.type === 'win').length, 1);
  game._finishSalvage(); game.update(.25); assert.equal(game.score, score + 240);
  assert.equal(game.drainEvents().filter(event => event.type === 'win').length, 0);
});

test('empty withdrawal takes the same real waiting and boarding but awards no bonus or win event', () => {
  const game = clearGeometry(salvage()); call(game); waitToBoard(game); const score = game.score;
  advance(game, 2.8); assert.equal(game.salvage.status, 'boarding'); advance(game, .3);
  assert.equal(game.salvage.status, 'withdrawn'); assert.ok(['won', 'lost'].includes(game.phase));
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.settled, 0); assert.equal(game.salvage.bonus, 0); assert.equal(game.score, score);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'salvage-withdraw').length, 1);
  assert.equal(events.filter(event => ['win', 'salvage-complete'].includes(event.type)).length, 0);
});

test('fatal normal damage on the boarding completion step wins priority over extraction', () => {
  const game = clearGeometry(salvage()); collectVault(game); call(game); waitToBoard(game);
  game.salvage.evac.progress = 2.99; game.player.hp = 1; game.player.invulnerable = 0;
  game._addHazard('blast', game.player.x, game.player.y, 40, .001, 14);
  game.update(1 / 60);
  assert.equal(game.phase, 'lost'); assert.equal(game.salvage.status, 'failed'); assert.equal(game.salvage.carried, 0);
  assert.equal(game.salvage.lostSamples, 3); assert.equal(game.salvage.settled, 0); assert.equal(game.salvage.bonus, 0);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'lose').length, 1);
  assert.equal(events.filter(event => event.type === 'salvage-failed').length, 1);
  assert.equal(events.filter(event => ['win', 'salvage-complete'].includes(event.type)).length, 0);
});

test('ready and decision phases freeze every salvage source, ship, spawn and battlefield timer', () => {
  for (const phase of ['ready', 'upgrade', 'relic', 'tactic']) {
    const game = clearGeometry(salvage()), drill = source(game, 'drill'); position(game, drill); assert.equal(game.interact(), true);
    call(game); game.phase = phase;
    const before = JSON.stringify({ salvage: game.salvage, field: game.battlefield, player: game.player, elapsed: game.elapsed });
    game.update(.25, { moveX: 1, shoot: true });
    assert.equal(JSON.stringify({ salvage: game.salvage, field: game.battlefield, player: game.player, elapsed: game.elapsed }), before);
    assert.equal(game.interact(), false); assert.equal(game.useSkill(), false);
  }
});

test('terminal death clears pending combat and fields while preserving the lost sample record', () => {
  const game = clearGeometry(salvage()); collectVault(game);
  game._queueSalvage(['engineer'], 'qa-pending');
  const mine = game._spawnMine({ x: 1200, y: 1000 }, 0); assert.ok(mine);
  bullet(game, source(game, 'vault', 1)); game._addHazard('blast', 1200, 1000, 20, 1, 14);
  game._damagePlayer(1000);
  assert.equal(game.salvage.status, 'failed'); assert.equal(game.salvage.lostSamples, 3);
  assert.equal(game.salvage.pending.length, 0); assert.equal(game.bullets.length + game.hazards.length, 0);
  assert.ok(!game.battlefield || game.battlefield.props.length + game.battlefield.mines.length === 0);
  const before = JSON.stringify(game.salvage); game.update(.25); assert.equal(JSON.stringify(game.salvage), before);
});

test('reset and old modes cannot inherit salvage sources, carried samples or extraction state', () => {
  const game = clearGeometry(salvage()); collectVault(game); call(game);
  for (const options of [{}, { mode: 'trial', seed: 1 }, { mode: 'campaign', seed: 1 }, { mode: 'voyage', seed: 1 }]) {
    game.reset('frontier', options); assert.ok(!game.salvage); assert.equal(game.phase, 'ready');
    assert.ok(!game.enemies.some(enemy => enemy.type === 'salvage-source'));
  }
  game.reset('frontier', { mode: 'salvage', seed: 731 });
  assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.evac, null); assert.equal(game.salvage.settled, 0);
});

test('grenade preview and actual explosion agree on a salvage vault collision', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, -200);
  game.player.angle = 0; assert.equal(game.switchWeapon(3), true); const preview = game.grenadePreview();
  let burst;
  for (let frame = 0; frame < 30 && !game.bullets.some(value => value.kind === 'grenade') && !burst; frame++) {
    game.update(1 / 60, { aimX: vault.x + 200, aimY: vault.y, shoot: true });
    burst = game.drainEvents().find(event => event.type === 'grenade-burst');
  }
  for (let frame = 0; frame < 60 && !burst; frame++) { game._updateBullets(1 / 60); burst = game.drainEvents().find(event => event.type === 'grenade-burst'); }
  assert.ok(burst); near(preview.x, vault.x - vault.radius - 7); near(preview.x, burst.x); near(preview.y, burst.y);
});

test('collected selected source falls back to another real target and cannot be selected again', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault');
  assert.equal(game.selectSalvageTarget(vault.id), true); collectVault(game);
  assert.equal(game.salvage.selectedId, null); assert.notEqual(game.salvageTarget().id, vault.id);
  assert.equal(game.selectSalvageTarget(vault.id), false);
  const exit = call(game); assert.equal(game.salvageTarget().id, exit.id);
});

test('initial, drill, alarm and ship tickets are finite with their distinct real reasons', () => {
  const game = clearGeometry(salvage({}, true)), drill = source(game, 'drill');
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'patrol').length, 8);
  position(game, drill); assert.equal(game.interact(), true);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'drill-' + drill.id).length, 6);
  game._raiseSalvageAlarm(100); call(game);
  assert.equal(game.salvage.pending.length, 29);
  assert.equal(game.salvage.pending.filter(ticket => ticket.reason === 'evac').length, 6);
  game.salvage.pending = []; game.salvage.hazardTimer = 100;
  position(game, drill, 300); advance(game, 4);
  assert.equal(game.salvage.pending.length, 0); assert.equal(game.salvage.spawned, 0);
});

test('a generated spawn failure from the real spawnEnemy API also retains its ticket', () => {
  const game = clearGeometry(salvage({}, true)), spawnEnemy = game.spawnEnemy;
  game.spawnEnemy = () => null; advance(game, 3.5);
  assert.equal(game.salvage.pending.length, 8); assert.equal(game.salvage.spawned, 0);
  game.spawnEnemy = spawnEnemy; advance(game, .3);
  assert.equal(game.salvage.pending.length, 7); assert.equal(game.salvage.spawned, 1);
});

test('field blasts damage exposed vaults but cover destroyed by that blast still protects a vault', () => {
  for (const covered of [false, true]) {
    const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, -400);
    const mine = game._spawnMine({ x: vault.x - 100, y: vault.y }, 0); assert.ok(mine);
    let rock;
    if (covered) {
      rock = { id: game._id(), type: 'rock', x: vault.x - 50, y: vault.y, radius: 16, fragile: true, hp: 95, maxHp: 95 };
      game.obstacles.push(rock);
    }
    assert.equal(game._armField(mine), true); game._updateBattlefield(.65);
    assert.equal(vault.status, covered ? 'locked' : 'open');
    assert.equal(game.salvage.alarm, covered ? 0 : 18); assert.equal(game.salvage.carried, 0);
    assert.equal(game.salvage.fieldStats.detonations, 1);
    if (covered) { assert.ok(!game.obstacles.includes(rock)); assert.equal(game.salvage.fieldStats.fractures, 1); }
  }
});

test('grenade source blast uses pre-explosion cover while keeping the original enemy blast rules', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, -400);
  const rock = { id: game._id(), type: 'rock', x: vault.x - 50, y: vault.y, radius: 16, fragile: true, hp: 95, maxHp: 95 };
  game.obstacles.push(rock);
  const enemy = game.spawnEnemy('crawler', { x: vault.x, y: vault.y }); enemy.hp = enemy.maxHp = 500;
  game._burstGrenade({ x: vault.x - 100, y: vault.y, lifetime: 1, damage: 140, blastRadius: 125, color: '#ffffff' });
  assert.equal(vault.status, 'locked'); assert.equal(vault.hp, 90); assert.ok(!game.obstacles.includes(rock));
  near(enemy.hp, 360);
  game._burstGrenade({ x: vault.x - 100, y: vault.y, lifetime: 1, damage: 140, blastRadius: 125, color: '#ffffff' });
  assert.equal(vault.status, 'open'); assert.equal(game.salvage.alarm, 18);
});

test('real EMP captures nearby field and quietly unlocks vault without damaging the player', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, -50);
  const mine = game._spawnMine({ x: vault.x - 80, y: vault.y }, 0); assert.ok(mine);
  const hp = game.player.hp; assert.equal(game.useSkill(), true);
  assert.equal(mine.friendly, true); assert.equal(mine.status, 'armed'); near(vault.quietTimer, 4);
  assert.equal(game.interact(), true); game._updateBattlefield(.35);
  near(game.player.hp, hp); assert.equal(game.salvage.fieldStats.captures, 1);
  assert.equal(game.salvage.carried, 3); assert.equal(game.salvage.alarm, 5);
});

test('starline preview agrees with a real pin at a destructible source and later stops on the next surface', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, -200);
  const rock = { id: game._id(), type: 'rock', x: vault.x + 200, y: vault.y, radius: 20 }; game.obstacles.push(rock);
  game.player.angle = 0; assert.equal(game.switchWeapon(5), true); const preview = game.starlinePreview();
  for (let frame = 0; frame < 30 && !game.bullets.some(value => value.kind === 'starline'); frame++) game.update(1 / 60, { aimX: vault.x + 400, aimY: vault.y, shoot: true });
  for (let frame = 0; frame < 60 && game.bullets.length; frame++) game._updateBullets(1 / 60);
  assert.ok(game.starPins.length > 0);
  assert.ok(game.starPins.some(pin => Math.abs(pin.x - preview.x) < 1e-7 && Math.abs(pin.y - preview.y) < 1e-7));
});

test('alert scan locks the old position for its full warning and applies its real enemy damage', () => {
  const game = clearGeometry(salvage()); game._raiseSalvageAlarm(55); game.salvage.pending = []; game.salvage.hazardTimer = 0;
  game.update(1 / 60); const scan = game.hazards.find(hazard => hazard.salvageScan); assert.ok(scan);
  assert.equal(scan.radius, 85); near(scan.duration, 1.15); assert.equal(scan.damage, 14); assert.equal(scan.enemyDamage, 45);
  const before = { x: scan.x, y: scan.y }, enemy = game.spawnEnemy('crawler', { x: scan.x, y: scan.y }); enemy.hp = enemy.maxHp = 200;
  game.update(.25, { moveX: 1 }); near(scan.x, before.x); near(scan.y, before.y);
  assert.ok(scan.remaining > .85); const enemyHp = enemy.hp;
  game._updateHazards(scan.remaining + .001); near(enemy.hp, enemyHp - 45);
  assert.ok(game.drainEvents().some(event => event.type === 'hazard-burst'));
});

test('eight unresolved alert scans suppress new warnings until a real hazard slot is free', () => {
  const game = clearGeometry(salvage()); game._raiseSalvageAlarm(55); game.salvage.pending = [];
  for (let index = 0; index < 8; index++) game._addHazard('blast', 1300, 800 + index * 10, 85, 5, 14, { salvageScan: true });
  game.salvage.hazardTimer = 0; game.update(1 / 60); assert.equal(game.hazards.filter(hazard => hazard.salvageScan).length, 8);
  game.hazards[0].resolved = true; game.update(1 / 60);
  assert.equal(game.hazards.filter(hazard => hazard.salvageScan && !hazard.resolved).length, 8);
});

test('completed terminal runs reject all actions and cannot restart alarm, sources or rewards', () => {
  const game = clearGeometry(salvage()); collectVault(game); call(game); waitToBoard(game); advance(game, 3);
  const before = JSON.stringify(game.salvage), score = game.score;
  assert.equal(game.interact(), false); assert.equal(game.useSkill(), false);
  assert.equal(game.selectSalvageTarget(game.salvage.exits[1].id), false);
  game._raiseSalvageAlarm(100); game._queueSalvage(['crawler'], 'after-terminal');
  game._damageSalvageSource(source(game, 'vault', 1), 500); assert.equal(game._finishSalvage(), false);
  game.update(.25, { moveX: 1, shoot: true }); assert.equal(JSON.stringify(game.salvage), before); assert.equal(game.score, score);
  assert.equal(game.salvageTarget(), null);
});

test('boundary seeds keep reachable sources, exits and the complete moving-drone path', () => {
  for (const seed of [0, 1, 2, 17, 731, 912, 2147483647, 4294967295]) {
    const game = salvage({ seed }), step = 40, cols = 66, rows = 48;
    const passable = (x, y) => x >= game.player.radius && y >= game.player.radius && x <= game.world.width - game.player.radius && y <= game.world.height - game.player.radius &&
      !game.obstacles.some(rock => Math.hypot(x - rock.x, y - rock.y) < rock.radius + game.player.radius + 2);
    const start = [Math.round(game.spawn.x / step), Math.round(game.spawn.y / step)], queue = [start], reached = new Set([start.join(',')]);
    for (let index = 0; index < queue.length; index++) {
      const [col, row] = queue[index];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = col + dx, r = row + dy, key = c + ',' + r;
        if (c < 0 || r < 0 || c >= cols || r >= rows || reached.has(key) || !passable(c * step, r * step)) continue;
        reached.add(key); queue.push([c, r]);
      }
    }
    for (const target of [...game.salvage.sources, ...game.salvage.exits, ...source(game, 'drone').path])
      assert.ok(queue.some(([col, row]) => Math.hypot(col * step - target.x, row * step - target.y) <= 80), 'Seed ' + seed + ' has a traversable route to every target');
    const drone = source(game, 'drone');
    for (const [index, point] of drone.path.entries()) {
      const next = drone.path[(index + 1) % drone.path.length];
      for (const rock of game.obstacles) assert.equal(game._segmentHit(point.x, point.y, next.x - point.x, next.y - point.y, rock, drone.radius), null, 'Drone cargo cannot become trapped inside solid cover');
    }
  }
});

test('newly triggered reinforcement tickets arrive before old patrol while preserving every finite ticket', () => {
  const game = clearGeometry(salvage({}, true)), original = game.salvage.pending.map(ticket => ({ ...ticket })), spawned = [];
  const spawnEnemy = game.spawnEnemy;
  game.spawnEnemy = function(type, point) { const enemy = spawnEnemy.call(this, type, point); if (enemy) spawned.push({ type, at: this.elapsed }); return enemy; };
  const exit = call(game); assert.equal(game.salvage.pending.length, 14);
  assert.deepEqual(game.salvage.pending.slice(-8), original, 'Prior patrol order and tickets remain intact');
  assert.ok(game.salvage.pending.slice(0, 6).every(ticket => ticket.reason === 'evac'));
  advance(game, 3.05); assert.equal(game.salvage.spawned, 1); assert.equal(game.enemies[0].salvageReason, 'evac');
  assert.equal(game.salvage.pending.length + game.salvage.spawned, 14); assert.equal(game.salvage.evac.exitId, exit.id); assert.equal(spawned.length, 1);
});

test('drill threshold reinforcement precedes its own drill tickets without discarding prior patrol', () => {
  const game = clearGeometry(salvage({}, true)), drill = source(game, 'drill'); game._raiseSalvageAlarm(18);
  position(game, drill); assert.equal(game.interact(), true); assert.equal(game.salvage.alarm, 26);
  assert.equal(game.salvage.pending.length, 16);
  assert.deepEqual(game.salvage.pending.slice(0, 2).map(ticket => ticket.reason), ['alert-2', 'alert-2']);
  assert.ok(game.salvage.pending.slice(2, 8).every(ticket => ticket.reason === 'drill-' + drill.id));
  assert.ok(game.salvage.pending.slice(8).every(ticket => ticket.reason === 'patrol'));
});

for (const [index, weapon] of WEAPONS.entries()) for (const kind of ['vault', 'drone']) {
  test(`normal ${weapon.id} shots really open a ${kind} with unchanged base weapon parameters`, () => {
    const game = clearGeometry(salvage()), target = source(game, kind);
    position(game, target, -120);
    if (index) assert.equal(game.switchWeapon(index), true);
    const damage = game.player.damageMultiplier, ammo = game.ammoByWeapon[index], shots = [];
    for (let frame = 0; frame < 480 && !['open', 'collected'].includes(target.status); frame++) {
      game.update(1 / 60, { aimX: target.x, aimY: target.y, shoot: true });
      shots.push(...game.drainEvents().filter(event => event.type === 'shot' && event.owner === 'player'));
    }
    assert.equal(target.status, 'open'); assert.equal(target.hp, 0);
    assert.ok(shots.length > 0); assert.ok(shots.every(event => event.weapon === index));
    assert.ok(game.ammoByWeapon[index] < ammo); near(game.player.damageMultiplier, damage);
    assert.equal(game.salvage.alarm, kind === 'vault' ? 18 : 12);
    assert.equal(game.salvage.carried, 0); assert.equal(game.kills, 0); assert.equal(game.score, 0); assert.equal(game.player.xp, 0);
  });
}

test('one normally fired boomerang survives a vault and damages its ID once on each journey', () => {
  const game = clearGeometry(salvage()), vault = source(game, 'vault'); position(game, vault, -120);
  assert.equal(game.switchWeapon(4), true);
  for (let frame = 0; frame < 30 && !game.bullets.length; frame++) game.update(1 / 60, { aimX: vault.x, aimY: vault.y, shoot: true });
  assert.equal(game.bullets.length, 1); const blade = game.bullets[0], originalId = blade.id;
  const hits = [], damage = game._damageSalvageSource;
  game._damageSalvageSource = function(target, amount) { if (target.id === vault.id) hits.push({ returning: blade.returning, amount }); return damage.call(this, target, amount); };
  while (blade.age < .45) game.update(1 / 60, { aimX: vault.x, aimY: vault.y });
  near(vault.hp, 48); assert.equal(blade.id, originalId); assert.ok(game.bullets.includes(blade));
  assert.equal(blade.returning, false); assert.deepEqual(blade.hitIds, [vault.id]); assert.equal(hits.length, 1);
  for (let frame = 0; frame < 120 && game.bullets.includes(blade); frame++) game.update(1 / 60, { aimX: vault.x, aimY: vault.y });
  assert.deepEqual(hits, [{ returning: false, amount: 42 }, { returning: true, amount: 42 }]);
  near(vault.hp, 6); assert.equal(vault.status, 'locked'); assert.equal(game.bullets.includes(blade), false);
  assert.equal(game.ammoByWeapon[4], WEAPONS[4].magSize - 1); assert.equal(game.salvage.alarm, 0);
});

test('each normally fired base weapon travels through an idle drill to an actual enemy', () => {
  for (const [index, weapon] of WEAPONS.entries()) {
    const game = clearGeometry(salvage()), drill = source(game, 'drill'); position(game, drill, -120);
    const enemy = game.spawnEnemy('crawler', { x: drill.x + 80, y: drill.y });
    const hp = enemy.hp;
    if (index) assert.equal(game.switchWeapon(index), true);
    for (let frame = 0; frame < 90 && enemy.hp === hp; frame++) game.update(1 / 60, { aimX: enemy.x, aimY: enemy.y, shoot: true });
    assert.ok(enemy.hp < hp, weapon.id + ' passes the invulnerable source');
    assert.equal(drill.status, 'idle'); assert.equal(drill.progress, 0); assert.equal(game.salvage.alarm, 0);
  }
});
