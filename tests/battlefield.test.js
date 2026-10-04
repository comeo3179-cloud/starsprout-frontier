'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Game, ENEMIES } = require('../action-engine.js');

// These are explicit boundary fixtures, not normal-input playthroughs. Single
// actors/props are positioned to isolate real collision, timers and actions.
function arena(node = 3, seed = 731) {
  const game = new Game({ mode: 'voyage', seed, deviceId: 'mirror' });
  game.start(); game.voyage.node = node;
  game._configureVoyageRoom({ id: 'qa-field', type: 'clear', biome: 'forge', risk: 'calm', reward: 35 });
  if (node >= 3 && node <= 6) {
    assert.ok(game.battlefield, 'An active room exposes battlefield state');
    for (const name of ['props', 'mines']) assert.ok(Array.isArray(game.battlefield[name]), name);
  }
  game.voyage.room.objectiveDone = true; game.voyage.room.exit.ready = true;
  game.enemies = []; game.bullets = []; game.hazards = []; game.pickups = [];
  game.player.x = 1200; game.player.y = 700;
  game.drainEvents(); return game;
}
function emptyField(game) {
  game.obstacles = []; game.battlefield.props = []; game.battlefield.mines = [];
  return game;
}
function actor(game, type, x = 700, y = 700) {
  const enemy = game.spawnEnemy(type, { x, y });
  assert.ok(enemy, 'A real ' + type + ' can spawn');
  Object.assign(enemy, { hp: 5000, maxHp: 5000, speed: 0, attackTimer: 99 });
  return enemy;
}
function projectile(game, x, y, vx, vy, extra = {}) {
  const bullet = { id: game._id(), owner: 'player', kind: 'assault', weapon: 0,
    x, y, vx, vy, radius: 4, lifetime: 1, age: 0, damage: 100, pierce: 0,
    hitIds: [], color: '#78fbd6', ...extra };
  game.bullets.push(bullet); return bullet;
}
function hitFrom(angle, extra = {}) {
  const game = emptyField(arena()), enemy = actor(game, 'bulwark');
  enemy.shieldAngle = 0; enemy.shieldOpenTimer = 0;
  projectile(game, enemy.x + Math.cos(angle) * 85, enemy.y + Math.sin(angle) * 85,
    -Math.cos(angle) * 1000, -Math.sin(angle) * 1000, extra);
  game._updateBullets(.12);
  return { game, enemy, damage: 5000 - enemy.hp };
}
function near(actual, expected, epsilon = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}
function capacitor(game) {
  const prop = game.battlefield.props[0];
  assert.ok(prop, 'A forge room has a real capacitor');
  assert.equal(prop.hp, 50);
  game.battlefield.props = [prop]; game.obstacles = [];
  Object.assign(prop, { x: 700, y: 700 }); return prop;
}
function mine(game, engineerId = 0, x = 700, y = 700) {
  const value = game._spawnMine({ x, y }, engineerId);
  assert.ok(value, 'A mine is created below the cap');
  assert.equal(value.hp, 1); near(value.settleTimer, .65);
  return value;
}
function advance(game, seconds, input = {}) {
  for (let time = 0; time < seconds - 1e-10; time += 1 / 60) game.update(Math.min(1 / 60, seconds - time), input);
}

test('battlefield enemy definitions do not remove the old enemy identities', () => {
  for (const id of ['crawler', 'spitter', 'charger', 'tank', 'mortar', 'nest', 'reactor', 'anchor', 'boss', 'bulwark', 'breacher', 'engineer']) assert.ok(ENEMIES[id], id);
});

test('battlefield content is restricted to voyage rooms three through six', () => {
  for (const node of [1, 2, 7]) {
    const game = arena(node);
    assert.ok(!game.battlefield || game.battlefield.props.length + game.battlefield.mines.length === 0);
    assert.ok(game.voyage.room.plan.every(type => !['bulwark', 'breacher', 'engineer'].includes(type)));
  }
  for (const options of [{}, { mode: 'trial', seed: 1 }, { mode: 'campaign', seed: 1 }]) {
    const game = new Game(options);
    assert.ok(!game.battlefield || game.battlefield.props.length + game.battlefield.mines.length === 0);
    assert.ok(!game.enemies.some(enemy => ['bulwark', 'breacher', 'engineer'].includes(enemy.type)));
  }
});

