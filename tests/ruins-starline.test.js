'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAPS, WEAPONS, EVOLUTIONS, UPGRADES } = require('../action-engine.js');

function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
function advance(game, seconds, input = {}) { for (let time = 0; time < seconds - 1e-9; time += 1 / 60) game.update(Math.min(1 / 60, seconds - time), input); }
function quiet(mapId = 'ruins', options = {}) {
  const game = new Game({ mapId, random: () => .5, ...options }); game.start();
  game.enemies = []; game.obstacles = []; game.contracts = []; game.encounters = []; game.crates = []; game.stations = [];
  game.spawnTimer = Infinity; game.relaySpawnTimer = Infinity; game.player.critChance = 0; game.drainEvents();
  return game;
}
function pick(game, index = 0) {
  const cargo = game.delivery.cargos[index]; Object.assign(game.player, { x: cargo.x, y: cargo.y });
  assert.equal(game.interact(), true); game.relaySpawnTimer = Infinity; return cargo;
}
function pins(game, points, multiplier = 1) {
  for (const [x, y] of points) game._placeStarPin({ starMultiplier: multiplier }, x, y);
  return game.starLines.at(-1);
}
function fire(game, x, y, angle = 0) {
  game.switchWeapon(5); Object.assign(game.player, { x, y, angle }); game.fireTimer = 0;
  game._shoot(); const bullet = game.bullets.at(-1); game._updateBullets(1); return bullet;
}
function closeUpgrades(game) { while (game.phase === 'upgrade') assert.equal(game.chooseUpgrade(game.upgradeChoices[0].id), true); }

test('ruins introduces a fifth distinct objective and starline is a full sixth weapon', () => {
  assert.equal(MAPS.find(map => map.id === 'ruins').mode, 'delivery');
  assert.equal(WEAPONS[5].id, 'starline');
  assert.deepEqual([WEAPONS[5].damage, WEAPONS[5].fireInterval, WEAPONS[5].magSize, WEAPONS[5].reloadTime, WEAPONS[5].speed, WEAPONS[5].lifetime], [34, .48, 10, 1.6, 880, .65]);
  assert.equal(new Game({ mapId: 'ruins' }).ammoByWeapon.length, 6);
});

test('cargo sources and route guards are reachable and outside generated rocks', () => {
  const game = new Game({ mapId: 'ruins' });
  assert.equal(game.delivery.cargos.length, 3); assert.equal(new Set(game.delivery.cargos.map(cargo => cargo.relayId)).size, 3);
  for (const cargo of game.delivery.cargos) {
    assert.equal(cargo.status, 'source');
    const relay = game.relays.find(item => item.id === cargo.relayId), gap = Math.hypot(cargo.x - relay.x, cargo.y - relay.y);
    assert.ok(gap >= 600 && gap <= 850);
    for (const point of [cargo, ...cargo.guardPoints]) for (const rock of game.obstacles) assert.ok(Math.hypot(point.x - rock.x, point.y - rock.y) >= rock.radius + 30);
  }
  assert.equal(game.encounters.length, 3);
});

test('empty receivers cannot be activated and their matching source is tracked', () => {
  const game = quiet(), relay = game.relays[0]; Object.assign(game.player, { x: relay.x, y: relay.y });
  assert.equal(game.interact(), false); assert.equal(relay.status, 'idle');
  assert.equal(game.deliveryTarget(relay).id, game.delivery.cargos[0].id); assert.match(game.interactionHint(), /找到对应星火/);
});

test('pickup prioritizes the source over nearby supplies and spawns route pressure only once', () => {
  const game = quiet(), cargo = game.delivery.cargos[0];
  game.crates = [{ id: 999, type: 'crate', x: cargo.x, y: cargo.y, radius: 20, opened: false }];
  pick(game); assert.equal(game.crates[0].opened, false); assert.equal(game.delivery.carriedId, cargo.id);
  assert.equal(game.enemies.length, 3); assert.deepEqual(game.enemies.map(enemy => enemy.type), ['crawler', 'crawler', 'spitter']);
  for (const enemy of game.enemies) assert.ok(Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) > 280);
  assert.equal(game.interact(), false); assert.equal(game.enemies.length, 3);
  assert.equal(game.drainEvents().filter(event => event.type === 'cargo-picked').length, 1);
});

