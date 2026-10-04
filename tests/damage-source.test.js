'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../action-engine.js');

function arena(mapId = 'frontier') {
  const game = new Game({ random: () => 0.5, mapId });
  game.start();
  game.player.x = game.player.y = 1000;
  game.obstacles = [];
  game.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

function until(game, condition, seconds = 3) {
  for (let step = 0; step < seconds * 60 && !condition(); step += 1) game.update(1 / 60);
  assert.ok(condition(), 'expected combat event within the allotted simulation time');
}

test('damage records health actually lost after armor, including fractional and lethal hits', () => {
  const game = arena();
  game.elapsed = 8.5;
  game.player.resistance = 0.12;
  const source = { kind: 'projectile', name: '试验弹丸', hint: '躲开弹道' };
  assert.equal(game._damagePlayer(7, source), true);
  assert.ok(Math.abs(game.player.hp - 113.84) < 1e-9);
  assert.deepEqual(game.lastDamage, { kind: 'projectile', name: '试验弹丸', hint: '躲开弹道', healthLost: 6.2, at: 8.5 });
  source.name = '已变化的来源';
  assert.equal(game.lastDamage.name, '试验弹丸');
  game.player.hp = 3.4;
  game.player.invulnerable = 0;
  assert.equal(game._damagePlayer(200, source), true);
  assert.equal(game.player.hp, 0);
  assert.equal(game.lastDamage.healthLost, 3.4);
  assert.equal(game.phase, 'lost');
});

test('invulnerability and non-playing phases cannot replace the last real damage record', () => {
  const game = arena();
  game._damagePlayer(2, { kind: 'contact', name: '最先命中的敌人' });
  const record = game.lastDamage, hp = game.player.hp;
  assert.equal(game._damagePlayer(99, { name: '无敌期间的攻击' }), false);
  assert.equal(game.lastDamage, record);
  game.player.invulnerable = 0;
  for (const phase of ['ready', 'upgrade', 'relic', 'won', 'lost']) {
    game.phase = phase;
    assert.equal(game._damagePlayer(99, { name: '暂停后的攻击' }), false);
    assert.equal(game.lastDamage, record);
    assert.equal(game.player.hp, hp);
  }
});

test('enemy pursuit and a telegraphed charge record different contact attacks', () => {
  const contact = arena();
  const crawler = contact.spawnEnemy('crawler', { x: 1025, y: 1000 });
  contact.update(1 / 60);
  assert.equal(contact.lastDamage.kind, 'contact');
  assert.match(contact.lastDamage.name, /近身接触$/);
  assert.equal(contact.lastDamage.healthLost, crawler.damage);
  assert.match(contact.lastDamage.hint, /拉开距离/);

  const charge = arena();
  const charger = charge.spawnEnemy('charger', { x: 1150, y: 1000 });
  charger.attackTimer = 0;
  charge.update(1 / 60);
  assert.ok(charger.windup > 0);
  assert.equal(charge.lastDamage, null);
  until(charge, () => charge.lastDamage !== null);
  assert.ok(charger.chargeTimer > 0);
  assert.equal(charge.lastDamage.kind, 'contact');
  assert.match(charge.lastDamage.name, /冲锋$/);
  assert.match(charge.lastDamage.hint, /横向闪避/);
  assert.equal(charge.lastDamage.healthLost, charger.damage);
});

test('a fired projectile retains its source after the shooter changes and dies', () => {
  const game = arena();
  const spitter = game.spawnEnemy('spitter', { x: 1200, y: 1000 });
  spitter.attackTimer = 0;
  until(game, () => game.bullets.some(bullet => bullet.owner === 'enemy'));
  assert.equal(game.lastDamage, null);
  spitter.name = '发射后被改名';
  game._damageEnemy(spitter, spitter.hp);
  until(game, () => game.lastDamage !== null);
  assert.ok(!game.enemies.some(enemy => enemy.id === spitter.id));
  assert.equal(game.lastDamage.kind, 'projectile');
  assert.equal(game.lastDamage.name, '孢子射手 · 远程射击');
  assert.match(game.lastDamage.hint, /掩体/);
  assert.equal(game.lastDamage.healthLost, spitter.damage);
});

test('environment threats and enemy bombardments keep distinct names and useful avoidance hints', () => {
  const environment = arena('foundry');
  environment.relays[0].status = 'charging';
  environment._updateSectorThreat(6);
  assert.equal(environment.lastDamage, null);
  environment._updateHazards(1.51);
  assert.equal(environment.lastDamage.kind, 'environment');
  assert.equal(environment.lastDamage.name, '地脉热浪');
  assert.match(environment.lastDamage.hint, /侧边/);
  assert.equal(environment.lastDamage.healthLost, 14);

  const enemy = arena();
  const mortar = enemy.spawnEnemy('mortar', { x: 1270, y: 1000 });
  mortar.attackTimer = 0;
  enemy.update(1 / 60);
  assert.equal(enemy.lastDamage, null);
  assert.equal(enemy.hazards.length, 1);
  until(enemy, () => enemy.lastDamage !== null);
  assert.equal(enemy.lastDamage.kind, 'hazard');
  assert.match(enemy.lastDamage.name, /范围轰击$/);
  assert.notEqual(enemy.lastDamage.name, environment.lastDamage.name);
  assert.match(enemy.lastDamage.hint, /地面预警/);
  assert.match(enemy.lastDamage.hint, /掩体无法挡住/);
  assert.equal(enemy.lastDamage.healthLost, mortar.damage);
});

test('boss projectiles preserve the attack name and hint after the warning clears', () => {
  const game = arena('foundry');
  const boss = game.spawnEnemy('boss', { x: 1250, y: 1000 });
  boss.attackTimer = 0;
  boss.attackCount = 1;
  game.update(1 / 60);
  assert.equal(boss.attackName, '扇形熔弹');
  until(game, () => game.bullets.length > 0);
  assert.equal(boss.attackName, '');
  assert.equal(game.lastDamage, null);
  until(game, () => game.lastDamage !== null);
  assert.equal(game.lastDamage.kind, 'projectile');
  assert.equal(game.lastDamage.name, '熔炉监工 · 扇形熔弹');
  assert.match(game.lastDamage.hint, /两侧移动/);
  assert.equal(game.lastDamage.healthLost, 11);
});

test('reset clears old damage and starts a new map without a stale death cause', () => {
  const game = arena();
  for (const mapId of ['frontier', 'foundry', 'frost']) {
    game._damagePlayer(1000, { kind: 'contact', name: '上一局的敌人' });
    assert.equal(game.phase, 'lost');
    assert.ok(game.lastDamage);
    game.reset(mapId);
    assert.equal(game.lastDamage, null);
    assert.equal(game.phase, 'ready');
    assert.equal(game.player.hp, game.player.maxHp);
    assert.equal(game.map.id, mapId);
    game.start();
  }
});
