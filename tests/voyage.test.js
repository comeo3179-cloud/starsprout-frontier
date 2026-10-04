'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAPS, WEAPONS, VOYAGE_DEVICES, VOYAGE_RESONANCES, VOYAGE_DIFFICULTIES } = require('../action-engine.js');

function voyage(deviceId = 'afterimage', options = {}) {
  const game = new Game({ mode: 'voyage', deviceId, seed: 19, ...options });
  game.start(); game.obstacles = []; game.drainEvents();
  return game;
}
function perfect(game) {
  const index = game.player.weapon;
  game.ammoByWeapon[index] = game._magSize(index) - 1;
  assert.equal(game.reload(), true);
  game.reloadByWeapon[index] = game.reloadDurationByWeapon[index] * .38;
  assert.equal(game.reload(), true);
}
function fire(game) { game.fireTimer = 0; game._shoot(); }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
function rest(game) {
  game.voyage.room.spawned = game.voyage.room.quota; game.enemies = [];
  game._checkVoyageObjective();
  Object.assign(game.player, { x: game.voyage.room.exit.x, y: game.voyage.room.exit.y });
  assert.equal(game.interact(), true);
}
function finale(game) {
  game.enemies = []; game.voyage.node = 7;
  game._configureVoyageRoom(game.voyage.plans[6][0]);
  game.obstacles = []; game.drainEvents();
  return game.enemies.find(enemy => enemy.type === 'boss');
}

test('voyage is an independent seven-node mode and keeps the five sectors and six weapons intact', () => {
  const game = new Game({ mode: 'voyage', seed: -1, deviceId: 'invalid', difficulty: 'invalid' });
  assert.equal(game.voyage.seed, 4294967295); assert.equal(game.voyage.node, 1); assert.equal(game.voyage.totalNodes, 7);
  assert.equal(game.voyage.difficulty, 'normal'); assert.equal(game.voyage.initialDeviceId, 'afterimage');
  assert.deepEqual(game.voyage.devices, ['afterimage', null, null]);
  assert.equal(game.phase, 'ready'); assert.equal(game.campaign, null); assert.equal(game.trial, null);
  assert.deepEqual(game.world, { width: 1700, height: 1200 });
  assert.equal(game.relays.length + game.stations.length + game.contracts.length + game.encounters.length, 0);
  assert.equal(MAPS.length, 5); assert.equal(WEAPONS.length, 6); assert.equal(new Game().voyage, null);
  assert.equal(VOYAGE_DEVICES.length, 6); assert.equal(VOYAGE_RESONANCES.length, 3); assert.equal(VOYAGE_DIFFICULTIES.length, 2);
});

test('seeded route offers do not depend on combat randomness, and final node has its own destination', () => {
  const a = voyage('mirror', { seed: 123 }), b = voyage('well', { seed: 123 });
  for (let index = 0; index < 300; index++) a.random();
  assert.deepEqual(a.voyage.plans, b.voyage.plans);
  for (const routes of a.voyage.plans.slice(1, 6)) {
    assert.equal(routes.length, 2); assert.notEqual(routes[0].type, routes[1].type);
    assert.equal(routes[0].risk, 'calm'); assert.equal(routes[1].risk, 'surge');
    assert.equal(routes[0].reward, 35); assert.equal(routes[1].reward, 65);
  }
  assert.equal(a.voyage.plans[6][0].type, 'finale'); assert.equal(a.voyage.plans[6].length, 1);
});

test('normal and overload alter only voyage enemy health, damage and finite quotas', () => {
  const normal = voyage('afterimage'), hard = voyage('afterimage', { difficulty: 'overload' });
  const a = normal.spawnEnemy('crawler', { x: 500, y: 500 }), b = hard.spawnEnemy('crawler', { x: 500, y: 500 });
  assert.equal(a.maxHp, 38); assert.equal(b.maxHp, 46); near(b.damage, a.damage * 1.12);
  assert.equal(normal.voyage.room.quota, 12); assert.equal(hard.voyage.room.quota, 15);
  assert.equal(finale(normal).maxHp, 4800); assert.equal(finale(hard).maxHp, 4800);
  assert.equal(new Game({ difficulty: 'overload' }).spawnEnemy('crawler', { x: 500, y: 500 }).maxHp, 38);
});