test('carried cargo slows ordinary walking only and preserves shoot reload switch and EMP', () => {
  const game = quiet(), cargo = pick(game); game.enemies = []; const start = game.player.x;
  advance(game, .1, { moveX: 1, shoot: true }); near(game.player.x - start, 218 * .88 * .1);
  assert.ok(game.ammoByWeapon[0] < 30); assert.equal(game.reload(), true); assert.equal(game.switchWeapon(5), true);
  assert.equal(game.useSkill(), true); assert.equal(cargo.status, 'carried'); assert.equal(game.delivery.carriedId, cargo.id);
});

test('carrying only accepts its own receiver and never opens a nearby crate or shop', () => {
  const game = quiet(), cargo = pick(game), other = game.relays[1]; game.enemies = [];
  Object.assign(game.player, { x: other.x, y: other.y, credits: 100 });
  game.crates = [{ id: 900, type: 'crate', x: other.x, y: other.y, radius: 20, opened: false }];
  game.stations = [{ id: 901, type: 'station', kind: 'medical', x: other.x, y: other.y, cost: 10, uses: 0 }];
  assert.equal(game.interact(), false); assert.equal(game.completedRelays, 0); assert.equal(game.player.credits, 100); assert.equal(game.crates[0].opened, false);
  assert.equal(game.deliveryTarget().id, cargo.relayId);
});

test('delivery grants the usual objective reward exactly once and three deliveries spawn one boss', () => {
  const game = quiet();
  for (let index = 0; index < 3; index++) {
    const cargo = pick(game, index), relay = game.relays[index]; game.enemies = [];
    Object.assign(game.player, { x: relay.x, y: relay.y, hp: 10 }); const xp = game.player.xp, credits = game.player.credits;
    assert.equal(game.interact(), true); assert.equal(cargo.status, 'delivered'); assert.equal(game.delivery.carriedId, null);
    assert.equal(relay.status, 'active'); assert.equal(game.completedRelays, index + 1);
    assert.equal(game.player.xp, xp + 60); assert.equal(game.player.credits, credits + 30); assert.equal(game.player.hp, 45);
    assert.equal(game.interact(), false); assert.equal(game.completedRelays, index + 1);
  }
  assert.equal(game.enemies.filter(enemy => enemy.type === 'boss').length, 1); assert.equal(game.bossSpawned, true);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'cargo-delivered').length, 3); assert.equal(events.filter(event => event.type === 'boss-spawn').length, 1);
  assert.equal(game.deliveryTarget(), null);
});

test('successful dash leaves a recoverable cargo at the start and failed dash does not alter it', () => {
  const game = quiet(), cargo = pick(game); game.enemies = []; game.player.dashCooldown = 1;
  assert.equal(game.dash({ x: 1, y: 0 }), false); assert.equal(cargo.status, 'carried'); game.player.dashCooldown = 0;
  const start = { x: game.player.x, y: game.player.y };
  assert.equal(game.dash({ x: 1, y: 0 }), true); assert.equal(cargo.status, 'dropped'); assert.equal(game.delivery.carriedId, null);
  near(cargo.x, start.x); near(cargo.y, start.y); near(cargo.pickupLock, .35); assert.equal(game.interact(), false);
  advance(game, .35); near(game.player.x - start.x, 162);
  Object.assign(game.player, start); assert.equal(game.interact(), true); assert.equal(cargo.status, 'carried'); assert.equal(game.enemies.length, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'cargo-dropped').length, 1);
});

test('a dropped cargo blocks taking a second source but never expires or moves during pause', () => {
  const game = quiet(), cargo = pick(game); game.enemies = []; game.dash({ x: 1, y: 0 }); advance(game, .35);
  const next = game.delivery.cargos[1]; Object.assign(game.player, { x: next.x, y: next.y });
  assert.equal(game.interact(), false); assert.equal(next.status, 'source');
  game.phase = 'paused'; const lock = cargo.pickupLock; advance(game, 20); assert.equal(cargo.pickupLock, lock); assert.equal(cargo.status, 'dropped');
  game.phase = 'playing'; advance(game, 20); assert.equal(cargo.status, 'dropped');
});

