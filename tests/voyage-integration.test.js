'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, MAPS, WEAPONS, VOYAGE_DEVICES } = require('../action-engine.js');

function voyage(options = {}) {
  const game = new Game({ mode: 'voyage', seed: 731, ...options });
  game.start(); game.drainEvents(); return game;
}
function upgrades(game) {
  let choices = 0;
  while (game.phase === 'upgrade') {
    assert.ok(++choices < 100, 'Pending experience resolves finitely');
    assert.equal(game.chooseUpgrade(game.upgradeChoices[0].id), true);
  }
}
function clearRoom(game) {
  // Explicit boundary fixture: actual spawns, targets, completion and rewards
  // execute; private damage shortcuts combat, so this is not a playthrough.
  for (let frame = 0; frame < 2000 && !game.voyage.room.objectiveDone && !['won', 'lost'].includes(game.phase); frame++) {
    upgrades(game);
    game.player.invulnerable = .3;
    game.update(.25);
    for (const enemy of [...game.enemies]) {
      if (game.phase !== 'playing') break;
      if (enemy.hp > 0) game._damageEnemy(enemy, 1e6);
    }
  }
  upgrades(game);
  assert.ok(game.voyage.room.objectiveDone || game.phase === 'won', 'Real finite objective reaches its exit');
}
function rest(game) {
  clearRoom(game);
  assert.equal(game.phase, 'playing', 'A normal room does not immediately pause or teleport the player');
  const exit = game.voyage.room.exit;
  assert.equal(exit.ready, true);
  game.player.x = exit.x; game.player.y = exit.y;
  assert.equal(game.interact(), true);
  assert.equal(game.phase, 'voyage-rest');
  return game;
}
function travel(game, deviceId = null, slotIndex = null, route = game.voyage.routeChoices[0]) {
  assert.equal(game.chooseVoyageRoute(route.id, deviceId, slotIndex), true);
  upgrades(game);
  assert.equal(game.phase, 'playing');
}
function snapshot(game) {
  return JSON.stringify({ phase: game.phase, elapsed: game.elapsed, nextId: game.nextId, player: game.player,
    voyage: game.voyage, enemies: game.enemies, bullets: game.bullets, hazards: game.hazards, pickups: game.pickups,
    events: game.events, starPins: game.starPins, starLines: game.starLines, upgrades: game.upgradeStacks,
    discovered: [...game.discoveredSecrets], evolutionId: game.evolutionId, relics: game.relics, tacticId: game.tacticId });
}

test('voyage initializes an independent seeded seven-node mode without altering existing map or weapon identities', () => {
  const game = voyage();
  assert.equal(game.mode, 'voyage'); assert.equal(game.campaign, null); assert.equal(game.trial, null);
  assert.equal(game.voyage.node, 1); assert.equal(game.voyage.totalNodes, 7);
  assert.equal(game.player.hp, 120); assert.equal(game.player.damageMultiplier, 1);
  assert.deepEqual(game.voyage.devices, ['afterimage', null, null]);
  assert.deepEqual(MAPS.map(map => map.id), ['frontier', 'foundry', 'frost', 'storm', 'ruins']);
  assert.deepEqual(WEAPONS.map(weapon => weapon.id), ['assault', 'shotgun', 'piercer', 'grenade', 'boomerang', 'starline']);
  assert.equal(VOYAGE_DEVICES.length, 6);
});

test('ready voyage freezes all input and rejects room choices before an exit has been reached', () => {
  const game = new Game({ mode: 'voyage', seed: 23 });
  const before = snapshot(game);
  game.update(.25, { moveX: 1, shoot: true });
  for (const act of [() => game.interact(), () => game.reload(), () => game.useSkill(), () => game.dash(), () => game.switchWeapon(5), () => game.chooseVoyageRoute('bad', null, null), () => game.purchaseVoyage('damage')]) assert.equal(act(), false);
  assert.equal(snapshot(game), before);
});

test('voyage rest freezes combat and all incomplete, illegal or duplicate route transactions are atomic', () => {
  const game = rest(voyage()); game.drainEvents();
  const route = game.voyage.routeChoices[0], before = snapshot(game);
  for (const act of [() => game.reload(), () => game.dash({ x: 1, y: 0 }), () => game.useSkill(), () => game.activateOverdrive(), () => game.switchWeapon(2), () => game.interact()]) assert.equal(act(), false);
  game.update(.25, { moveX: 1, moveY: 1, shoot: true });
  for (const [id, device, slot] of [['bad', null, null], [route.id, 'bad', 0], [route.id, 'afterimage', 1], [route.id, 'needles', -1], [route.id, 'needles', 3], [route.id, 'needles', 1.5]]) assert.equal(game.chooseVoyageRoute(id, device, slot), false);
  assert.equal(snapshot(game), before);
  travel(game);
  const after = snapshot(game);
  assert.equal(game.chooseVoyageRoute(route.id, null, null), false);
  assert.equal(game.purchaseVoyage('repair'), false);
  assert.equal(snapshot(game), after);
});