test('three voyage environments have distinct physical cover and reproduce with the same seed and node', () => {
  const shapes = [];
  for (const biome of ['cosmos', 'forge', 'tide']) {
    const a = voyage('afterimage', { seed: 912 }), b = voyage('afterimage', { seed: 912 });
    const route = { id: 'geometry-' + biome, type: 'clear', biome, risk: 'calm', reward: 35 };
    a._configureVoyageRoom(route); for (let index = 0; index < 50; index++) b.random(); b._configureVoyageRoom(route);
    const shape = game => game.obstacles.map(({ x, y, radius }) => ({ x, y, radius }));
    assert.deepEqual(shape(a), shape(b)); shapes.push(JSON.stringify(shape(a)));
    assert.ok(a.obstacles.length >= 9 && a.obstacles.length <= 12);
  }
  assert.equal(new Set(shapes).size, 3);
});

test('physical cover stays clear of every objective, portal, spawn and exit for boundary seeds and later nodes', () => {
  for (const seed of [0, 1, 19, 4294967295]) for (const node of [1, 3, 6]) for (const biome of ['cosmos', 'forge', 'tide']) {
    const game = voyage('afterimage', { seed }); game.voyage.node = node;
    game._configureVoyageRoom({ id: 'protected', type: 'harvest', biome, risk: 'calm', reward: 35 });
    const room = game.voyage.room, points = [game.player, room.exit, ...room.portals, ...room.collectors];
    assert.ok(game.obstacles.length >= 9 && game.obstacles.length <= 12);
    for (const rock of game.obstacles) for (const point of points) assert.ok(Math.hypot(rock.x - point.x, rock.y - point.y) >= rock.radius + (point.radius || 65) + 22);
  }
});

test('successful dash leaves one bounded real trail and each target takes its 32 damage once', () => {
  const game = voyage(), origin = { x: game.player.x, y: game.player.y };
  const core = game.spawnEnemy('reactor', { x: origin.x + 80, y: origin.y });
  assert.equal(game.dash({ x: 1, y: 0 }), true); assert.equal(game.dash({ x: 1, y: 0 }), false);
  game.update(.2);
  assert.equal(game.voyage.effects.trails.length, 1); near(core.hp, 868);
  game.update(.25); near(core.hp, 868);
  const trail = game.voyage.effects.trails[0]; assert.equal(trail.width, 24);
  near(trail.endX, origin.x + 162); assert.equal(trail.hitIds.length, 1);
  for (let index = 0; index < 4; index++) { game.player.dashCooldown = 0; game.dash({ x: 1, y: 0 }); }
  assert.equal(game.voyage.effects.trails.length, 2);
});

test('trail geometry stops at the first rock and cannot damage a target behind it', () => {
  const game = voyage(), x = game.player.x, y = game.player.y;
  game.obstacles = [{ x: x + 65, y, radius: 25 }];
  const core = game.spawnEnemy('reactor', { x: x + 155, y });
  game.dash({ x: 1, y: 0 }); game.update(.2);
  assert.ok(game.voyage.effects.trails[0].endX < x + 40); assert.equal(core.hp, 900);
});

test('a dash primes two needles for one actual shotgun volley, with no trigger on blocked firing', () => {
  const game = voyage('needles'); game.player.weapon = 1; game._syncWeapon();
  game.dash({ x: 1, y: 0 }); game.fireTimer = 1; game._shoot();
  assert.equal(game.voyage.effects.needleTimer, 2); assert.equal(game.bullets.length, 0);
  fire(game);
  assert.equal(game.bullets.filter(bullet => bullet.deviceId === 'needles').length, 2);
  assert.equal(game.bullets.filter(bullet => !bullet.voyageDevice).length, 8);
  assert.equal(game.voyage.effects.needleTimer, 0);
  fire(game); assert.equal(game.bullets.filter(bullet => bullet.deviceId === 'needles').length, 2);
});

test('expired dash prime cannot create a delayed needle volley', () => {
  const game = voyage('needles'); game.dash({ x: 1, y: 0 }); game._updateVoyageEffects(2);
  fire(game); assert.equal(game.bullets.some(bullet => bullet.deviceId === 'needles'), false);
});

test('star gate resonance collapses each live trail once and consumes the firing window', () => {
  const game = voyage(); game.voyage.devices = ['afterimage', 'needles', null];
  const core = game.spawnEnemy('reactor', { x: game.player.x + 80, y: game.player.y });
  game.dash({ x: 1, y: 0 }); game.update(.2); near(core.hp, 868);
  fire(game); near(core.hp, 823); assert.equal(game.voyage.effects.trails.length, 0);
  fire(game); near(core.hp, 823);
  assert.equal(game.drainEvents().filter(event => event.type === 'voyage-resonance' && event.stage === 'collapse').length, 1);
});