test('return-dash never drops twice and permits carrying a recovered cargo on the one return', () => {
  const game = quiet('ruins', { mode: 'campaign', doctrineId: 'skirmisher' }); game.campaign.awakeningId = 'return-dash';
  const cargo = pick(game); game.enemies = []; game.dash({ x: 1, y: 0 }); advance(game, .35);
  game.player.x = cargo.x + 50; assert.equal(game.interact(), true);
  assert.equal(game.dash({ x: -1, y: 0 }), true); assert.equal(cargo.status, 'carried');
  assert.equal(game.drainEvents().filter(event => event.type === 'cargo-dropped').length, 1);
});

test('carry pulse locks the old position with real dodge time even during initial breathing', () => {
  const game = quiet(), cargo = pick(game); game.enemies = []; game.breathingTimer = 6;
  advance(game, 1.4); assert.equal(game.hazards.length, 1); const pulse = game.hazards[0];
  assert.equal(pulse.cargoPulse, true); assert.equal(pulse.cargoId, cargo.id); assert.equal(pulse.radius, 95); assert.equal(pulse.damage, 16);
  near(pulse.duration, 1.4); const x = pulse.x;
  advance(game, 1, { moveX: 1 }); near(pulse.x, x); assert.equal(game.player.hp, 120);
  advance(game, .5, { moveX: 1 }); assert.equal(game.player.hp, 120); assert.equal(game.hazards.length, 0);
});

test('carry blast harms the player and ordinary enemies but its warning is not instant damage', () => {
  const game = quiet(); pick(game); game.enemies = []; advance(game, 1.4); assert.equal(game.player.hp, 120);
  const enemy = game.spawnEnemy('spitter', { x: game.player.x, y: game.player.y }); enemy.hp = 100; enemy.maxHp = 100;
  game._updateHazards(1.4); assert.equal(game.player.hp, 104); assert.equal(enemy.hp, 40);
});

test('putting down pauses the remaining carry clock and repeated recovery cannot reset it', () => {
  const game = quiet(), cargo = pick(game); game.enemies = []; advance(game, .7); const timer = game.sectorThreat.timer;
  game.dash({ x: 1, y: 0 }); advance(game, .35); near(game.sectorThreat.timer, timer); assert.equal(game.hazards.length, 0);
  Object.assign(game.player, { x: cargo.x, y: cargo.y }); assert.equal(game.interact(), true); near(game.sectorThreat.timer, timer);
  advance(game, .7); assert.equal(game.hazards.filter(hazard => hazard.cargoPulse).length, 1);
});

test('starting a cargo respects pending encounter rewards and never consumes a source while paused', () => {
  const game = quiet(), cargo = game.delivery.cargos[0]; Object.assign(game.player, { x: cargo.x, y: cargo.y });
  game.encounters = [{ status: 'ready' }]; assert.equal(game.interact(), false); assert.equal(cargo.status, 'source');
  game.encounters = []; game.phase = 'paused'; assert.equal(game.interact(), false); assert.equal(cargo.status, 'source');
});

test('starline actual impact leaves one pin at an enemy surface and does not acquire grenade or blade behavior', () => {
  const game = quiet('frontier'); game.relays = [];
  const enemy = game.spawnEnemy('tank', { x: 1250, y: 1000 }); const before = enemy.hp;
  const bullet = fire(game, 1000, 1000);
  assert.equal(bullet.kind, 'starline'); assert.equal(bullet.blastRadius, undefined); assert.equal(bullet.returning, undefined);
  near(before - enemy.hp, 34 * .8); assert.equal(game.starPins.length, 1); near(game.starPins[0].x, 1250 - enemy.radius - 3); near(game.starPins[0].y, 1000);
  assert.equal(game.bullets.length, 0); assert.equal(game.hazards.length, 0);
});

test('rock impact is the first surface and an outward connection can use a rock pin', () => {
  const game = quiet('frontier'); game.relays = [];
  game.obstacles = [{ id: 800, type: 'rock', x: 1200, y: 1000, radius: 40 }];
  const enemy = game.spawnEnemy('crawler', { x: 1250, y: 1000 }); const hp = enemy.hp;
  const bullet = fire(game, 1000, 1000); assert.equal(enemy.hp, hp); assert.equal(game.starPins.length, 1);
  near(game.starPins[0].x, 1157); assert.equal(game.starPins[0].obstacleId, 800);
  game._placeStarPin({ starMultiplier: 1 }, 1100, 1180); assert.equal(game.starLines.length, 1);
  game._placeStarPin(bullet, 1100, 1180); assert.equal(game.starPins.length, 2);
});