test('rest shop rejects insufficient credits and invalid purchases without consuming its one transaction', () => {
  const game = rest(voyage()); game.drainEvents(); game.player.credits = 0;
  const before = snapshot(game);
  assert.equal(game.purchaseVoyage('damage'), false); assert.equal(game.purchaseVoyage('bad'), false);
  assert.equal(snapshot(game), before);
  game.player.credits = 35;
  assert.equal(game.purchaseVoyage('damage'), true);
  assert.equal(game.player.credits, 0); assert.equal(game.player.damageMultiplier, 1.18);
  assert.equal(game.voyage.purchased, true);
  const bought = snapshot(game);
  assert.equal(game.purchaseVoyage('health'), false); assert.equal(snapshot(game), bought);
});

test('full-health repair is rejected and a wounded repair heals exactly once without increasing maximum health', () => {
  const game = rest(voyage()); game.player.credits = 50; game.player.hp = game.player.maxHp;
  game.drainEvents(); const before = snapshot(game);
  assert.equal(game.purchaseVoyage('repair'), false); assert.equal(snapshot(game), before);
  game.player.hp = game.player.maxHp - 50;
  const max = game.player.maxHp;
  assert.equal(game.purchaseVoyage('repair'), true);
  assert.equal(game.player.hp, max - 15); assert.equal(game.player.maxHp, max); assert.equal(game.player.credits, 25);
  assert.equal(game.purchaseVoyage('repair'), false);
});

test('a shop upgrade at its stack cap cannot consume credits or the remaining purchase', () => {
  const game = rest(voyage()); game.player.credits = 100; game.upgradeStacks.damage = 5;
  game.drainEvents(); const before = snapshot(game);
  assert.equal(game.purchaseVoyage('damage'), false); assert.equal(snapshot(game), before);
  assert.equal(game.purchaseVoyage('health'), true); assert.equal(game.player.credits, 65);
});

test('completed objectives require reaching the physical exit, and distant interaction cannot skip the room', () => {
  const game = voyage(); clearRoom(game); game.drainEvents();
  game.player.x = game.voyage.room.exit.x; game.player.y = game.voyage.room.exit.y - 130;
  const before = snapshot(game);
  assert.equal(game.interact(), false); assert.equal(snapshot(game), before);
  const target = game.voyageTarget(); assert.equal(target.kind, 'exit');
  game.player.y = game.voyage.room.exit.y - 70;
  assert.equal(game.interact(), true); assert.equal(game.phase, 'voyage-rest');
  assert.equal(game.interact(), false);
});

test('temporarily blocked voyage portals preserve their finite quota and retry when space returns', () => {
  const game = voyage(), room = game.voyage.room, obstacles = [...game.obstacles];
  game.obstacles = room.portals.map((point, index) => ({ id: 50000 + index, type: 'rock', x: point.x, y: point.y, radius: 100 }));
  for (let frame = 0; frame < 100; frame++) game.update(.25);
  assert.equal(room.spawned, 0); assert.equal(room.quota, 12); assert.equal(room.objectiveDone, false); assert.equal(game.phase, 'playing');
  game.obstacles = obstacles;
  for (let frame = 0; frame < 4; frame++) game.update(.25);
  assert.ok(room.spawned > 0); assert.equal(room.quota, 12);
});

test('an existing enemy cap delays room spawning without treating delayed enemies as completed', () => {
  const game = voyage(), room = game.voyage.room;
  for (let index = 0; index < 14; index++) assert.ok(game.spawnEnemy('crawler', { x: 150 + index * 95, y: 200 }));
  for (let frame = 0; frame < 20; frame++) { game.player.invulnerable = .3; game.update(.25); }
  assert.equal(room.spawned, 0); assert.equal(room.quota, 12); assert.equal(room.objectiveDone, false);
  game._damageEnemy(game.enemies[0], 1e6);
  game.update(.25);
  assert.equal(room.spawned, 1); assert.equal(room.quota, 12); assert.equal(room.objectiveDone, false);
});

