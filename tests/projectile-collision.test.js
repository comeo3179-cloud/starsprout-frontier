'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../action-engine.js');

function arena() {
  const game = new Game({ random: () => 0.5 });
  game.start();
  game.obstacles = [];
  game.enemies = [];
  game.player.x = game.player.y = 1000;
  game.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

function rail(game, x, y, overrides = {}) {
  const bullet = { id: game._id(), owner: 'player', x, y, vx: WEAPONS[2].speed, vy: 0,
    radius: 4, lifetime: 1, damage: WEAPONS[2].damage, pierce: 3, hitIds: [], color: '#b3a5ff', ...overrides };
  game.bullets.push(bullet);
  return bullet;
}

test('cover blocks a grazing rail shot before a non-overlapping enemy at normal speed', () => {
  const game = arena();
  const rock = { x: 1100, y: 1000, radius: 40 };
  game.obstacles.push(rock);
  const enemy = game.spawnEnemy('spitter', { x: 1090, y: 1058 });
  assert.ok(Math.hypot(enemy.x - rock.x, enemy.y - rock.y) > enemy.radius + rock.radius);
  rail(game, 1074, 1036.1);
  game._updateBullets(1 / 60);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(game.kills, 0);
  assert.equal(game.bullets.length, 0);
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'hit').length, 0);
  const spark = events.find(event => event.type === 'spark');
  assert.ok(spark);
  assert.ok(Math.abs(Math.hypot(spark.x - rock.x, spark.y - rock.y) - 44) < 1e-8);
});

test('piercing hits follow first contact with each silhouette, not center order or array order', () => {
  const game = arena();
  const smaller = game.spawnEnemy('spitter', { x: 1090, y: 1052 });
  const larger = game.spawnEnemy('nest', { x: 1100, y: 1000 });
  assert.ok(Math.hypot(smaller.x - larger.x, smaller.y - larger.y) > smaller.radius + larger.radius);
  const bullet = rail(game, 1076, 1030.1, { damage: 1 });
  game._updateBullets(1 / 60);
  assert.deepEqual(game.drainEvents().filter(event => event.type === 'hit').map(event => event.enemyId), [larger.id, smaller.id]);
  assert.deepEqual(bullet.hitIds, [larger.id, smaller.id]);
  assert.equal(larger.hp, larger.maxHp - 1);
  assert.equal(smaller.hp, smaller.maxHp - 1);
});

test('grenades detonate at the incoming surface of cover', () => {
  const game = arena();
  game.obstacles.push({ x: 1100, y: 1000, radius: 40 });
  rail(game, 1045, 1000, { vx: WEAPONS[3].speed, radius: 7, kind: 'grenade', age: 0, blastRadius: 135 });
  game._updateBullets(1 / 60);
  const bursts = game.drainEvents().filter(event => event.type === 'grenade-burst');
  assert.equal(bursts.length, 1);
  assert.ok(Math.abs(bursts[0].x - 1053) < 1e-8);
  assert.equal(bursts[0].y, 1000);
  assert.equal(game.bullets.length, 0);
});

test('segment collision handles inside starts, stationary points, tangency and misses', () => {
  const game = arena(), circle = { x: 10, y: 0, radius: 2 };
  assert.equal(game._segmentHit(10, 0, 20, 0, circle, 1), 0);
  assert.equal(game._segmentHit(10, 0, 0, 0, circle, 1), 0);
  assert.equal(game._segmentHit(0, 0, 0, 0, circle, 1), null);
  assert.equal(game._segmentHit(0, 3, 20, 0, circle, 1), 0.5);
  assert.equal(game._segmentHit(0, 3.01, 20, 0, circle, 1), null);
  assert.equal(game._segmentHit(0, 0, 6, 0, circle, 1), null);
  assert.equal(game._segmentHit(0, 0, 7, 0, circle, 1), 1);
  assert.equal(game._segmentHit(0, 0, -20, 0, circle, 1), null);
});

test('phase capture and cover resolve by the first boundary crossed in a normal step', () => {
  for (const [rockX, captures] of [[942, 0], [944, 1]]) {
    const game = arena();
    game.player.dashTimer = 0.2;
    game.obstacles.push({ x: rockX, y: 1000, radius: 20 });
    rail(game, 918, 1000, { owner: 'enemy', vx: 300, radius: 3, damage: 10 });
    game._updateBullets(1 / 60);
    assert.equal(game.reactor.captures, captures, `rock at ${rockX}`);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.player.hp, game.player.maxHp);
    const events = game.drainEvents();
    assert.equal(events.filter(event => event.type === 'phase-capture').length, captures);
    assert.equal(events.filter(event => event.type === 'spark').length, 1 - captures);
  }
});