test('lifetime endpoint and world-boundary endpoint match the starline prediction', () => {
  for (const [x, y, angle] of [[1000, 1000, 0], [3150, 1200, .2], [70, 70, Math.PI * 1.2]]) {
    const game = quiet('frontier'); game.relays = []; game.switchWeapon(5); Object.assign(game.player, { x, y, angle });
    const preview = game.starlinePreview(); fire(game, x, y, angle);
    assert.equal(game.starPins.length, 1); near(game.starPins[0].x, preview.x); near(game.starPins[0].y, preview.y);
    assert.ok(game.starPins[0].x >= 0 && game.starPins[0].x <= game.world.width && game.starPins[0].y >= 0 && game.starPins[0].y <= game.world.height);
  }
});

test('connection range is inclusive and intervening rocks prevent pairing', () => {
  for (const [gap, count] of [[34.99, 0], [35, 1], [520, 1], [520.01, 0]]) {
    const game = quiet(); pins(game, [[800, 1000], [800 + gap, 1000]]); assert.equal(game.starLines.length, count);
  }
  const game = quiet(); game.obstacles = [{ id: 10, x: 1000, y: 1000, radius: 30 }];
  pins(game, [[800, 1000], [1200, 1000]]); assert.equal(game.starLines.length, 0);
  game._clearStarline(); game.obstacles = [{ id: 10, x: 1200, y: 1000, radius: 40 }];
  game._placeStarPin({ starMultiplier: 1 }, 1157, 1000, 10); game._placeStarPin({ starMultiplier: 1 }, 1300, 1000);
  assert.equal(game.starLines.length, 0, 'A rock endpoint cannot exempt a connection through that rock');
});

test('pins and lines stay strictly bounded and disappear after their finite lifetimes', () => {
  for (const evolved of [false, true]) {
    const game = quiet(); if (evolved) game.evolutionId = 'star-bridge';
    for (let index = 0; index < 40; index++) {
      game._placeStarPin({ starMultiplier: 1 }, 800 + index % 2 * 200, 800 + Math.floor(index / 2) * 2);
      assert.ok(game.starPins.length <= (evolved ? 6 : 4)); assert.ok(game.starLines.length <= (evolved ? 3 : 2));
      assert.ok(game.starLines.every(line => line.pinIds.every(id => game.starPins.some(pin => pin.id === id))));
    }
    game._ageStarline(4); assert.equal(game.starLines.length, 0); game._ageStarline(2); assert.equal(game.starPins.length, 0);
  }
});

test('a new line cannot outlive its older pin and the capacitor adds time without damage', () => {
  const game = quiet(); game.player.starCapacitor = true; pins(game, [[800, 1000]]); game._ageStarline(4);
  const short = pins(game, [[1000, 1000]]); assert.equal(short.remaining, 2); assert.equal(short.damage, 55);
  game._clearStarline(); const full = pins(game, [[800, 1000], [1000, 1000]]); assert.equal(full.remaining, 5); assert.equal(full.damage, 55);
});

test('each line hurts each enemy at most once and applies a finite ordinary walking slow', () => {
  const game = quiet(); const enemy = game.spawnEnemy('spitter', { x: 1000, y: 1000 }); enemy.hp = 500;
  const line = pins(game, [[800, 1000], [1200, 1000]]); game._updateStarline(); assert.equal(enemy.hp, 445); near(enemy.starSlowTimer, 1.2);
  game._updateStarline(); assert.equal(enemy.hp, 445); assert.deepEqual(line.hitIds, [enemy.id]);
  const x = enemy.x; game._steerMove(enemy, 1, 0, 100, .1); near(enemy.x - x, 6.5);
  enemy.attackTimer = 100; game._updateEnemies(1.21); assert.equal(enemy.starSlowTimer, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'starline-trigger').length, 1);
});

test('line damage takes the lower shot snapshot and critical bullets do not double trap damage', () => {
  const game = quiet(); game.player.critChance = 1; game.player.damageMultiplier = 2;
  const bullet = fire(game, 600, 1000); assert.equal(bullet.damage, 136); near(game.starPins[0].damageMultiplier, 2);
  game._placeStarPin({ starMultiplier: 1.15 }, game.starPins[0].x, 1200);
  near(game.starLines[0].damage, 55 * 1.15);
});

