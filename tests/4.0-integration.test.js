'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, MAPS, WEAPONS, UPGRADES, EVOLUTIONS } = require('../action-engine.js');

function arena(options = {}) {
  const game = new Game({ mapId: 'ruins', seed: 41, ...options }); game.start();
  game.obstacles = []; game.enemies = []; game.spawnTimer = 999; game.player.xpNeeded = 1e9;
  game.drainEvents(); return game;
}
function at(game, point) { game.player.x = point.x; game.player.y = point.y; }
function pick(game) {
  const cargo = game.delivery.cargos.find(item => item.status === 'source');
  at(game, cargo); assert.equal(game.interact(), true); return cargo;
}
function layLine(game) {
  at(game, { x: 1200, y: 1100 }); game.enemies = []; game.obstacles = [];
  if (game.player.weapon !== 5) assert.equal(game.switchWeapon(5), true);
  for (const angle of [0, .3]) {
    game.player.angle = angle; game.fireTimer = 0; game._shoot();
    for (let frame = 0; frame < 40; frame++) game._updateBullets(1 / 60);
  }
  assert.equal(game.starPins.length, 2); assert.equal(game.starLines.length, 1);
}
function finishBossFixture(game) {
  game.enemies = []; game.hazards = []; game.bullets = [];
  game.bossSpawned = false; game._spawnBoss();
  const boss = game.enemies.find(enemy => enemy.type === 'boss'); assert.ok(boss);
  game._damageEnemy(boss, 1e9);
}
function earnBridge(game) {
  game.switchWeapon(5); game.phase = 'upgrade'; game.upgradeChoices = [UPGRADES.find(item => item.id === 'star-capacitor')];
  assert.equal(game.chooseUpgrade('star-capacitor'), true);
  game.player.level = 3; game.player.xp = game.player.xpNeeded; game._levelUp();
  assert.equal(game.upgradeChoices[0].id, 'star-bridge');
  assert.equal(game.chooseUpgrade('star-bridge'), true);
}

test('4.0 keeps the existing map and weapon IDs in order and appends one complete option to each', () => {
  assert.deepEqual(MAPS.map(item => item.id), ['frontier', 'foundry', 'frost', 'storm', 'ruins']);
  assert.deepEqual(WEAPONS.map(item => item.id), ['assault', 'shotgun', 'piercer', 'grenade', 'boomerang', 'starline']);
  assert.deepEqual(EVOLUTIONS.map(item => item.weapon).sort(), [0, 1, 2, 3, 4, 5]);
  const game = arena();
  assert.equal(game.delivery.cargos.length, 3); assert.equal(game.relays.length, 3);
  for (const field of ['ammoByWeapon', 'reloadByWeapon', 'reloadDurationByWeapon', 'overchargedByWeapon']) assert.equal(game[field].length, 6, field);
  assert.equal(new Set(game.delivery.cargos.map(item => item.relayId)).size, 3);
  assert.ok(game.delivery.cargos.every(item => game.relays.some(relay => relay.id === item.relayId)));
});

test('ruins cargo and encounter clearings remain accessible through the actual obstacle layout', () => {
  const game = new Game({ mapId: 'ruins', seed: 92 });
  assert.ok(game.obstacles.length > 0, 'The fifth map retains physical cover');
  for (const point of [game.spawn, ...game.delivery.cargos, ...game.relays, ...game.encounters, ...game.encounters.flatMap(item => item.nodes)]) {
    for (const rock of game.obstacles) assert.ok(Math.hypot(point.x - rock.x, point.y - rock.y) > rock.radius + game.player.radius + (point.radius || 0), 'A new objective clearing is obstructed');
  }
});

test('cargo recovery locks, carrying state, pins and lines freeze together during decisions', () => {
  const game = arena(), cargo = pick(game);
  assert.equal(game.dash({ x: 1, y: 0 }), true); assert.equal(cargo.status, 'dropped');
  layLine(game);
  const snapshot = () => JSON.stringify({ elapsed: game.elapsed, delivery: game.delivery, pins: game.starPins, lines: game.starLines, player: game.player });
  for (const phase of ['upgrade', 'relic', 'tactic', 'campaign-rest']) {
    game.phase = phase; const before = snapshot();
    game.update(.25, { moveX: 1, shoot: true });
    assert.equal(game.interact(), false); assert.equal(game.dash({ x: 1, y: 0 }), false);
    assert.equal(snapshot(), before, phase);
  }
  game.phase = 'playing'; game.update(.1);
  assert.ok(cargo.pickupLock < .35); assert.ok(game.starPins.every(pin => pin.remaining < 6));
});