test('battlefield enemies replace at most two entries without adding to finite room quota', () => {
  for (const node of [3, 4, 5, 6]) {
    const game = arena(node), plan = game.voyage.room.plan;
    assert.equal(plan.length, game.voyage.room.quota);
    const count = plan.filter(type => ['bulwark', 'breacher', 'engineer'].includes(type)).length;
    assert.ok(count >= 1 && count <= 2, 'New threats actually appear, within the two-entry replacement limit');
  }
});

test('same seed and room reproduce battlefield cover independently of combat randomness', () => {
  const a = arena(4, 912), b = arena(4, 912);
  const before = JSON.stringify(a.battlefield.props);
  for (let index = 0; index < 300; index++) a.random();
  assert.equal(JSON.stringify(a.battlefield.props), before);
  assert.deepEqual(a.battlefield.props, b.battlefield.props);
  assert.deepEqual(a.voyage.room.plan, b.voyage.room.plan);
  assert.deepEqual(a.obstacles, b.obstacles);
});

test('bulwark shield reduces actual frontal bullet damage by fifty-five percent', () => {
  near(hitFrom(0).damage, 45);
  near(hitFrom(Math.PI / 3).damage, 45);
  near(hitFrom(-Math.PI / 3).damage, 45);
});

test('bulwark side, rear and just-outside boundary bullets keep full damage', () => {
  for (const angle of [Math.PI / 3 + .001, -Math.PI / 3 - .001, Math.PI / 2, Math.PI]) near(hitFrom(angle).damage, 100);
});

test('returning blade uses its real incoming vector even when the player stands in front of the shield', () => {
  const game = emptyField(arena()), enemy = actor(game, 'bulwark');
  Object.assign(enemy, { shieldAngle: 0, shieldOpenTimer: 0 });
  game.player.x = enemy.x + 200; game.player.y = enemy.y;
  projectile(game, enemy.x - 85, enemy.y, 860, 0, { kind: 'boomerang', weapon: 4,
    returning: true, returnAfter: .52, returnMultiplier: 1, baseDamage: 100,
    age: 1, relayCount: 0, rockRebounded: false, pierce: 99 });
  game._updateBullets(.12);
  near(5000 - enemy.hp, 100);
});

test('bulwark turning is limited to one point five radians per second', () => {
  const game = emptyField(arena()), enemy = actor(game, 'bulwark');
  enemy.shieldAngle = 0; game.player.x = enemy.x - 300; game.player.y = enemy.y;
  game._updateEnemies(.1);
  assert.ok(Math.abs(enemy.shieldAngle) > 0 && Math.abs(enemy.shieldAngle) <= .1500001);
});

test('real EMP opens the shield for two point five seconds then it recovers', () => {
  const game = emptyField(arena()), enemy = actor(game, 'bulwark');
  game.player.x = enemy.x + 100; game.player.y = enemy.y;
  Object.assign(enemy, { shieldAngle: 0, shieldOpenTimer: 0 });
  assert.equal(game.useSkill(), true); near(enemy.shieldOpenTimer, 2.5);
  const hp = enemy.hp;
  projectile(game, enemy.x + 85, enemy.y, -1000, 0); game._updateBullets(.12);
  near(hp - enemy.hp, 100);
  advance(game, 2.51); assert.ok(enemy.shieldOpenTimer <= 0);
});

test('bulwark three-shot release opens a real one point three second vulnerability window', () => {
  const game = emptyField(arena()), enemy = actor(game, 'bulwark');
  game.player.x = enemy.x + 250; game.player.y = enemy.y;
  enemy.attackTimer = 0;
  game._updateEnemies(1 / 60);
  near(enemy.windup, .75);
  const locked = enemy.shotAngle; game.player.y += 200;
  for (let time = 0; time < .76; time += 1 / 60) game._updateEnemies(1 / 60);
  const shots = game.bullets.filter(bullet => bullet.owner === 'enemy');
  assert.equal(shots.length, 3);
  assert.equal(enemy.shotAngle, locked);
  assert.ok(enemy.shieldOpenTimer > 1.25 && enemy.shieldOpenTimer <= 1.3);
  assert.ok(enemy.recoveryTimer > 1.15 && enemy.recoveryTimer <= 1.2);
});

