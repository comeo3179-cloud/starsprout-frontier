'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../action-engine.js');

function arena() {
  const game = new Game({ random: () => 0.5 });
  game.start();
  game.obstacles = [];
  game.spawnTimer = Infinity;
  Object.assign(game.player, { x: 1000, y: 1000, angle: 0 });
  game.drainEvents();
  return game;
}

function advance(game, seconds, hz, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-10;) {
    const dt = Math.min(1 / hz, seconds - elapsed);
    game.update(dt, input);
    elapsed += dt;
  }
}

function bullet(game, overrides = {}) {
  const shot = { id: game._id(), owner: 'player', x: 1000, y: 1000, vx: 1050, vy: 0,
    radius: 3, lifetime: 0.004, damage: 1, pierce: 3, hitIds: [], color: '#fff', ...overrides };
  game.bullets.push(shot);
  return shot;
}

test('dash distance matches its duration at common refresh rates and with a distance upgrade', () => {
  for (const hz of [30, 60, 120, 144]) {
    for (const multiplier of [1, 1.1]) {
      const game = arena();
      game.player.dashMultiplier = multiplier;
      game.dash({ x: 1, y: 0 });
      advance(game, 0.3, hz);
      assert.ok(Math.abs(game.player.x - 1000 - 162 * multiplier) < 1e-8, `${hz} Hz, multiplier ${multiplier}`);
      assert.equal(game.player.y, 1000);
      assert.equal(game.player.dashTimer, 0);
    }
  }
});

test('the remainder of the last dash step resumes ordinary input movement', () => {
  for (const hz of [30, 60, 120, 144]) {
    const game = arena();
    game.dash({ x: 1, y: 0 });
    advance(game, 0.3, hz, { moveY: 1 });
    assert.ok(Math.abs(game.player.x - 1162) < 1e-8);
    assert.ok(Math.abs(game.player.y - 1000 - game.player.speed * 0.1) < 1e-8, `${hz} Hz`);
  }
  const slow = arena();
  slow.player.slowTimer = 2;
  slow.dash({ x: 1, y: 0 });
  advance(slow, 0.3, 60, { moveY: 1 });
  assert.ok(Math.abs(slow.player.x - 1162) < 1e-8);
  assert.equal(slow.player.slowTimer, 0, 'ice-break clears slow before the remaining walk time');
  assert.ok(Math.abs(slow.player.y - 1000 - slow.player.speed * 0.1) < 1e-8);
});

test('uneven frame durations preserve dash movement without skipping ordinary movement time', () => {
  const game = arena();
  game.dash({ x: 1, y: 0 });
  const frames = [0.007, 0.018, 0.034, 0.003, 0.041, 0.011];
  let elapsed = 0, index = 0;
  while (elapsed < 0.4 - 1e-10) {
    const dt = Math.min(frames[index++ % frames.length], 0.4 - elapsed);
    game.update(dt, { moveY: 1 });
    elapsed += dt;
  }
  assert.ok(Math.abs(game.player.x - 1162) < 1e-8);
  assert.ok(Math.abs(game.player.y - 1000 - game.player.speed * 0.2) < 1e-8);
});

test('unobstructed grenades reach their full fuse distance at common refresh rates', () => {
  for (const hz of [30, 60, 120, 144]) {
    const game = arena();
    game.player.weapon = 3;
    game._syncWeapon();
    game._shoot();
    advance(game, 1, hz);
    const bursts = game.drainEvents().filter(event => event.type === 'grenade-burst');
    assert.equal(bursts.length, 1);
    assert.ok(Math.abs(bursts[0].x - (1022 + WEAPONS[3].speed * WEAPONS[3].lifetime)) < 1e-8, `${hz} Hz`);
    assert.equal(bursts[0].y, 1000);
    assert.equal(game.bullets.length, 0);
  }
});

test('a piercing projectile hits its remaining path but cannot damage beyond its lifetime endpoint', () => {
  const game = arena();
  const grazing = game.spawnEnemy('crawler', { x: 1004, y: 1017 });
  const beyond = game.spawnEnemy('crawler', { x: 1030, y: 1000 });
  assert.ok(Math.hypot(grazing.x - beyond.x, grazing.y - beyond.y) > grazing.radius + beyond.radius);
  const shot = bullet(game);
  game._updateBullets(1 / 60);
  assert.equal(grazing.hp, grazing.maxHp - 1);
  assert.equal(beyond.hp, beyond.maxHp);
  assert.ok(Math.abs(shot.x - 1004.2) < 1e-8);
  assert.equal(game.bullets.length, 0);
});

test('a grenade expiring within a frame moves its remaining distance before its only explosion', () => {
  const game = arena();
  const enemy = game.spawnEnemy('crawler', { x: 1154, y: 1000 });
  enemy.hp = enemy.maxHp = 100;
  bullet(game, { vx: WEAPONS[3].speed, radius: 7, lifetime: 0.01, damage: 78, kind: 'grenade', age: 0, blastRadius: 135 });
  game._updateBullets(1 / 60);
  const bursts = game.drainEvents().filter(event => event.type === 'grenade-burst');
  assert.equal(bursts.length, 1);
  assert.ok(Math.abs(bursts[0].x - 1006.4) < 1e-8);
  assert.equal(enemy.hp, 22);
  assert.equal(game.bullets.length, 0);
  game._updateBullets(1 / 60);
  assert.equal(game.drainEvents().filter(event => event.type === 'grenade-burst').length, 0);
  assert.equal(enemy.hp, 22);
});

test('a grenade collision during its last partial step wins over fuse expiry and explodes once', () => {
  const game = arena();
  game.obstacles.push({ x: 1050, y: 1000, radius: 40 });
  const enemy = game.spawnEnemy('crawler', { x: 1154, y: 1000 });
  bullet(game, { vx: WEAPONS[3].speed, radius: 7, lifetime: 0.01, damage: 78, kind: 'grenade', age: 0, blastRadius: 135 });
  game._updateBullets(1 / 60);
  const bursts = game.drainEvents().filter(event => event.type === 'grenade-burst');
  assert.equal(bursts.length, 1);
  assert.ok(Math.abs(bursts[0].x - 1003) < 1e-8);
  assert.equal(enemy.hp, enemy.maxHp);
  assert.equal(game.bullets.length, 0);
});
