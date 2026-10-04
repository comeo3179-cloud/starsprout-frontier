'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, SECRETS, WEAPONS } = require('../action-engine.js');

function arena(options = {}) {
  const game = new Game({ random: () => 0.5, ...options });
  game.start(); game.obstacles = []; game.spawnTimer = Infinity;
  Object.assign(game.player, { x: 1000, y: 1000, angle: 0 });
  game.drainEvents();
  return game;
}

function fire(game, weapon) {
  game.player.weapon = weapon; game.fireTimer = 0; game._syncWeapon(); game._shoot();
  return game.bullets.at(-1);
}

function advance(game, seconds, hz = 60, fullGame = false) {
  let elapsed = 0;
  while (elapsed < seconds - 1e-10) {
    const dt = Math.min(1 / hz, seconds - elapsed);
    if (fullGame) game.update(dt); else game._updateBullets(dt);
    elapsed += dt;
  }
}

function sturdy(game, type, x, y = 1000) {
  const enemy = game.spawnEnemy(type, { x, y });
  enemy.hp = enemy.maxHp = 1000; enemy.stunTimer = 10;
  return enemy;
}

function incoming(game, count, x = 1070) {
  for (let index = 0; index < count; index += 1) game._enemyBullet({ x: x + index, y: 1000, radius: 18, type: 'spitter' }, Math.PI, 0, 12);
}

const eventsFor = (events, type, id) => events.filter(event => event.type === type && event.secretId === id);

test('secret catalog and persisted discoveries validate ids, discover only once, and survive reset', () => {
  assert.equal(SECRETS.length, 6);
  assert.equal(new Set(SECRETS.map(secret => secret.id)).size, 6);
  for (const secret of SECRETS) for (const field of ['id', 'title', 'icon', 'condition', 'description']) assert.equal(typeof secret[field], 'string');
  const game = new Game({ discoveredSecrets: ['rebound', 'invalid', 'rebound', null, 3] });
  assert.deepEqual([...game.discoveredSecrets], ['rebound']);
  assert.equal(game._discoverSecret('ice-break'), false);
  game.start();
  assert.equal(game._discoverSecret('ice-break'), true);
  assert.equal(game._discoverSecret('ice-break'), false);
  assert.equal(game._discoverSecret('invalid'), false);
  assert.equal(eventsFor(game.drainEvents(), 'secret-discovered', 'ice-break').length, 1);
  fire(game, 4); game.player.slowTimer = 2;
  game.reset('frost');
  assert.deepEqual([...game.discoveredSecrets], ['rebound', 'ice-break']);
  assert.equal(game.bullets.length, 0); assert.equal(game.player.slowTimer, 0);
  assert.equal(game.phase, 'ready'); assert.equal(game.events.length, 0);
});

test('normal blade flight and return stay consistent at 30, 60 and 144 Hz', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena(), blade = fire(game, 4);
    advance(game, 0.6, hz);
    assert.equal(blade.returning, true);
    assert.ok(Math.abs(blade.x - (1022 + 700 * 0.52 - 860 * 0.08)) < 1e-8, `${hz} Hz`);
    assert.equal(blade.damage, 42);
    advance(game, 0.6, hz);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.discoveredSecrets.size, 0);
  }
});

test('rock rebounds apply one return bonus and discover only after a live return hit at every refresh rate', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena(); game.obstacles.push({ x: 1280, y: 1000, radius: 35 });
    const enemy = sturdy(game, 'crawler', 1100), blade = fire(game, 4);
    advance(game, 0.32, hz);
    assert.equal(blade.returning, true); assert.equal(blade.rockRebounded, true);
    assert.equal(blade.damage, 56.7); assert.equal(game.discoveredSecrets.has('rebound'), false);
    advance(game, 0.4, hz);
    assert.equal(enemy.hp, 901.3, 'one outward hit and one strengthened return hit');
    assert.equal(game.bullets.length, 0);
    assert.equal(game.discoveredSecrets.has('rebound'), true);
    const events = game.drainEvents();
    assert.equal(eventsFor(events, 'secret-trigger', 'rebound').length, 1);
    assert.equal(eventsFor(events, 'secret-discovered', 'rebound').length, 1);
    assert.ok(eventsFor(events, 'secret-trigger', 'rebound')[0].angle > 3);
    fire(game, 4); advance(game, 1, hz);
    const repeated = game.drainEvents();
    assert.equal(eventsFor(repeated, 'secret-trigger', 'rebound').length, 1);
    assert.equal(eventsFor(repeated, 'secret-discovered', 'rebound').length, 0);
  }
});