test('harvest objectives can finish from kills outside all collectors and do not strand finite room progress', () => {
  const game = voyage({ seed: 2 });
  for (let node = 1; node < 6 && game.voyage.room.type !== 'harvest'; node++) {
    rest(game); const harvest = game.voyage.routeChoices.find(route => route.type === 'harvest'); travel(game, null, null, harvest || game.voyage.routeChoices[0]);
  }
  assert.equal(game.voyage.room.type, 'harvest');
  const room = game.voyage.room;
  for (let frame = 0; frame < 1000 && !room.objectiveDone; frame++) {
    upgrades(game); game.player.invulnerable = .3; game.update(.25);
    for (const enemy of [...game.enemies]) if (enemy.hp > 0 && game.phase === 'playing') {
      enemy.x = 100; enemy.y = 100;
      assert.ok(room.collectors.every(collector => Math.hypot(collector.x - enemy.x, collector.y - enemy.y) > collector.radius));
      game._damageEnemy(enemy, 1e6);
    }
  }
  assert.equal(room.objectiveDone, true); assert.ok(room.collectors.every(collector => collector.charge === collector.goal));
  assert.equal(room.kills, 12); assert.ok(room.kills <= room.quota);
});

test('critical-hit random consumption does not change the next pair of seeded routes', () => {
  const a = voyage({ seed: 63 }), b = voyage({ seed: 63 });
  for (let shot = 0; shot < 25; shot++) { a.fireTimer = 0; a._shoot(); }
  rest(a); rest(b);
  assert.deepEqual(a.voyage.routeChoices, b.voyage.routeChoices);
  assert.deepEqual(a.voyage.deviceChoices, b.voyage.deviceChoices);
  assert.equal(a.voyage.routeChoices.length, 2);
  assert.ok(a.voyage.routeChoices.some(route => route.risk === 'calm'));
  assert.ok(a.voyage.routeChoices.some(route => route.risk === 'surge'));
});

test('pending experience resumes only after committing a room while preserving the complete build', () => {
  const game = rest(voyage()); game.player.xp = game.player.xpNeeded + 7;
  const level = game.player.level, needed = game.player.xpNeeded;
  game.evolutionId = 'star-bridge'; game.player.weapon = 5; game.player.starCapacitor = true;
  game.upgradeStacks['star-capacitor'] = 1; game.relics = ['phase-mag']; game.tacticId = 'decoy-dash';
  const route = game.voyage.routeChoices[0];
  assert.equal(game.chooseVoyageRoute(route.id, null, null), true);
  assert.equal(game.phase, 'upgrade'); assert.equal(game.player.level, level + 1); assert.equal(game.player.xp, 7);
  assert.equal(game.evolutionId, 'star-bridge'); assert.equal(game.player.weapon, 5); assert.equal(game.player.starCapacitor, true);
  assert.equal(game.upgradeStacks['star-capacitor'], 1); assert.deepEqual(game.relics, ['phase-mag']); assert.equal(game.tacticId, 'decoy-dash');
  assert.ok(game.player.xpNeeded > needed);
  const at = game.elapsed; game.update(.25, { shoot: true }); assert.equal(game.elapsed, at);
  upgrades(game); assert.equal(game.phase, 'playing');
});

test('room travel clears every existing transient combat system without losing lifetime counters', () => {
  const game = rest(voyage());
  game.bullets.push({ id: 999, owner: 'enemy', x: 100, y: 100, lifetime: 2 });
  game.hazards.push({ id: 998, kind: 'blast', x: 100, y: 100, remaining: 2 });
  game.echoBursts.push({ x: 100, y: 100, remaining: 2 });
  game._placeStarPin({ starMultiplier: 1 }, 500, 500); game._placeStarPin({ starMultiplier: 1 }, 700, 500);
  game.player.reversalAmmo = 5; game.player.reversalTimer = 2; game.player.iceChaseTimer = 1;
  game.player.dashTimer = .1; game.player.dashCooldown = 2; game.player.skillCooldown = 5; game.player.slowTimer = 2;
  game.reactor.charge = 100; game.reactor.timer = 5; game.reactor.captures = 7; game.reactor.detonations = 3;
  game.combo.count = 9; game.combo.timer = 3; game.combo.best = 11;
  game.tactical.decoy = { x: 100, y: 100, remaining: 2 }; game.tactical.mine = { x: 100, y: 100, remaining: 2 };
  game.awakeningState.field = { remaining: 2 }; game.awakeningState.charge = { remaining: .5 };
  game.evolutionState.echoes.push({ remaining: 1 });
  const elapsed = game.elapsed, kills = game.kills, score = game.score, nextId = game.nextId;
  travel(game);
  assert.equal(game.elapsed, elapsed); assert.equal(game.kills, kills); assert.equal(game.score, score);
  assert.ok(game.nextId > nextId);
  for (const key of ['bullets', 'hazards', 'echoBursts', 'starPins', 'starLines']) assert.deepEqual(game[key], [], key);
  for (const key of ['dashTimer', 'dashCooldown', 'skillCooldown', 'slowTimer', 'reversalAmmo', 'reversalTimer', 'iceChaseTimer']) assert.equal(game.player[key], 0, key);
  assert.equal(game.reactor.charge, 0); assert.equal(game.reactor.timer, 0); assert.equal(game.reactor.captures, 7); assert.equal(game.reactor.detonations, 3);
  assert.equal(game.combo.count, 0); assert.equal(game.combo.timer, 0); assert.equal(game.combo.best, 11);
  assert.equal(game.tactical.decoy, null); assert.equal(game.tactical.mine, null);
  assert.equal(game.awakeningState.field, null); assert.equal(game.awakeningState.charge, null);
  assert.deepEqual(game.evolutionState.echoes, []); assert.equal(game.delivery, null);
  assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => Math.ceil(weapon.magSize * game.player.magazineMultiplier)));
});