test('real breacher charge collides with solid cover, stops and stuns for one point three five seconds', () => {
  const game = emptyField(arena()), enemy = actor(game, 'breacher', 500, 700);
  const rock = { id: game._id(), type: 'rock', x: 580, y: 700, radius: 35 };
  game.obstacles.push(rock);
  Object.assign(enemy, { chargeTimer: .7, chargeX: 1, chargeY: 0 });
  game._updateEnemies(.2);
  assert.equal(enemy.chargeTimer, 0);
  near(enemy.stunTimer, 1.35);
  assert.ok(enemy.x <= rock.x - rock.radius - enemy.radius + 1e-7);
  const x = enemy.x; game._updateEnemies(.2); near(enemy.x, x);
  assert.ok(game.obstacles.includes(rock), 'An ordinary rock remains solid');
});

test('stunned breacher exposes a thirty-five percent damage window', () => {
  const game = emptyField(arena()), enemy = actor(game, 'breacher');
  enemy.stunTimer = 1.35;
  game._damageEnemy(enemy, 100); near(5000 - enemy.hp, 135);
  enemy.stunTimer = 0;
  game._damageEnemy(enemy, 100); near(5000 - enemy.hp, 235);
});

test('breacher sweeps the actual charge path rather than tunnelling through a thin rock', () => {
  const game = emptyField(arena()), enemy = actor(game, 'breacher', 500, 700);
  const rock = { id: game._id(), type: 'rock', x: 555, y: 700, radius: 5 };
  game.obstacles.push(rock);
  Object.assign(enemy, { chargeTimer: .7, chargeX: 1, chargeY: 0 });
  game._updateEnemies(.25);
  assert.equal(enemy.chargeTimer, 0);
  assert.ok(enemy.x <= rock.x - rock.radius - enemy.radius + 1e-7);
  near(enemy.stunTimer, 1.35);
});

test('breacher really breaks fragile cover on collision but still stops and stuns', () => {
  const game = emptyField(arena()), enemy = actor(game, 'breacher', 500, 700);
  const rock = { id: game._id(), type: 'rock', x: 580, y: 700, radius: 35, fragile: true, hp: 95 };
  game.obstacles.push(rock);
  const revision = game.terrainRevision;
  Object.assign(enemy, { chargeTimer: .7, chargeX: 1, chargeY: 0 });
  game._updateEnemies(.2);
  assert.ok(!game.obstacles.includes(rock));
  assert.equal(game.terrainRevision, revision + 1);
  assert.equal(enemy.chargeTimer, 0); near(enemy.stunTimer, 1.35); assert.equal(enemy.recoveryTimer, 0);
});

test('fragile cover takes ninety-five damage before real removal and one terrain revision', () => {
  const game = arena();
  const rock = game.obstacles.find(value => value.fragile);
  assert.ok(rock, 'The room exposes real fragile cover');
  assert.equal(rock.hp, 95);
  const revision = game.terrainRevision;
  game._damageCover(rock, 94);
  assert.equal(rock.hp, 1); assert.ok(game.obstacles.includes(rock));
  assert.equal(game.terrainRevision, revision);
  game._damageCover(rock, 1);
  assert.ok(!game.obstacles.includes(rock)); assert.equal(game.terrainRevision, revision + 1);
  game._damageCover(rock, 100);
  assert.equal(game.terrainRevision, revision + 1);
});

test('ordinary cover is not removed through the fragile damage path', () => {
  const game = arena(), rock = game.obstacles.find(value => !value.fragile);
  assert.ok(rock);
  const revision = game.terrainRevision;
  game._damageCover(rock, 1e6);
  assert.ok(game.obstacles.includes(rock)); assert.equal(game.terrainRevision, revision);
});

test('fragile cover absorbs a real projectile before its destruction opens the next shot path', () => {
  const game = emptyField(arena()), enemy = actor(game, 'crawler', 820, 700);
  const rock = { id: game._id(), type: 'rock', x: 700, y: 700, radius: 28, fragile: true, hp: 95 };
  game.obstacles.push(rock);
  projectile(game, 600, 700, 1000, 0, { damage: 95 }); game._updateBullets(.3);
  assert.ok(!game.obstacles.includes(rock)); near(enemy.hp, 5000);
  projectile(game, 600, 700, 1000, 0, { damage: 100 }); game._updateBullets(.3);
  near(5000 - enemy.hp, 100);
});

test('shooting a capacitor uses actual collision and a zero point six five second warning', () => {
  const game = arena(), prop = capacitor(game), enemy = actor(game, 'crawler', 760, 700);
  game.player.x = 700; game.player.y = 760;
  projectile(game, prop.x - 85, prop.y, 1000, 0, { damage: 50 }); game._updateBullets(.12);
  const hp = game.player.hp, enemyHp = enemy.hp;
  game._updateBattlefield(.64);
  near(game.player.hp, hp); near(enemy.hp, enemyHp);
  game._updateBattlefield(.02);
  near(hp - game.player.hp, 22); near(enemyHp - enemy.hp, 140);
  game._updateBattlefield(1);
  near(hp - game.player.hp, 22); near(enemyHp - enemy.hp, 140);
});