test('a blade starting in overlapping rock surfaces rebounds once and can always be recovered', () => {
  for (const hz of [30, 60, 144]) {
    const game = arena();
    game.obstacles.push({ x: 1046, y: 1000, radius: 30 }, { x: 1055, y: 1000, radius: 35 });
    const blade = fire(game, 4);
    advance(game, 0.1, hz);
    assert.equal(blade.damage, 56.7);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.discoveredSecrets.has('rebound'), false);
    assert.equal(eventsFor(game.drainEvents(), 'secret-trigger', 'rebound').length, 1);
  }
});

test('ordinary return blades pass through newly encountered cover without a free rebound bonus', () => {
  const game = arena(), blade = fire(game, 4);
  advance(game, 0.55);
  assert.equal(blade.returning, true);
  game.obstacles.push({ x: 1150, y: 1000, radius: 40 });
  advance(game, 0.6);
  assert.equal(game.bullets.length, 0);
  assert.equal(blade.damage, 42); assert.equal(blade.rockRebounded, false);
  assert.equal(eventsFor(game.drainEvents(), 'secret-trigger', 'rebound').length, 0);
});

test('dash catches rethrow a blade along current aim once, without compounding its previous return bonus', () => {
  const game = arena(); game.player.returnEdge = true;
  const blade = fire(game, 4);
  advance(game, 0.85);
  assert.ok(Math.abs(blade.damage - 67.2) < 1e-8);
  game.player.angle = Math.PI / 2; game.player.dashTimer = 0.2;
  advance(game, 0.1);
  assert.equal(blade.relayCount, 1); assert.equal(blade.returning, false);
  assert.ok(Math.abs(blade.vx) < 1e-8); assert.equal(blade.vy, 700);
  assert.ok(Math.abs(blade.damage - 42 * 1.2) < 1e-8);
  assert.ok(blade.lifetime > 0 && blade.lifetime <= WEAPONS[4].lifetime);
  game.player.dashTimer = 100;
  advance(game, 3);
  assert.equal(game.bullets.length, 0);
  const events = game.drainEvents();
  assert.equal(eventsFor(events, 'secret-trigger', 'blade-relay').length, 1);
  assert.equal(eventsFor(events, 'secret-discovered', 'blade-relay').length, 1);
  assert.equal(eventsFor(events, 'secret-trigger', 'blade-relay')[0].angle, Math.PI / 2);
});

test('last-frame blade catches qualify only inside the actual remaining dash window at 30, 60 and 144 Hz', () => {
  for (const hz of [30, 60, 144]) for (const [arrival, shouldRelay] of [[0.105, true], [0.115, false]]) {
    const game = arena(); game.player.x = game.world.width - game.player.radius - 20;
    game.dash({ x: 1, y: 0 }); game.update(0.09);
    assert.ok(Math.abs(game.player.dashTimer - 0.11) < 1e-8);
    const blade = fire(game, 4);
    Object.assign(blade, { returning: true, age: 0.6, x: game.player.x - 26 - 860 * arrival, y: game.player.y });
    advance(game, 0.3, hz, true);
    assert.equal(blade.relayCount, shouldRelay ? 1 : 0, `${hz} Hz arrival ${arrival}`);
    assert.equal(game.discoveredSecrets.has('blade-relay'), shouldRelay);
  }
});