test('the fifth map works in either campaign act while durable sixth-weapon progress survives travel', () => {
  for (const [first, second] of [['ruins', 'frontier'], ['frontier', 'ruins']]) {
    const game = arena({ mode: 'campaign', doctrineId: 'skirmisher', mapId: first });
    earnBridge(game);
    if (first === 'ruins') pick(game);
    layLine(game); const priorId = game.nextId;
    finishBossFixture(game); assert.equal(game.phase, 'campaign-rest');
    assert.equal(game.delivery, null); assert.deepEqual(game.starPins, []); assert.deepEqual(game.starLines, []);
    assert.equal(game.campaign.routeChoices.length, 4);
    assert.equal(game.chooseCampaignRoute(second, 'repair', 'return-dash'), true);
    while (game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id);
    assert.equal(game.map.id, second); assert.equal(game.player.weapon, 5);
    assert.equal(game.evolutionId, 'star-bridge'); assert.equal(game.player.starCapacitor, true);
    assert.equal(game.upgradeStacks['star-capacitor'], 1);
    assert.ok(game.nextId > priorId); assert.ok(game.relays.every(relay => relay.id >= priorId));
    assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => Math.ceil(weapon.magSize * game.player.magazineMultiplier)));
    assert.equal(Boolean(game.delivery), second === 'ruins');
    if (second === 'ruins') pick(game);
    layLine(game); finishBossFixture(game);
    assert.equal(game.phase, 'campaign-rest'); assert.equal(game.delivery, null);
    assert.deepEqual(game.starPins, []); assert.deepEqual(game.starLines, []);
    assert.equal(game.chooseCampaignRoute('nexus', 'power'), true);
    assert.equal(game.map.id, 'nexus'); assert.equal(game.delivery, null);
    assert.equal(game.evolutionId, 'star-bridge'); assert.equal(game.player.weapon, 5);
    assert.deepEqual(game.starPins, []); assert.deepEqual(game.starLines, []);
  }
});

test('campaign defeat clears new transient systems and retries create independent cargo and ammunition', () => {
  const game = arena({ mode: 'campaign', doctrineId: 'marksman', discoveredSecrets: ['rebound'] });
  pick(game); layLine(game); game.player.invulnerable = 0;
  assert.equal(game._damagePlayer(10000, { kind: 'test', name: 'Boundary damage' }), true);
  assert.equal(game.phase, 'lost'); assert.equal(game.delivery, null);
  assert.deepEqual(game.starPins, []); assert.deepEqual(game.starLines, []);
  game.reset('ruins', { mode: 'campaign', doctrineId: 'marksman', seed: 41 });
  assert.equal(game.phase, 'ready'); assert.equal(game.evolutionId, '');
  assert.ok(game.delivery.cargos.every(cargo => cargo.status === 'source' && cargo.pickupLock === 0));
  assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => weapon.magSize));
  assert.deepEqual([...game.discoveredSecrets], ['rebound']);
  const other = arena({ discoveredSecrets: ['ice-break'] });
  assert.deepEqual([...other.discoveredSecrets], ['ice-break']);
  assert.notEqual(game.delivery.cargos, other.delivery.cargos);
});

test('resetting a cargo and starline run into a trial preserves the historical seeded boss pool', () => {
  const expected = [[1, 'foundry'], [2, 'frost'], [7, 'frontier'], [123, 'frost'], [124, 'frost'], [731, 'frost']];
  for (const [seed, mapId] of expected) {
    const game = arena(); pick(game); layLine(game);
    game.reset('ruins', { mode: 'trial', seed });
    assert.equal(game.map.id, 'trial'); assert.equal(game.trial.bossMapId, mapId);
    assert.equal(game.trial.totalWaves, 6); assert.equal(game.campaign, null); assert.equal(game.delivery, null);
    assert.deepEqual(game.starPins, []); assert.deepEqual(game.starLines, []);
    assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => weapon.magSize));
  }
});