test('solid cover blocks a real shot before it can arm a capacitor behind it', () => {
  const game = arena(), prop = capacitor(game);
  game.obstacles.push({ id: game._id(), type: 'rock', x: 630, y: 700, radius: 25 });
  projectile(game, 565, 700, 1000, 0, { damage: 100 }); game._updateBullets(.2);
  assert.equal(prop.hp, 50);
});

test('EMP captures a capacitor without player damage and does not capture through solid cover', () => {
  for (const blocked of [false, true]) {
    const game = arena(), prop = capacitor(game);
    game.player.x = 600; game.player.y = 700;
    if (blocked) game.obstacles.push({ id: game._id(), type: 'rock', x: 650, y: 700, radius: 24 });
    const hp = game.player.hp, captures = game.battlefield.captures;
    assert.equal(game.useSkill(), true);
    game._updateBattlefield(.36);
    near(game.player.hp, hp);
    assert.equal(game.battlefield.captures - captures, blocked ? 0 : 1);
    if (blocked) assert.equal(prop.hp, 50);
  }
});

test('field explosions respect solid cover and a rock broken by this blast still blocks this blast', () => {
  for (const fragile of [false, true]) {
    const game = arena(), prop = capacitor(game), enemy = actor(game, 'crawler', 820, 700);
    const rock = { id: game._id(), type: 'rock', x: 760, y: 700, radius: 22, fragile, hp: fragile ? 95 : undefined };
    game.obstacles.push(rock);
    game.player.x = 600; game.player.y = 600;
    const hp = enemy.hp, revision = game.terrainRevision;
    game._armField(prop, true, .65); game._updateBattlefield(.66);
    near(enemy.hp, hp);
    assert.equal(game.obstacles.includes(rock), !fragile);
    assert.equal(game.terrainRevision, revision + (fragile ? 1 : 0));
  }
});

test('mine settlement and proximity warning each have real delays before player damage', () => {
  const game = emptyField(arena()), value = mine(game);
  game.player.x = value.x; game.player.y = value.y;
  const hp = game.player.hp;
  advance(game, .64); near(game.player.hp, hp); assert.ok(value.settleTimer > 0);
  advance(game, .45); near(game.player.hp, hp);
  advance(game, .25); near(hp - game.player.hp, 22);
  assert.ok(!game.battlefield.mines.includes(value));
});

test('an unapproached mine remains harmless after settlement', () => {
  const game = emptyField(arena()), value = mine(game);
  const hp = game.player.hp;
  advance(game, 1.5);
  near(game.player.hp, hp); assert.ok(game.battlefield.mines.includes(value));
});

test('untriggered mines expire after fourteen seconds and release their capacity', () => {
  const game = emptyField(arena()), value = mine(game, 1);
  advance(game, 13.9); assert.ok(game.battlefield.mines.includes(value));
  advance(game, .2); assert.ok(!game.battlefield.mines.includes(value));
  assert.ok(game._spawnMine({ x: 700, y: 700 }, 1));
});

test('settled mine survives its engineer death while unfinished throw hazards are cleared', () => {
  const game = emptyField(arena()), engineer = actor(game, 'engineer'), value = mine(game, engineer.id, 900, 700);
  game._addHazard('blast', 800, 700, 30, .85, 0, { sourceId: engineer.id, visualOnly: true });
  game._updateBattlefield(.66);
  game._damageEnemy(engineer, 5000);
  assert.ok(!game.hazards.some(hazard => hazard.sourceId === engineer.id));
  assert.ok(game.battlefield.mines.includes(value));
  game._updateBattlefield(.4); assert.ok(game.battlefield.mines.includes(value));
});

test('EMP interrupts a real engineer throw and leaves no delayed mine after the windup', () => {
  const game = emptyField(arena()), engineer = actor(game, 'engineer');
  game.player.x = engineer.x + 200; game.player.y = engineer.y;
  engineer.attackTimer = 0; game._updateEnemies(1 / 60);
  near(engineer.windup, .85);
  assert.ok(engineer.throwTarget && game.hazards.some(hazard => hazard.sourceId === engineer.id));
  assert.equal(game.useSkill(), true);
  assert.equal(engineer.windup, 0);
  assert.ok(!game.hazards.some(hazard => hazard.sourceId === engineer.id));
  advance(game, .9);
  assert.equal(game.battlefield.mines.length, 0);
});