test('rebound loops at a nearby rock cannot exceed one relay or multiply damage repeatedly', () => {
  const game = arena(); game.obstacles.push({ x: 1046, y: 1000, radius: 30 });
  game.player.dashTimer = 0.2;
  const blade = fire(game, 4);
  game._updateBullets(1 / 60);
  assert.equal(game.bullets.length, 0);
  assert.equal(blade.relayCount, 1);
  assert.ok(Math.abs(blade.damage - 42 * 1.2 * 1.35) < 1e-8);
  const events = game.drainEvents();
  assert.equal(eventsFor(events, 'secret-trigger', 'rebound').length, 2, 'one rebound per outgoing leg');
  assert.equal(eventsFor(events, 'secret-trigger', 'blade-relay').length, 1);
  assert.equal(game.discoveredSecrets.has('rebound'), false, 'hitting only a rock earns no combat discovery');
});

test('walking after dash expiry cannot pull a later blade catch into the dash window', () => {
  const results = [];
  for (const split of [false, true]) {
    const game = arena();
    const blade = fire(game, 4);
    Object.assign(blade, { returning: true, x: 1034, y: 1000, age: 0.6, lifetime: 1.5 });
    game.player.dashTimer = 0.004; game.dashVector = { x: 1, y: 0 };
    if (split) { game.update(0.004, { moveX: 1 }); game.update(1 / 30 - 0.004, { moveX: 1 }); }
    else game.update(1 / 30, { moveX: 1 });
    results.push({ relayCount: blade.relayCount, discovered: game.discoveredSecrets.has('blade-relay') });
  }
  assert.deepEqual(results, [{ relayCount: 0, discovered: false }, { relayCount: 0, discovered: false }]);
});

test('EMP reversal counts live nearby enemy bullets, caps at eight and creates clean friendly projectiles', () => {
  for (const count of [4, 5, 12]) {
    const game = arena(); incoming(game, count);
    incoming(game, 1); game.bullets.at(-1).lifetime = 0;
    incoming(game, 2, 1500);
    assert.equal(game.useSkill(), true);
    assert.equal(game.player.reversalAmmo, count >= 5 ? Math.min(8, count) : 0);
    assert.equal(game.bullets.filter(bullet => bullet.reflected).length, 0);
    game._shoot();
    const reflected = game.bullets.filter(bullet => bullet.reflected);
    assert.equal(reflected.length, count >= 5 ? Math.min(8, count) : 0);
    assert.equal(game.bullets.filter(bullet => bullet.owner === 'enemy').length, 2);
    for (const bullet of reflected) {
      assert.equal(bullet.owner, 'player'); assert.equal(bullet.isEnemy, false);
      assert.equal(bullet.damage, 18); assert.equal(bullet.pierce, 0);
      assert.equal('damageSource' in bullet, false);
      assert.equal(bullet.railResonanceEligible, undefined);
      assert.ok(bullet.lifetime > 0 && bullet.lifetime < 2);
      assert.deepEqual(bullet.hitIds, []);
    }
    assert.equal(game.discoveredSecrets.has('bullet-reversal'), count >= 5);
    assert.equal(eventsFor(game.drainEvents(), 'secret-trigger', 'bullet-reversal').length, count >= 5 ? 1 : 0);
  }
});

test('reversed shots deal normal friendly damage and delayed echo clears cannot farm reversal discoveries', () => {
  const game = arena(); incoming(game, 5); game.useSkill();
  const enemy = sturdy(game, 'crawler', 1150);
  game._shoot();
  advance(game, 0.3);
  assert.equal(enemy.hp, 966, 'one reversed shot plus the ordinary rifle shot'); assert.equal(game.player.hp, game.player.maxHp);
  const echo = arena(); echo.relics.push('echo-pulse'); echo.useSkill();
  incoming(echo, 6); echo._updateEchoes(0.65);
  assert.equal(echo.bullets.length, 0);
  assert.equal(echo.discoveredSecrets.has('bullet-reversal'), false);
});