test('bosses take half wire damage without slow while fixed targets do not trigger', () => {
  const game = quiet(); const boss = game.spawnEnemy('boss', { x: 1000, y: 1000 }); const hp = boss.hp;
  const fixed = ['nest', 'reactor', 'anchor'].map(type => game.spawnEnemy(type, { x: 1000, y: 1000 })); const fixedHp = fixed.map(enemy => enemy.hp);
  const line = pins(game, [[800, 1000], [1200, 1000]]); game._updateStarline(); near(hp - boss.hp, 27.5); assert.equal(boss.starSlowTimer, undefined);
  assert.deepEqual(fixed.map(enemy => enemy.hp), fixedHp); assert.deepEqual(line.hitIds, [boss.id]);
});

test('wire slow does not cancel or change a locked charger rush', () => {
  const game = quiet(); const enemy = game.spawnEnemy('charger', { x: 1000, y: 1000 }); enemy.hp = 500;
  Object.assign(enemy, { chargeTimer: .6, chargeX: 1, chargeY: 0 }); pins(game, [[800, 1000], [1200, 1000]]); game._updateStarline();
  const x = enemy.x; game._updateEnemies(.1); near(enemy.x - x, 44); near(enemy.chargeTimer, .5); assert.ok(enemy.starSlowTimer > 0);
});

test('public updates detect a complete charger crossing even when the outer update endpoints miss the wire', () => {
  const game = quiet('frontier'); game.relays = []; Object.assign(game.player, { x: 1500, y: 1400 });
  const enemy = game.spawnEnemy('charger', { x: 1000, y: 970 }); enemy.hp = 500;
  Object.assign(enemy, { chargeTimer: .63, chargeX: 0, chargeY: 1 }); const line = pins(game, [[800, 1000], [1200, 1000]]);
  assert.ok(Math.abs(enemy.y - 1000) > enemy.radius + 4);
  game.update(.15); near(enemy.y, 1036); assert.ok(Math.abs(enemy.y - 1000) > enemy.radius + 4);
  assert.equal(enemy.hp, 445); assert.deepEqual(line.hitIds, [enemy.id]); near(enemy.chargeTimer, .48);
  game.update(.05); assert.equal(enemy.hp, 445); assert.equal(game.drainEvents().filter(event => event.type === 'starline-trigger').length, 1);
});

test('star bridge remains a real single-slot evolution with its own level and prerequisite', () => {
  const game = quiet(); game.player.weapon = 5; game.player.level = 3; game.upgradeStacks['star-capacitor'] = 1;
  game._levelUp(); assert.ok(game.upgradeChoices.some(choice => choice.id === 'star-bridge')); assert.equal(game.chooseUpgrade('star-bridge'), true);
  assert.equal(game.evolutionId, 'star-bridge'); assert.equal(EVOLUTIONS.find(item => item.id === 'star-bridge').weapon, 5);
  assert.equal(UPGRADES.find(item => item.id === 'star-capacitor').weapon, 5);
  game._levelUp(); assert.equal(game.upgradeChoices.some(choice => choice.evolution), false);
});

test('star bridge clears one nearby enemy bullet per enemy trigger, at most two per line', () => {
  const game = quiet(); game.evolutionId = 'star-bridge'; const line = pins(game, [[800, 1000], [1200, 1000]]);
  const bullets = [0, 1, 2, 3].map(index => ({ id: 10000 + index, owner: 'enemy', x: 1000 + index * 20, y: index === 3 ? 1061 : 1040, lifetime: 3 }));
  game.bullets.push(...bullets); game.bullets.push({ id: 20000, owner: 'player', x: 1000, y: 1000, lifetime: 3 });
  for (let index = 0; index < 3; index++) { const enemy = game.spawnEnemy('spitter', { x: 900 + index * 100, y: 1000 }); enemy.hp = 500; }
  game._updateStarline(); assert.equal(line.clearedBullets, 2); assert.equal(bullets.filter(bullet => bullet.lifetime === 0).length, 2);
  assert.equal(bullets[3].lifetime, 3); assert.equal(game.bullets.at(-1).lifetime, 3);
  assert.equal(line.damage, 55); assert.equal(game.drainEvents().filter(event => event.type === 'starline-capture').length, 2);
});