test('ordinary reload does not calibrate, and perfect reload grants exactly one 28 damage mirror', () => {
  const game = voyage('mirror'); game.ammoByWeapon[0] = 20; game.reload(); game._finishReload(0, false);
  assert.equal(game.voyage.effects.mirrorTimer, 0);
  perfect(game); assert.equal(game.voyage.effects.mirrorTimer, 4);
  fire(game);
  const mirrors = game.bullets.filter(bullet => bullet.deviceId === 'mirror');
  assert.equal(mirrors.length, 1); near(mirrors[0].damage, 28); assert.equal(mirrors[0].pierce, 2);
  game._updateBullets(.01); assert.ok(Number.isFinite(mirrors[0].age)); near(mirrors[0].age, .01);
  fire(game); assert.equal(game.bullets.filter(bullet => bullet.deviceId === 'mirror').length, 1);
});

test('all six weapons trigger a calibrated auxiliary shot once per real firing action', () => {
  for (let weapon = 0; weapon < 6; weapon++) {
    const game = voyage('mirror'); game.player.weapon = weapon; game._syncWeapon(); perfect(game); fire(game);
    assert.equal(game.bullets.filter(bullet => bullet.deviceId === 'mirror').length, 1, 'weapon ' + weapon);
  }
});

test('device bullets obey swept rock collision and do not inherit weapon evolutions or arc effects', () => {
  const game = voyage('mirror'), x = game.player.x, y = game.player.y;
  game.player.angle = 0; game.player.arcRounds = true; game.evolutionId = 'assault-chain';
  const core = game.spawnEnemy('reactor', { x: x + 150, y });
  game.obstacles = [{ x: x + 70, y, radius: 25 }]; perfect(game); fire(game);
  const auxiliary = game.bullets.find(bullet => bullet.deviceId === 'mirror');
  assert.equal(auxiliary.weapon, -1); assert.equal(auxiliary.arc, undefined); assert.equal(auxiliary.evolutionId, undefined);
  game._updateBullets(.25); assert.equal(core.hp, 900);
});

test('one suspended prism fires two shots at clear nearest targets and expires after three seconds', () => {
  const game = voyage('sentry'); game.spawnEnemy('reactor', { x: game.player.x + 100, y: game.player.y }); perfect(game);
  const sentry = game.voyage.effects.sentry; game._updateVoyageEffects(.15);
  assert.equal(sentry.shots, 1); game._updateVoyageEffects(1.25); assert.equal(sentry.shots, 2);
  game._updateVoyageEffects(.5); assert.equal(sentry.shots, 2);
  assert.equal(game.bullets.filter(bullet => bullet.deviceId === 'sentry').length, 2);
  game._updateVoyageEffects(1.2); assert.equal(game.voyage.effects.sentry, null);
});

test('prism refuses targets behind rock and perfect reload cannot refresh it during calibration lockout', () => {
  const game = voyage('sentry'), x = game.player.x, y = game.player.y;
  game.spawnEnemy('reactor', { x: x + 160, y }); game.obstacles = [{ x: x + 80, y, radius: 30 }];
  perfect(game); const sentry = game.voyage.effects.sentry;
  game._updateVoyageEffects(.2); assert.equal(sentry.shots, 0);
  game.player.x -= 100; perfect(game); assert.equal(game.voyage.effects.sentry, sentry);
});

test('cross mirror fires from the old prism position towards the current aim point after moving', () => {
  const game = voyage('mirror'); game.voyage.devices = ['mirror', 'sentry', null]; perfect(game);
  const sentry = { ...game.voyage.effects.sentry };
  game.player.x += 100; game.voyage.aimTarget = { x: game.player.x + 200, y: game.player.y - 250 };
  game.player.angle = Math.atan2(-250, 200); fire(game);
  const mirrors = game.bullets.filter(bullet => bullet.deviceId === 'mirror');
  assert.equal(mirrors.length, 2); near(mirrors[0].damage, 28); near(mirrors[1].damage, 42);
  near(Math.atan2(mirrors[1].vy, mirrors[1].vx), Math.atan2(-250, 300));
  assert.ok(Math.abs(mirrors[1].x - sentry.x) <= 22);
});

