'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS } = require('../action-engine.js');

function arena(random = () => 0.5) {
  const game = new Game({ random });
  game.start();
  game.obstacles = [];
  game.spawnTimer = Infinity;
  Object.assign(game.player, { x: 1600, y: 1200, angle: 0, weapon: 3 });
  game._syncWeapon();
  game.drainEvents();
  return game;
}

function fire(game, hz = 60) {
  game._shoot();
  for (let frame = 0; frame < hz * 2 && game.bullets.length; frame += 1) game._updateBullets(1 / hz);
  return game.drainEvents().filter(event => event.type === 'grenade-burst');
}

function matches(preview, bursts) {
  assert.equal(bursts.length, preview.explodes ? 1 : 0);
  if (!preview.explodes) return;
  assert.ok(Math.hypot(bursts[0].x - preview.x, bursts[0].y - preview.y) < 1e-7);
  assert.equal(bursts[0].radius, preview.radius);
}

test('grenade preview follows the muzzle and full fuse flight at multiple angles and refresh rates', () => {
  for (const hz of [60, 144]) {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 4, 2.123]) {
      const game = arena();
      game.player.angle = angle;
      const preview = game.grenadePreview();
      assert.equal(preview.explodes, true);
      assert.ok(Math.abs(Math.hypot(preview.startX - game.player.x, preview.startY - game.player.y) - 22) < 1e-8);
      assert.ok(Math.abs(Math.hypot(preview.x - preview.startX, preview.y - preview.startY) - WEAPONS[3].speed * WEAPONS[3].lifetime) < 1e-8);
      matches(preview, fire(game, hz));
    }
  }
});

test('preview picks the first incoming surface whether cover or a living enemy comes first', () => {
  for (const coverFirst of [true, false]) {
    const game = arena();
    Object.assign(game.player, { x: 1000, y: 1000 });
    game.obstacles.push({ x: coverFirst ? 1300 : 1450, y: 1000, radius: 40 });
    const enemy = game.spawnEnemy('crawler', { x: coverFirst ? 1400 : 1300, y: 1000 });
    enemy.hp = enemy.maxHp = 100000;
    const preview = game.grenadePreview();
    assert.ok(Math.abs(preview.x - (coverFirst ? 1253 : 1278)) < 1e-8);
    matches(preview, fire(game));
  }
});

test('dead enemies do not intercept previews or real grenades', () => {
  const game = arena();
  Object.assign(game.player, { x: 1000, y: 1000 });
  game.spawnEnemy('crawler', { x: 1100, y: 1000 }).hp = 0;
  const live = game.spawnEnemy('crawler', { x: 1400, y: 1000 });
  live.hp = live.maxHp = 100000;
  const preview = game.grenadePreview();
  assert.ok(Math.abs(preview.x - 1378) < 1e-8);
  matches(preview, fire(game));
});

test('objects beyond the fuse endpoint cannot extend the preview or real projectile range', () => {
  const game = arena();
  Object.assign(game.player, { x: 1000, y: 1000 });
  game.obstacles.push({ x: 1650, y: 1000, radius: 40 });
  const enemy = game.spawnEnemy('crawler', { x: 1621, y: 1000 });
  enemy.hp = enemy.maxHp = 100000;
  const preview = game.grenadePreview();
  assert.ok(Math.abs(preview.x - 1598) < 1e-8);
  matches(preview, fire(game));
});

test('a muzzle already inside the expanded cover surface previews immediate impact', () => {
  const game = arena();
  Object.assign(game.player, { x: 1000, y: 1000 });
  const rock = { x: 1046, y: 1000, radius: 30 };
  assert.equal(Math.hypot(game.player.x - rock.x, game.player.y - rock.y), game.player.radius + rock.radius);
  game.obstacles.push(rock);
  const preview = game.grenadePreview();
  assert.equal(preview.x, preview.startX);
  assert.equal(preview.y, preview.startY);
  matches(preview, fire(game));
});

test('world-edge previews stop at the boundary and promise no explosion', () => {
  for (const [x, y, angle] of [[3164, 1200, 0], [36, 1200, Math.PI], [1600, 36, -Math.PI / 2], [1600, 2364, Math.PI / 2], [3164, 2364, Math.PI / 4]]) {
    const game = arena();
    Object.assign(game.player, { x, y, angle });
    const preview = game.grenadePreview();
    assert.equal(preview.explodes, false);
    const boundaryGap = Math.min(Math.abs(preview.x), Math.abs(preview.y), Math.abs(game.world.width - preview.x), Math.abs(game.world.height - preview.y));
    assert.ok(boundaryGap < 1e-8);
    matches(preview, fire(game));
    assert.equal(game.bullets.length, 0);
  }
});

test('the blast-radius upgrade previews the next shot while existing shots retain their radius', () => {
  for (const upgraded of [false, true]) {
    const game = arena();
    game.player.blastRadius = upgraded;
    const preview = game.grenadePreview();
    assert.equal(preview.radius, upgraded ? 202.5 : 135);
    game._shoot();
    game.player.blastRadius = !upgraded;
    assert.equal(game.grenadePreview().radius, upgraded ? 135 : 202.5);
    for (let frame = 0; frame < 120 && game.bullets.length; frame += 1) game._updateBullets(1 / 60);
    matches(preview, game.drainEvents().filter(event => event.type === 'grenade-burst'));
  }
});

test('preview calls are read-only and consume no randomness, ammunition, ids or events', () => {
  let randomCalls = 0;
  const game = arena(() => { randomCalls += 1; return 0.5; });
  game.obstacles.push({ x: 1850, y: 1230, radius: 40 });
  game.spawnEnemy('crawler', { x: 1900, y: 1200 });
  const before = JSON.stringify(game), callsBefore = randomCalls;
  for (let index = 0; index < 20; index += 1) assert.ok(game.grenadePreview());
  assert.equal(randomCalls, callsBefore);
  assert.equal(JSON.stringify(game), before);
});

test('other weapons and all non-playing phases hide the grenade preview', () => {
  const game = arena();
  for (const weapon of [0, 1, 2, 4]) {
    game.player.weapon = weapon;
    assert.equal(game.grenadePreview(), null);
  }
  game.player.weapon = 3;
  for (const phase of ['ready', 'upgrade', 'relic', 'won', 'lost']) {
    game.phase = phase;
    assert.equal(game.grenadePreview(), null);
  }
  game.phase = 'playing';
  assert.ok(game.grenadePreview());
});