test('shooting an unsettled mine arms one real warning rather than immediate damage', () => {
  const game = emptyField(arena()), value = mine(game);
  game.player.x = value.x; game.player.y = value.y + 90;
  projectile(game, value.x - 85, value.y, 1000, 0, { damage: 16 }); game._updateBullets(.12);
  const hp = game.player.hp;
  game._updateBattlefield(.64); near(game.player.hp, hp);
  game._updateBattlefield(.02); near(hp - game.player.hp, 22);
});

test('true EMP captures a nearby mine with a short fuse and never harms the player', () => {
  const game = emptyField(arena()), value = mine(game), enemy = actor(game, 'crawler', 770, 700);
  game.player.x = value.x; game.player.y = value.y + 80;
  const hp = game.player.hp;
  assert.equal(game.useSkill(), true);
  const enemyHp = enemy.hp;
  game._updateBattlefield(.34); near(enemy.hp, enemyHp);
  game._updateBattlefield(.02); near(enemyHp - enemy.hp, 140);
  near(game.player.hp, hp);
  assert.ok(!game.battlefield.mines.includes(value));
});

test('a mine outside the real EMP radius or behind cover is not captured', () => {
  for (const blocked of [false, true]) {
    const game = emptyField(arena()), value = mine(game);
    game.player.x = blocked ? value.x - 100 : value.x - game.player.skillRadius - 40;
    game.player.y = value.y;
    if (blocked) game.obstacles.push({ id: game._id(), type: 'rock', x: value.x - 50, y: value.y, radius: 24 });
    const captures = game.battlefield.captures;
    assert.equal(game.useSkill(), true);
    assert.equal(game.battlefield.captures, captures);
    game._updateBattlefield(.36);
    assert.ok(game.battlefield.mines.includes(value));
  }
});

test('EMP capture never lengthens a mine whose existing fuse is already shorter', () => {
  const game = emptyField(arena()), value = mine(game);
  game.player.x = value.x; game.player.y = value.y + 80;
  game._armField(value, false, .2);
  game._updateBattlefield(.1);
  const hp = game.player.hp;
  assert.equal(game.useSkill(), true);
  game._updateBattlefield(.11);
  assert.ok(!game.battlefield.mines.includes(value)); near(game.player.hp, hp);
});

test('well collapse is not a second EMP and cannot capture another mine', () => {
  const game = emptyField(arena());
  game.voyage.devices = ['well', 'battery', null];
  game.player.x = 700; game.player.y = 700;
  assert.equal(game.useSkill(), true);
  const value = mine(game, 0, 750, 700), captures = game.battlefield.captures;
  assert.equal(game.voyageActionState().collapseReady, true);
  const cooldown = game.player.skillCooldown;
  assert.equal(game.useSkill(), true);
  assert.equal(game.battlefield.captures, captures);
  near(game.player.skillCooldown, cooldown);
  game.player.x = 1200; game.player.y = 700;
  game._updateBattlefield(.36);
  assert.ok(game.battlefield.mines.includes(value), 'The fresh mine was not captured by a well collapse');
});

test('mine caps reject a third engineer mine and a thirteenth global mine without growing arrays', () => {
  const game = emptyField(arena());
  const engineers = Array.from({ length: 6 }, (_, index) => actor(game, 'engineer', 250 + index * 130, 400));
  for (const engineer of engineers) {
    mine(game, engineer.id, 700, 700); mine(game, engineer.id, 800, 700);
    assert.equal(game._spawnMine({ x: 900, y: 700 }, engineer.id), null);
  }
  assert.equal(game.battlefield.mines.length, 12);
  assert.equal(game._spawnMine({ x: 900, y: 700 }, 0), null);
  assert.equal(game.battlefield.mines.length, 12);
});

test('ready, upgrade, rest, won and lost freeze unsettled mines and armed capacitor damage', () => {
  for (const phase of ['ready', 'upgrade', 'voyage-rest', 'won', 'lost']) {
    const game = arena(), prop = capacitor(game), value = mine(game);
    game._armField(prop, false, .65); game.phase = phase;
    const before = JSON.stringify({ field: game.battlefield, player: game.player, elapsed: game.elapsed });
    game.update(.25, { shoot: true, moveX: 1 });
    assert.equal(JSON.stringify({ field: game.battlefield, player: game.player, elapsed: game.elapsed }), before);
    assert.ok(game.battlefield.mines.includes(value));
  }
});