test('tidal well pulls ordinary free enemies, resists terrain, and never pulls bosses or locked charges', () => {
  const game = voyage('well'), x = game.player.x, y = game.player.y;
  const enemy = game.spawnEnemy('crawler', { x: x + 110, y }), boss = game.spawnEnemy('boss', { x, y: y - 100 });
  const charger = game.spawnEnemy('charger', { x: x - 110, y }); charger.windup = 1;
  game._voyagePulse(game.player); game._updateVoyageEffects(1);
  near(enemy.x, x + 70); assert.equal(boss.y, y - 100); assert.equal(charger.x, x - 110);
  game.obstacles = [{ x: x + 35, y, radius: 20 }]; const before = enemy.x;
  game._updateVoyageEffects(.25); near(enemy.x, before);
  game._updateVoyageEffects(1.35); assert.equal(game.voyage.effects.well, null);
});

test('aurora battery contributes three shots, does not reset on firing, and expires cleanly', () => {
  const game = voyage('battery'); game.useSkill();
  for (let index = 0; index < 4; index++) fire(game);
  const shots = game.bullets.filter(bullet => bullet.deviceId === 'battery');
  assert.equal(shots.length, 3); shots.forEach(bullet => near(bullet.damage, 26));
  assert.equal(game.voyage.effects.batteryCharges, 0);
  game.player.skillCooldown = 0; game.useSkill(); game._updateVoyageEffects(3); fire(game);
  assert.equal(game.voyage.effects.batteryCharges, 0); assert.equal(game.bullets.filter(bullet => bullet.deviceId === 'battery').length, 3);
});

test('reverse tide uses the same EMP key once, adds 75 damage and retains its original cooldown', () => {
  const game = voyage('well'); game.voyage.devices = ['well', 'battery', null];
  const core = game.spawnEnemy('reactor', { x: game.player.x + 80, y: game.player.y });
  assert.equal(game.useSkill(), true); near(core.hp, 835); assert.equal(game.voyageActionState().collapseReady, true);
  const cooldown = game.player.skillCooldown;
  assert.equal(game.useSkill(), true); near(core.hp, 760); near(game.player.skillCooldown, cooldown);
  assert.equal(game.voyageActionState().collapseReady, false); assert.equal(game.useSkill(), false);
  assert.equal(game.voyage.effects.batteryCharges, 3);
});

test('reverse tide cannot damage through a rock or trigger in safe menus', () => {
  const game = voyage('well'); game.voyage.devices = ['well', 'battery', null];
  const x = game.player.x, y = game.player.y, core = game.spawnEnemy('reactor', { x: x + 100, y });
  game.obstacles = [{ x: x + 50, y, radius: 22 }]; game._voyagePulse(game.player); game.player.skillCooldown = 9;
  assert.equal(game.useSkill(), true); assert.equal(core.hp, 900); near(game.player.skillCooldown, 9);
  game._voyagePulse(game.player); game.phase = 'voyage-rest'; assert.equal(game.useSkill(), false);
});

test('harvesting rewards a nearby kill with two charges and still rewards distant kills with one', () => {
  const game = voyage(); game.enemies = []; game.voyage.node = 2;
  const route = game.voyage.plans.slice(1, 6).flat().find(item => item.type === 'harvest');
  game._configureVoyageRoom(route); const collector = game.voyage.room.collectors[0];
  const nearEnemy = game.spawnEnemy('crawler', { x: collector.x + 50, y: collector.y }); nearEnemy.voyageRoomId = game.voyage.room.id;
  game._damageEnemy(nearEnemy, 100); assert.equal(collector.charge, 2);
  const farEnemy = game.spawnEnemy('crawler', { x: collector.x, y: collector.y + 240 }); farEnemy.voyageRoomId = game.voyage.room.id;
  game._damageEnemy(farEnemy, 100); assert.equal(collector.charge, 3);
  game._damageEnemy(farEnemy, 100); assert.equal(collector.charge, 3);
});

test('route selection equips one unique device and declares a new resonance exactly once', () => {
  const game = voyage('mirror'); rest(game);
  const route = game.voyage.routeChoices[0]; assert.equal(game.chooseVoyageRoute(route.id, 'sentry', 1), true);
  assert.deepEqual(game.voyage.devices, ['mirror', 'sentry', null]); assert.equal(game.voyageResonance().id, 'cross-mirror');
  const acquisition = game.drainEvents().filter(event => event.type === 'voyage-resonance' && event.stage === 'acquired');
  assert.equal(acquisition.length, 1); assert.equal(game.voyage.initialDeviceId, 'mirror');
  assert.equal(game.voyage.effects.sentry, null); assert.equal(game.voyage.effects.mirrorTimer, 0);
});