test('ordinary lines never clear bullets and a repeated trigger cannot consume bridge quota', () => {
  const game = quiet(); const line = pins(game, [[800, 1000], [1200, 1000]]), enemy = game.spawnEnemy('spitter', { x: 1000, y: 1000 }); enemy.hp = 500;
  const bullet = { id: 10000, owner: 'enemy', x: 1000, y: 1000, lifetime: 3 }; game.bullets.push(bullet);
  game._updateStarline(); assert.equal(bullet.lifetime, 3); line.bridge = true; game._updateStarline(); assert.equal(line.clearedBullets, 0); assert.equal(bullet.lifetime, 3);
});

test('pin aging and line hits are suspended during menus', () => {
  const game = quiet(); const line = pins(game, [[800, 1000], [1200, 1000]]), enemy = game.spawnEnemy('spitter', { x: 1000, y: 1000 }); const hp = enemy.hp;
  game.phase = 'upgrade'; advance(game, 10); near(line.remaining, 4); near(game.starPins[0].remaining, 6); assert.equal(enemy.hp, hp);
});

test('ruins boss attacks have matching hazards, fixed telegraphs and distinct phase-two fan counts', () => {
  for (const stage of [1, 2]) for (const attack of [1, 2, 0]) {
    const game = quiet(); const boss = game.spawnEnemy('boss', { x: 1000, y: 1000 }); Object.assign(game.player, { x: 1400, y: 1000 });
    Object.assign(boss, { stage, hp: stage === 2 ? 1000 : 3200, attackCount: attack === 0 ? 2 : attack - 1, attackTimer: 0 });
    game._updateBoss(boss, 0, 1, 0, 400); assert.ok(boss.attackName && boss.attackHint); assert.ok(boss.windup >= 1.3);
    if (attack === 1) { assert.equal(boss.attackKind, 'ruins-lattice'); assert.equal(game.hazards.length, 2); assert.ok(game.hazards.every(hazard => hazard.type === 'lane' && hazard.duration === 1.4)); }
    if (attack === 2) {
      assert.equal(boss.attackKind, 'ruins-collapse'); assert.equal(game.hazards.length, 3); const positions = game.hazards.map(hazard => [hazard.x, hazard.y]);
      game.player.y += 300; game._updateBoss(boss, .4, 1, 0, 400); assert.deepEqual(game.hazards.map(hazard => [hazard.x, hazard.y]), positions);
    }
    if (attack === 0) { assert.equal(boss.attackKind, 'fan'); game._updateBoss(boss, 1.3, 1, 0, 400); assert.equal(game.bullets.length, stage === 1 ? 7 : 11); }
  }
});

test('terminal win and loss clear wire states and cargo without late trap kills', () => {
  for (const result of ['win', 'loss']) {
    const game = quiet(); pick(game); game.enemies = []; pins(game, [[800, 1000], [1200, 1000]]);
    if (result === 'win') { game._spawnBoss(); game._damageEnemy(game.enemies.find(enemy => enemy.type === 'boss'), 1e9); }
    else { game.player.invulnerable = 0; game._damagePlayer(1e9); }
    assert.equal(game.starPins.length, 0); assert.equal(game.starLines.length, 0); assert.equal(game.delivery, null);
    assert.equal(game.phase, result === 'win' ? 'won' : 'lost'); const kills = game.kills; advance(game, 20); assert.equal(game.kills, kills);
  }
});

test('campaign departure keeps weapon six and its capacitor while clearing cargo and traps', () => {
  const game = quiet('ruins', { mode: 'campaign', doctrineId: 'conductor', seed: 7 }); pick(game); game.enemies = [];
  game.player.weapon = 5; game.player.starCapacitor = true; game.upgradeStacks['star-capacitor'] = 1; game.evolutionId = 'star-bridge'; pins(game, [[800, 1000], [1200, 1000]]);
  game._spawnBoss(); game._damageEnemy(game.enemies.find(enemy => enemy.type === 'boss'), 1e9);
  assert.equal(game.delivery, null); assert.equal(game.starLines.length, 0); assert.equal(game.campaign.routeChoices.length, 4);
  assert.equal(game.chooseCampaignRoute('foundry', 'repair', 'mobile-field'), true); closeUpgrades(game);
  assert.equal(game.player.weapon, 5); assert.equal(game.player.starCapacitor, true); assert.equal(game.evolutionId, 'star-bridge'); assert.equal(game.starPins.length, 0); assert.equal(game.delivery, null);
  assert.equal(game.ammoByWeapon[5], WEAPONS[5].magSize);
});