test('room replacement equips a unique selected device into exactly one slot and keeping devices is valid', () => {
  const game = rest(voyage());
  const choice = game.voyage.deviceChoices.find(device => device.id !== 'afterimage');
  assert.ok(choice);
  travel(game, choice.id, 1);
  assert.deepEqual(game.voyage.devices, ['afterimage', choice.id, null]);
  rest(game); const devices = [...game.voyage.devices]; travel(game);
  assert.deepEqual(game.voyage.devices, devices);
  rest(game); const offered = game.voyage.deviceChoices[0]; assert.ok(offered);
  travel(game, offered.id, 0);
  assert.deepEqual(game.voyage.devices, [offered.id, devices[1], null]);
  assert.equal(new Set(game.voyage.devices.filter(Boolean)).size, 2);
});

test('all six nonterminal rooms and the final boss settle once through the actual lifecycle', () => {
  const game = voyage(), rooms = [], rests = [];
  for (let node = 1; node <= 6; node++) {
    assert.equal(game.voyage.node, node); rooms.push(game.voyage.room.type);
    rest(game); rests.push(game.voyage.node); travel(game);
  }
  assert.equal(game.voyage.node, 7); assert.equal(game.phase, 'playing');
  clearRoom(game); assert.equal(game.phase, 'won');
  assert.equal(game.voyage.history.length, 7);
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'win').length, 1);
  assert.equal(events.filter(event => event.type === 'voyage-complete').length, 1);
  const before = snapshot(game); game.update(.25, { shoot: true, moveX: 1 });
  assert.equal(game.useSkill(), false); assert.equal(game.interact(), false); assert.equal(game.chooseVoyageRoute('bad', null, null), false);
  assert.equal(snapshot(game), before); assert.equal(rests.length, 6); assert.equal(rooms.length, 6);
});

test('defeat stops room progression and reset creates independent devices and secrets for another player', () => {
  const game = voyage({ discoveredSecrets: ['rebound'] });
  game.player.invulnerable = 0; game._damagePlayer(10000, { kind: 'boundary-fixture', name: 'Defeat boundary' });
  assert.equal(game.phase, 'lost'); const before = snapshot(game);
  game.update(.25, { shoot: true }); assert.equal(game.interact(), false); assert.equal(snapshot(game), before);
  const other = voyage({ discoveredSecrets: ['ice-break'], deviceId: 'mirror' });
  assert.deepEqual([...game.discoveredSecrets], ['rebound']); assert.deepEqual([...other.discoveredSecrets], ['ice-break']);
  assert.notEqual(game.voyage.devices, other.voyage.devices); assert.notEqual(game.voyage.effects, other.voyage.effects);
  game.reset('frontier', { mode: 'voyage', seed: 731 });
  assert.equal(game.phase, 'ready'); assert.deepEqual(game.voyage.devices, ['afterimage', null, null]);
  assert.equal(game.player.hp, 120); assert.deepEqual([...game.discoveredSecrets], ['rebound']);
});

test('resetting from every starter device into each existing mode clears voyage state and keeps its old contract', () => {
  for (const device of VOYAGE_DEVICES) {
    const game = voyage({ deviceId: device.id, difficulty: 'overload' });
    game.reset('ruins'); assert.equal(game.mode, 'expedition'); assert.equal(game.voyage, null);
    assert.equal(game.map.id, 'ruins'); assert.equal(game.delivery.cargos.length, 3); assert.equal(game.player.hp, 120);
    game.reset('frontier', { mode: 'trial', seed: 7 }); assert.equal(game.mode, 'trial'); assert.equal(game.voyage, null);
    assert.equal(game.trial.totalWaves, 6); assert.equal(game.trial.bossMapId, 'frontier');
    game.reset('storm', { mode: 'campaign', doctrineId: 'marksman', seed: 731 });
    assert.equal(game.mode, 'campaign'); assert.equal(game.voyage, null); assert.equal(game.campaign.totalStages, 3);
    assert.equal(game.map.id, 'storm'); assert.equal(game.campaign.doctrineId, 'marksman');
  }
});