test('EMP fuse resonance boosts only live nearby grenades and cannot explode a grenade twice', () => {
  for (const upgraded of [false, true]) {
    const game = arena(); game.player.blastRadius = upgraded;
    const grenade = fire(game, 3); grenade.x = 1150;
    const outside = fire(game, 3); outside.x = 1400;
    const enemy = sturdy(game, 'crawler', 1300);
    game.player.weapon = 0;
    assert.equal(game.useSkill(), true);
    assert.ok(Math.abs(grenade.blastRadius - (upgraded ? 202.5 : 135) * 1.35) < 1e-8);
    assert.equal(grenade.damage, 78); assert.equal(enemy.hp, 922);
    assert.equal(grenade.exploded, true); assert.equal(outside.exploded, undefined);
    assert.equal(game.bullets.includes(grenade), false); assert.equal(game.bullets.includes(outside), true);
    let events = game.drainEvents();
    assert.equal(events.filter(event => event.type === 'grenade-burst').length, 1);
    assert.equal(eventsFor(events, 'secret-trigger', 'fuse-resonance').length, 1);
    game.player.skillCooldown = 0; game.useSkill();
    events = game.drainEvents();
    assert.equal(events.filter(event => event.type === 'grenade-burst').length, 0);
    assert.equal(eventsFor(events, 'secret-trigger', 'fuse-resonance').length, 0);
    assert.equal(enemy.hp, 922);
  }
});

test('combined EMP techniques record real effects before a boss kill and stop later blast or echo damage', () => {
  const game = arena(); game.relics.push('echo-pulse');
  incoming(game, 5);
  const grenade = fire(game, 3); grenade.x = 1150;
  const boss = game.spawnEnemy('boss', { x: 1250, y: 1000 }); boss.hp = 30;
  const survivor = sturdy(game, 'crawler', 1210);
  game.useSkill();
  assert.equal(game.phase, 'won'); assert.equal(survivor.hp, 1000);
  assert.equal(game.echoBursts.length, 0);
  assert.equal(game.discoveredSecrets.has('bullet-reversal'), true);
  assert.equal(game.discoveredSecrets.has('fuse-resonance'), true);
  const before = survivor.hp; advance(game, 1);
  assert.equal(survivor.hp, before);
  assert.equal(game.drainEvents().filter(event => event.type === 'grenade-burst').length, 1);
});

test('ordinary rail fire resonates on its third distinct live hit and extends to six total targets', () => {
  const game = arena();
  const enemies = Array.from({ length: 7 }, (_, index) => sturdy(game, 'crawler', 1100 + index * 70));
  const shot = fire(game, 2); advance(game, 0.5);
  assert.deepEqual(enemies.map(enemy => 1000 - enemy.hp), [86, 86, 107.5, 107.5, 107.5, 107.5, 0]);
  assert.equal(shot.railHits, 3); assert.equal(shot.railResonating, true);
  assert.equal(game.bullets.length, 0);
  const events = game.drainEvents();
  assert.equal(eventsFor(events, 'secret-trigger', 'rail-resonance').length, 1);
  assert.equal(eventsFor(events, 'secret-discovered', 'rail-resonance').length, 1);
});

test('dead enemies and a previously hit enemy crossing the rail again do not count as a third hit', () => {
  const game = arena();
  const first = sturdy(game, 'crawler', 1080); sturdy(game, 'crawler', 1140);
  const shot = fire(game, 2); advance(game, 0.08);
  assert.equal(shot.railHits, 2);
  first.x = 1250;
  sturdy(game, 'crawler', 1210).hp = 0;
  advance(game, 0.1);
  assert.equal(shot.railHits, 2); assert.equal(first.hp, 914);
  assert.equal(game.discoveredSecrets.has('rail-resonance'), false);
  sturdy(game, 'crawler', 1400); advance(game, 0.15);
  assert.equal(shot.railHits, 3);
  assert.equal(game.discoveredSecrets.has('rail-resonance'), true);
});

test('hunter-prism shots cannot trigger the ordinary-rail technique', () => {
  const game = arena(); game.relics.push('precision-burst');
  for (let index = 0; index < 3; index += 1) sturdy(game, 'crawler', 1090 + index * 60);
  game._finishReload(2, true);
  assert.equal(game.bullets.length, 3);
  assert.ok(game.bullets.every(bullet => bullet.weapon === 2 && !bullet.railResonanceEligible));
  advance(game, 0.5);
  assert.equal(game.discoveredSecrets.has('rail-resonance'), false);
});