test('boss transitions at both health thresholds and removes its obsolete hazards', () => {
  const game = voyage(), boss = finale(game);
  game._addHazard('blast', game.player.x, game.player.y, 80, 2, 20, { sourceId: boss.id });
  boss.hp = 3200; game._updateVoyageBoss(boss, .01, 0, 1, 400);
  assert.equal(boss.stage, 2); assert.equal(game.hazards.length, 0); assert.equal(boss.recoveryTimer, 1.4);
  boss.hp = 1600; game._updateVoyageBoss(boss, .01, 0, 1, 400); assert.equal(boss.stage, 3);
  assert.deepEqual(game.drainEvents().filter(event => event.type === 'voyage-boss-phase').map(event => event.stage), [2, 3]);
});

test('boss ring respects its locked visible safety gap and announces before creating bullets', () => {
  const game = voyage(), boss = finale(game); boss.attackCount = 2; boss.attackTimer = 0;
  game._updateVoyageBoss(boss, .01, 0, 1, 300);
  assert.equal(boss.attackKind, 'voyage-ring'); assert.equal(game.bullets.length, 0); assert.equal(boss.windup, 1.35);
  game._updateVoyageBoss(boss, 1.35, 0, 1, 300);
  assert.ok(game.bullets.length > 0 && game.bullets.length < 12);
  for (const bullet of game.bullets) assert.ok(Math.acos(Math.cos(Math.atan2(bullet.vy, bullet.vx) - boss.ringGapAngle)) > boss.ringGapWidth / 2);
});

test('phase two teleport has a harmless marked landing and a real delay', () => {
  const game = voyage(), boss = finale(game); boss.hp = 3000; boss.stage = 2; boss.attackCount = 3; boss.attackTimer = 0;
  const origin = { x: boss.x, y: boss.y }; game._updateVoyageBoss(boss, .01, 0, 1, 300);
  assert.equal(boss.attackKind, 'voyage-teleport'); assert.equal(boss.x, origin.x); assert.equal(boss.y, origin.y);
  const marker = game.hazards.find(hazard => hazard.voyageTeleport); assert.equal(marker.visualOnly, true); assert.equal(marker.damage, 0);
  game._updateVoyageBoss(boss, 1.35, 0, 1, 300);
  near(boss.x, marker.x); near(boss.y, marker.y); assert.equal(boss.teleportTarget, null);
});

test('phase three layers the old-position collapse after the light lattice rather than resolving both instantly', () => {
  const game = voyage(), boss = finale(game); boss.hp = 1500; boss.stage = 3; boss.attackCount = 0; boss.attackTimer = 0;
  game._updateVoyageBoss(boss, .01, 0, 1, 300);
  assert.equal(boss.attackKind, 'voyage-finale');
  const lanes = game.hazards.filter(hazard => hazard.type === 'lane'), blast = game.hazards.find(hazard => hazard.type === 'blast');
  assert.equal(lanes.length, 2); assert.equal(lanes[0].remaining, 1.55); assert.equal(blast.remaining, 2.05);
  const x = blast.x; game.player.x += 100; assert.equal(blast.x, x);
});

test('terminal victory clears every device effect and emits exactly one complete and win event', () => {
  const game = voyage('well'), boss = finale(game); game.voyage.devices = ['well', 'battery', 'afterimage'];
  game._voyagePulse(game.player); game._voyageDash(); game._damageEnemy(boss, 1e6); game._damageEnemy(boss, 1e6);
  assert.equal(game.phase, 'won'); assert.equal(game.voyage.status, 'complete'); assert.equal(game.enemies.length, 0);
  assert.equal(game.bullets.length, 0); assert.equal(game.hazards.length, 0); assert.equal(game.voyage.effects.well, null);
  assert.equal(game.voyage.effects.trails.length, 0); assert.equal(game.voyage.effects.batteryCharges, 0);
  const events = game.drainEvents(); assert.equal(events.filter(event => event.type === 'win').length, 1); assert.equal(events.filter(event => event.type === 'voyage-complete').length, 1);
  const elapsed = game.elapsed; game.update(.25, { shoot: true }); assert.equal(game.elapsed, elapsed);
});