test('resetting into an old mode clears all battlefield objects and temporary combat state', () => {
  const game = arena(); mine(game);
  game._armField(game.battlefield.props[0], true, .35);
  game.reset('frontier');
  assert.equal(game.voyage, null);
  assert.ok(!game.battlefield || game.battlefield.props.length + game.battlefield.mines.length === 0);
  assert.equal(game.phase, 'ready'); assert.equal(game.hazards.length, 0); assert.equal(game.bullets.length, 0);
});

test('taking the real room exit clears active fields and retains cumulative voyage field statistics', () => {
  const game = arena(), prop = capacitor(game), value = mine(game);
  game._armField(prop, true, .35);
  const stats = structuredClone(game.voyage.fieldStats), previousField = game.battlefield;
  assert.equal(stats.captures, 1);
  game.player.x = game.voyage.room.exit.x; game.player.y = game.voyage.room.exit.y;
  assert.equal(game.interact(), true); assert.equal(game.phase, 'voyage-rest');
  assert.equal(previousField.props.length + previousField.mines.length, 0);
  assert.deepEqual(game.voyage.fieldStats, stats);
  assert.equal(game.chooseVoyageRoute(game.voyage.routeChoices[0].id, null, null), true);
  assert.equal(game.voyage.node, 4);
  assert.deepEqual(game.voyage.fieldStats, stats);
  assert.ok(!game.battlefield.mines.includes(value));
  assert.equal(game.battlefield.captures, 0);
});

test('fatal field blast stops the same update before damaging enemies or resolving another blast', () => {
  const game = arena(), prop = capacitor(game), enemy = actor(game, 'crawler', 750, 700);
  game.player.x = 700; game.player.y = 750; game.player.hp = 1;
  game._armField(prop, false, .1);
  game._armField(mine(game, 1, 750, 700), true, .1);
  game._updateBattlefield(.11);
  assert.equal(game.phase, 'lost'); near(game.player.hp, 0); near(enemy.hp, 5000);
  assert.equal(game.drainEvents().filter(event => event.type === 'lose').length, 1);
  game.update(.25);
  assert.equal(game.drainEvents().filter(event => event.type === 'lose').length, 0);
});

test('piercing shield hit does not permanently reduce the projectile damage for a target behind it', () => {
  const game = emptyField(arena()), shield = actor(game, 'bulwark', 700, 700), rear = actor(game, 'crawler', 590, 700);
  shield.shieldAngle = 0; shield.shieldOpenTimer = 0;
  projectile(game, 800, 700, -1000, 0, { pierce: 1 }); game._updateBullets(.3);
  near(5000 - shield.hp, 45); near(5000 - rear.hp, 100);
});

test('capturing an already friendly field does not reset its fuse or count a second capture', () => {
  const game = emptyField(arena()), value = mine(game);
  game._captureBattlefield(value, 10);
  const captures = game.battlefield.captures;
  game._updateBattlefield(.1);
  const remaining = value.remaining;
  game._captureBattlefield(value, 10);
  assert.equal(game.battlefield.captures, captures); near(value.remaining, remaining);
});

test('grenade preview ends at the same real capacitor silhouette as the fired grenade', () => {
  const game = arena(), prop = capacitor(game);
  game.player.x = 500; game.player.y = 700; game.player.angle = 0;
  assert.equal(game.switchWeapon(3), true);
  const preview = game.grenadePreview();
  game.drainEvents();
  let burst;
  for (let frame = 0; frame < 30 && !game.bullets.some(bullet => bullet.kind === 'grenade') && !burst; frame++) {
    game.update(1 / 60, { aimX: 1000, aimY: 700, shoot: true });
    burst = game.drainEvents().find(event => event.type === 'grenade-burst');
  }
  for (let frame = 0; frame < 60 && !burst; frame++) {
    game._updateBullets(1 / 60); burst = game.drainEvents().find(event => event.type === 'grenade-burst');
  }
  assert.ok(burst, 'The actual fired grenade reaches its first collision');
  assert.ok(preview.x < prop.x, 'The preview includes the real first field collision');
  near(preview.x, prop.x - prop.radius - 7);
  near(preview.x, burst.x); near(preview.y, burst.y);
});