test('ice-break requires a successful slowed dash, clears slow, and only freezes ordinary nearby enemies', () => {
  const game = arena();
  const ordinary = sturdy(game, 'crawler', 1080), boss = sturdy(game, 'boss', 1080, 1040), reactor = sturdy(game, 'reactor', 1000, 1100), far = sturdy(game, 'crawler', 1240);
  for (const enemy of [ordinary, boss, reactor, far]) enemy.stunTimer = 0;
  ordinary.windup = 0.5; ordinary.chargeTimer = 0.3;
  game._addHazard('blast', 1000, 1000, 50, 1, 10, { sourceId: ordinary.id });
  game.player.slowTimer = 2; game.player.dashCooldown = 1;
  assert.equal(game.dash({ x: 1, y: 0 }), false);
  assert.equal(game.player.slowTimer, 2); assert.equal(game.discoveredSecrets.size, 0);
  game.player.dashCooldown = 0;
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  assert.equal(game.player.slowTimer, 0);
  assert.equal(ordinary.hp, 965); assert.equal(boss.hp, 965); assert.equal(reactor.hp, 965); assert.equal(far.hp, 1000);
  assert.equal(ordinary.stunTimer, 1); assert.equal(boss.stunTimer, 0); assert.equal(reactor.stunTimer, 0);
  assert.equal(ordinary.windup, 0); assert.equal(ordinary.chargeTimer, 0); assert.equal(game.hazards.length, 0);
  let events = game.drainEvents();
  assert.equal(eventsFor(events, 'secret-trigger', 'ice-break').length, 1);
  game.player.dashTimer = game.player.dashCooldown = 0;
  game.dash({ x: 1, y: 0 });
  assert.equal(eventsFor(game.drainEvents(), 'secret-trigger', 'ice-break').length, 0);
  game.player.dashTimer = game.player.dashCooldown = 0; game.player.slowTimer = 1;
  game.dash({ x: 1, y: 0 });
  events = game.drainEvents();
  assert.equal(eventsFor(events, 'secret-trigger', 'ice-break').length, 1);
  assert.equal(eventsFor(events, 'secret-discovered', 'ice-break').length, 0);
});

test('a secret earned by a lethal rebound or ice-break is recorded before terminal state', () => {
  const rebound = arena(); rebound.obstacles.push({ x: 1280, y: 1000, radius: 35 });
  const boss = rebound.spawnEnemy('boss', { x: 1100, y: 1000 }); boss.hp = 60;
  fire(rebound, 4); advance(rebound, 1);
  assert.equal(rebound.phase, 'won'); assert.equal(rebound.discoveredSecrets.has('rebound'), true);
  const ice = arena();
  ice.spawnEnemy('boss', { x: 1080, y: 1000 }).hp = 30;
  const survivor = sturdy(ice, 'crawler', 1050);
  ice.player.slowTimer = 1; ice.dash({ x: 1, y: 0 });
  assert.equal(ice.phase, 'won'); assert.equal(ice.discoveredSecrets.has('ice-break'), true);
  assert.equal(survivor.hp, 1000);
});

test('non-playing phases cannot trigger, discover or advance secret combat effects', () => {
  for (const phase of ['ready', 'upgrade', 'relic', 'won', 'lost']) {
    const game = arena(); incoming(game, 6); const grenade = fire(game, 3);
    game.player.slowTimer = 2; game.phase = phase; game.drainEvents();
    const before = JSON.stringify(game.bullets);
    assert.equal(game.useSkill(), false); assert.equal(game.dash({ x: 1, y: 0 }), false);
    assert.equal(game._discoverSecret('ice-break'), false);
    game._updateBullets(1 / 60);
    assert.equal(JSON.stringify(game.bullets), before);
    assert.equal(grenade.exploded, undefined);
    assert.equal(game.discoveredSecrets.size, 0); assert.equal(game.events.length, 0);
  }
});
