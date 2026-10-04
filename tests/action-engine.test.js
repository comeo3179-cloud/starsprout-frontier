'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, WEAPONS, ENEMIES, RELICS, MAPS } = require('../action-engine.js');

function arena() {
  const game = new Game({ random: () => 0.5 });
  game.start();
  game.player.x = 1000;
  game.player.y = 1000;
  game.obstacles = [];
  game.spawnTimer = Infinity;
  game.drainEvents();
  return game;
}

function advance(game, seconds, input = {}, choose = false) {
  for (let elapsed = 0; elapsed < seconds - 0.00001; elapsed += 0.05) {
    game.update(Math.min(0.05, seconds - elapsed), input);
    if (choose && game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id);
  }
}

test('ready, upgrade and terminal phases freeze simulation', () => {
  const game = new Game();
  game.update(0.2, { moveX: 1, shoot: true });
  assert.equal(game.elapsed, 0);
  assert.equal(game.start(), true);
  assert.equal(game.start(), false);
  for (const phase of ['upgrade', 'won', 'lost']) {
    game.phase = phase;
    game.update(0.2, { moveX: 1, shoot: true });
    assert.equal(game.elapsed, 0);
    assert.equal(game.dash(), false);
    assert.equal(game.reload(), false);
    assert.equal(game.useSkill(), false);
  }
});

test('diagonal movement is normalized and world bounds hold', () => {
  const game = arena();
  advance(game, 1, { moveX: 1, moveY: 1 });
  assert.ok(Math.abs(Math.hypot(game.player.x - 1000, game.player.y - 1000) - game.player.speed) < 0.001);
  game.player.x = game.world.width - 37;
  advance(game, 1, { moveX: 1 });
  assert.equal(game.player.x, game.world.width - game.player.radius - 20);
});

test('circular obstacles stop both player and pursuing enemy', () => {
  const game = arena();
  const rock = { id: 9999, type: 'rock', x: 1100, y: 1000, radius: 45 };
  game.obstacles.push(rock);
  advance(game, 1, { moveX: 1 });
  assert.ok(game.player.x <= 1100 - rock.radius - game.player.radius + 0.001);
  const enemy = game.spawnEnemy('crawler', { x: 1200, y: 1000 });
  advance(game, 1);
  assert.ok(Math.hypot(enemy.x - rock.x, enemy.y - rock.y) >= rock.radius + enemy.radius - 0.001);
});

test('generated map leaves every interaction and spawn position clear', () => {
  const game = new Game();
  for (const entity of [game.player, ...game.relays, ...game.crates, ...game.stations]) {
    assert.ok(game.obstacles.every(rock => Math.hypot(entity.x - rock.x, entity.y - rock.y) > rock.radius + 100));
  }
  assert.equal(game.crates.length, 16);
  assert.equal(game.relays.length, 3);
  assert.ok(game.obstacles.length > 20);
});

test('aim controls live facing and shots consume one round', () => {
  const game = arena();
  game.update(0.01, { aimX: 1000, aimY: 500, shoot: true });
  assert.equal(game.player.angle, -Math.PI / 2);
  assert.equal(game.player.ammo, WEAPONS[0].magSize - 1);
  assert.equal(game.bullets.length, 1);
  assert.ok(game.bullets[0].vy < 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'shot').length, 1);
});

test('each weapon retains its own ammunition across switches and reloads', () => {
  const game = arena();
  game.update(0.01, { aimX: 1500, aimY: 1000, shoot: true });
  assert.equal(game.reload(), true);
  const remaining = game.player.reloadTimer;
  assert.ok(remaining > 0);
  game.switchWeapon(1);
  assert.equal(game.player.ammo, WEAPONS[1].magSize);
  game.switchWeapon(0);
  assert.equal(game.player.ammo, WEAPONS[0].magSize - 1);
  assert.equal(game.player.reloadTimer, remaining);
  advance(game, WEAPONS[0].reloadTime + 0.1);
  assert.equal(game.player.ammo, WEAPONS[0].magSize);
  assert.equal(game.player.reloadTimer, 0);
  assert.equal(game.reload(), false);
});

test('empty gun automatically reloads while trigger remains held', () => {
  const game = arena();
  game.ammoByWeapon[0] = 0;
  game.update(0.01, { shoot: true });
  assert.ok(game.player.reloadTimer > 0);
  advance(game, 1.5, { shoot: true });
  assert.ok(game.player.ammo > 0 && game.player.ammo < WEAPONS[0].magSize);
});

test('shotgun creates eight spread pellets and rail shot penetrates four enemies', () => {
  const shotgun = arena();
  shotgun.switchWeapon(1);
  advance(shotgun, 0.2, { aimX: 1500, aimY: 1000, shoot: true });
  assert.equal(shotgun.bullets.length, 8);
  assert.ok(shotgun.bullets.some(bullet => bullet.vy < 0));
  assert.ok(shotgun.bullets.some(bullet => bullet.vy > 0));
  const rail = arena();
  rail.switchWeapon(2);
  for (let i = 0; i < 4; i += 1) rail.spawnEnemy('crawler', { x: 1120 + i * 70, y: 1000 });
  advance(rail, 0.5, { aimX: 1800, aimY: 1000, shoot: true });
  assert.equal(rail.kills, 4);
  assert.equal(rail.player.ammo, WEAPONS[2].magSize - 1);
});

test('solid cover intercepts projectiles before enemies behind it', () => {
  const game = arena();
  game.obstacles.push({ id: 9999, x: 1100, y: 1000, radius: 35 });
  const enemy = game.spawnEnemy('tank', { x: 1220, y: 1000 });
  advance(game, 0.5, { aimX: 1500, aimY: 1000, shoot: true });
  assert.equal(enemy.hp, enemy.maxHp);
  assert.ok(game.drainEvents().some(event => event.type === 'spark'));
});

test('dash is faster, gives brief invulnerability and obeys cooldown', () => {
  const game = arena();
  game.update(0.01, { moveX: 1 });
  const start = game.player.x;
  assert.equal(game.dash(), true);
  assert.equal(game.dash(), false);
  game.hazards.push({ id: 9000, type: 'blast', x: game.player.x, y: game.player.y, radius: 300, remaining: 0.01, duration: 0.01, damage: 30 });
  advance(game, 0.2);
  assert.ok(game.player.x - start > 150);
  assert.equal(game.player.hp, game.player.maxHp);
  advance(game, 2.8);
  assert.equal(game.dash(), true);
});

test('dash uses same-frame input direction immediately and normalizes diagonals', () => {
  const game = arena();
  game.update(0.01, { moveY: -1 });
  const start = { x: game.player.x, y: game.player.y };
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  advance(game, 0.2);
  assert.ok(game.player.x - start.x > 150);
  assert.equal(game.player.y, start.y);
  const diagonal = arena();
  diagonal.dash({ x: 1, y: 1 });
  advance(diagonal, 0.2);
  assert.ok(Math.abs(Math.hypot(diagonal.player.x - 1000, diagonal.player.y - 1000) - 162) < 0.0001);
  assert.ok(Math.abs(diagonal.dashVector.x - diagonal.dashVector.y) < 0.0001);
});

test('EMP damages nearby enemies, leaves distant targets and clears enemy bullets', () => {
  const game = arena();
  const close = game.spawnEnemy('crawler', { x: 1080, y: 1000 });
  const far = game.spawnEnemy('tank', { x: 1500, y: 1000 });
  game.bullets.push({ id: 999, owner: 'enemy', x: 1050, y: 1000, radius: 5 });
  assert.equal(game.useSkill(), true);
  assert.ok(close.hp <= 0);
  assert.equal(far.hp, far.maxHp);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.useSkill(), false);
  game.player.invulnerable = 20;
  advance(game, 13.1);
  assert.equal(game.useSkill(), true);
});

test('contact damage is rate limited and lethal damage ends the mission', () => {
  const game = arena();
  game.player.hp = 5;
  game.spawnEnemy('crawler', { x: 1000, y: 1000 });
  game.update(0.05);
  assert.equal(game.phase, 'lost');
  assert.equal(game.player.hp, 0);
  assert.ok(game.drainEvents().some(event => event.type === 'lose'));
  const other = arena();
  for (let i = 0; i < 5; i += 1) other.spawnEnemy('crawler', { x: 1000, y: 1000 });
  other.update(0.05);
  assert.equal(other.player.hp, other.player.maxHp - ENEMIES.crawler.damage);
});

test('EMP interrupts a charging enemy instead of leaving an untelegraphed delayed charge', () => {
  const game = arena();
  const enemy = game.spawnEnemy('charger', { x: 1190, y: 1000 });
  enemy.attackTimer = 0;
  game.update(0.02);
  assert.ok(enemy.windup > 0);
  assert.ok(game.hazards.some(hazard => hazard.sourceId === enemy.id));
  game.useSkill();
  assert.equal(enemy.windup, 0);
  assert.equal(enemy.chargeTimer, 0);
  assert.equal(game.hazards.some(hazard => hazard.sourceId === enemy.id), false);
  advance(game, 2.2);
  assert.equal(enemy.chargeTimer, 0);
});

test('blast hazards cause damage only when their telegraph finishes', () => {
  const game = arena();
  game.hazards.push({ id: 8000, type: 'blast', x: 1000, y: 1000, radius: 100, remaining: 1, duration: 1, damage: 24 });
  advance(game, 0.8);
  assert.equal(game.player.hp, game.player.maxHp);
  advance(game, 0.3);
  assert.equal(game.player.hp, game.player.maxHp - 24);
  assert.equal(game.hazards.length, 0);
});

test('pickups grant their actual resources and upgrade choice applies once', () => {
  const game = arena();
  game.player.hp = 70;
  game.pickups.push(
    { id: 901, type: 'heal', x: 1000, y: 1000, value: 16, radius: 5, lifetime: 20 },
    { id: 902, type: 'credits', x: 1000, y: 1000, value: 7, radius: 5, lifetime: 20 },
    { id: 903, type: 'xp', x: 1000, y: 1000, value: 35, radius: 5, lifetime: 20 }
  );
  game.update(0.05);
  assert.equal(game.player.hp, 86);
  assert.equal(game.player.credits, 7);
  assert.equal(game.player.level, 2);
  assert.equal(game.player.xp, 3);
  assert.equal(game.phase, 'upgrade');
  assert.equal(game.upgradeChoices.length, 3);
  assert.equal(game.chooseUpgrade('not-a-choice'), false);
  const choice = game.upgradeChoices[0].id;
  assert.equal(game.chooseUpgrade(choice), true);
  assert.equal(game.chooseUpgrade(choice), false);
  assert.equal(game.upgradeStacks[choice], 1);
  assert.equal(game.phase, 'playing');
});

test('interactions require proximity and supply crates cannot be looted twice', () => {
  const game = arena();
  assert.equal(game.interact(), false);
  const crate = game.crates[0];
  Object.assign(game.player, { x: crate.x, y: crate.y, hp: 60 });
  assert.equal(game.interact(), true);
  assert.equal(crate.opened, true);
  assert.equal(game.player.credits, 14);
  assert.equal(game.player.hp, 76);
  assert.equal(game.interact(), false);
  assert.equal(game.player.credits, 14);
});

test('medical and armory stations charge displayed prices and apply real effects', () => {
  const game = arena();
  const medical = game.stations.find(station => station.kind === 'medical');
  Object.assign(game.player, { x: medical.x, y: medical.y, hp: 40, credits: 9 });
  assert.equal(game.interact(), false);
  game.player.credits = 30;
  assert.equal(game.interact(), true);
  assert.equal(game.player.hp, 90);
  assert.equal(game.player.credits, 20);
  const armory = game.stations.find(station => station.kind === 'armory');
  Object.assign(game.player, { x: armory.x, y: armory.y });
  assert.equal(game.interact(), true);
  assert.equal(game.player.damageMultiplier, 1.08);
  assert.equal(game.player.credits, 0);
  assert.equal(armory.cost, 30);
});

test('relay upload pauses outside the defense circle and cannot start two at once', () => {
  const game = arena();
  const relay = game.relays[0];
  Object.assign(game.player, { x: relay.x, y: relay.y, invulnerable: 100 });
  assert.equal(game.interact(), true);
  advance(game, 1);
  assert.ok(relay.progress > 0);
  const progress = relay.progress;
  Object.assign(game.player, { x: game.relays[1].x, y: game.relays[1].y });
  assert.equal(game.interact(), false);
  advance(game, 1);
  assert.equal(relay.progress, progress);
});

test('three completed relays summon a boss, whose defeat wins the mission', () => {
  const game = arena();
  game.player.invulnerable = 1000;
  for (const relay of game.relays) {
    Object.assign(game.player, { x: relay.x, y: relay.y });
    assert.equal(game.interact(), true);
    game.relaySpawnTimer = Infinity;
    advance(game, 40.1, {}, true);
    assert.equal(relay.status, 'active');
    assert.equal(relay.progress, 1);
  }
  assert.equal(game.completedRelays, 3);
  assert.equal(game.bossSpawned, true);
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  assert.ok(boss);
  boss.x = game.player.x + 90;
  boss.y = game.player.y;
  boss.hp = boss.maxHp * 0.49;
  game.update(0.05);
  assert.equal(boss.stage, 2);
  boss.hp = 1;
  game.player.skillCooldown = 0;
  game.useSkill();
  assert.equal(game.phase, 'won');
  assert.ok(game.drainEvents().some(event => event.type === 'win'));
});

test('enemy population is capped and opening grants breathing room', () => {
  const game = new Game({ random: () => 0.5 });
  game.start();
  advance(game, 4.9);
  assert.equal(game.enemies.length, 0);
  advance(game, 0.2);
  assert.equal(game.enemies.length, 1);
  assert.ok(Math.hypot(game.player.x - game.enemies[0].x, game.player.y - game.enemies[0].y) > 590);
  for (let i = 0; i < 80; i += 1) game.spawnEnemy('crawler');
  assert.equal(game.enemies.length, 55);
});

test('a new player has time to read controls instead of dying within the first 25 seconds', () => {
  for (const sample of [0.1, 0.5, 0.9]) {
    const game = new Game({ random: () => sample });
    game.start();
    advance(game, 25);
    assert.equal(game.phase, 'playing');
    assert.ok(game.player.hp > 0);
    assert.ok(game.elapsed >= 24.99);
  }
});

test('precise reload completes inside the window and boosts exactly that magazine', () => {
  const game = arena();
  game.update(0.01, { shoot: true });
  assert.equal(game.reload(), true);
  assert.equal(game.player.reloadResult, 'loading');
  advance(game, WEAPONS[0].reloadTime * 0.6);
  assert.ok(game.player.reloadProgress >= game.player.reloadWindowStart && game.player.reloadProgress <= game.player.reloadWindowEnd);
  assert.equal(game.reload(), true);
  assert.equal(game.player.reloadTimer, 0);
  assert.equal(game.player.reloadResult, 'perfect');
  assert.equal(game.player.ammo, WEAPONS[0].magSize);
  assert.equal(game.player.overcharged, true);
  game.bullets = [];
  game.update(0.01, { shoot: true });
  assert.ok(Math.abs(game.bullets[0].damage - WEAPONS[0].damage * 1.15) < 0.00001);
  assert.equal(game.overchargedByWeapon[0], WEAPONS[0].magSize - 1);
  game.switchWeapon(1);
  assert.equal(game.player.overcharged, false);
  game.switchWeapon(0);
  assert.equal(game.player.overcharged, true);
  assert.equal(game.player.ammo, WEAPONS[0].magSize - 1);
  game.reload();
  assert.equal(game.player.overcharged, false);
  advance(game, WEAPONS[0].reloadTime + 0.1);
  assert.equal(game.player.overcharged, false);
  assert.equal(game.drainEvents().filter(event => event.type === 'reload-perfect').length, 1);
});

test('an early precise reload attempt cannot be retried or reset by switching guns', () => {
  const game = arena();
  game.ammoByWeapon[0] = 3;
  game.reload();
  advance(game, 0.2);
  assert.equal(game.reload(), false);
  assert.equal(game.player.reloadResult, 'miss');
  game.switchWeapon(1);
  game.switchWeapon(0);
  assert.equal(game.player.reloadAttempted, true);
  advance(game, 0.6);
  assert.ok(game.player.reloadProgress > 0.52 && game.player.reloadProgress < 0.72);
  for (let attempt = 0; attempt < 10; attempt += 1) assert.equal(game.reload(), false);
  assert.ok(game.player.reloadTimer > 0);
  advance(game, 0.6);
  assert.equal(game.player.ammo, WEAPONS[0].magSize);
  assert.equal(game.player.overcharged, false);
  assert.equal(game.drainEvents().filter(event => event.type === 'reload-miss').length, 1);
});

test('a late precise reload attempt misses without cancelling normal reload', () => {
  const game = arena();
  game.ammoByWeapon[0] = 1;
  game.reload();
  advance(game, WEAPONS[0].reloadTime * 0.85);
  assert.equal(game.reload(), false);
  assert.equal(game.player.reloadResult, 'miss');
  advance(game, 0.3);
  assert.equal(game.player.ammo, WEAPONS[0].magSize);
  assert.equal(game.player.overcharged, false);
});

test('both exact displayed precision-window edges work for every weapon', () => {
  for (let weapon = 0; weapon < WEAPONS.length; weapon += 1) {
    for (const edge of [0.52, 0.72]) {
      const game = arena();
      game.switchWeapon(weapon);
      game.ammoByWeapon[weapon] -= 1;
      game.reload();
      advance(game, WEAPONS[weapon].reloadTime * edge);
      assert.equal(game.reload(), true, `weapon ${weapon}, window edge ${edge}`);
      assert.equal(game.player.reloadResult, 'perfect');
    }
  }
});

test('early level choices include a unique mod for the selected weapon', () => {
  for (const [weapon, mod] of [[0, 'arc'], [1, 'repulsor'], [2, 'shatter']]) {
    const game = arena();
    game.switchWeapon(weapon);
    game.player.xp = game.player.xpNeeded;
    game.update(0.01);
    assert.ok(game.upgradeChoices.some(choice => choice.id === mod && choice.stacks === 0));
    assert.equal(game.chooseUpgrade(mod), true);
    game.player.xp = game.player.xpNeeded;
    game.update(0.01);
    assert.equal(game.upgradeChoices.some(choice => choice.id === mod), false);
  }
});

test('rifle arc damages one nearby enemy outside the original bullet path', () => {
  const game = arena();
  game.player.arcRounds = true;
  const primary = game.spawnEnemy('crawler', { x: 1140, y: 1000 });
  const nearby = game.spawnEnemy('crawler', { x: 1150, y: 1070 });
  primary.speed = 0; nearby.speed = 0;
  game.update(0.01, { aimX: 1500, aimY: 1000, shoot: true });
  advance(game, 0.15);
  assert.ok(primary.hp < primary.maxHp);
  assert.ok(Math.abs(nearby.hp - (nearby.maxHp - WEAPONS[0].damage * 0.45)) < 0.00001);
  assert.equal(game.drainEvents().filter(event => event.type === 'arc').length, 1);
});

test('shotgun repulsor interrupts a charging enemy with real knockback', () => {
  const game = arena();
  game.player.repulsorRounds = true;
  game.switchWeapon(1);
  const enemy = game.spawnEnemy('charger', { x: 1140, y: 1000 });
  enemy.hp = 500;
  enemy.attackTimer = 0;
  advance(game, 0.18, { aimX: 1500, aimY: 1000, shoot: true });
  advance(game, 0.2);
  assert.equal(enemy.windup, 0);
  assert.equal(enemy.chargeTimer, 0);
  assert.ok(enemy.x > 1140);
  assert.equal(game.hazards.some(hazard => hazard.sourceId === enemy.id), false);
});

test('rail shatter damages off-axis enemies and explodes only on its first impact', () => {
  const game = arena();
  game.player.shatterRounds = true;
  game.switchWeapon(2);
  const primary = game.spawnEnemy('crawler', { x: 1140, y: 1000 });
  const second = game.spawnEnemy('crawler', { x: 1250, y: 1000 });
  const nearby = game.spawnEnemy('crawler', { x: 1150, y: 1070 });
  for (const enemy of [primary, second, nearby]) { enemy.speed = 0; enemy.hp = 400; }
  advance(game, 0.35, { aimX: 1700, aimY: 1000, shoot: true });
  assert.ok(Math.abs(nearby.hp - (400 - WEAPONS[2].damage * 0.35)) < 0.00001);
  assert.equal(game.drainEvents().filter(event => event.type === 'explosion' && event.owner === 'player').length, 1);
});

test('tank slam has a visible warning, then exposes a real damage vulnerability', () => {
  const game = arena();
  const tank = game.spawnEnemy('tank', { x: 1100, y: 1000 });
  tank.attackTimer = 0;
  game.update(0.01);
  assert.ok(tank.windup > 0);
  assert.ok(game.hazards.some(hazard => hazard.sourceId === tank.id && hazard.enemyType === 'tank'));
  advance(game, 0.7);
  assert.equal(game.player.hp, game.player.maxHp);
  advance(game, 0.3);
  assert.equal(game.player.hp, game.player.maxHp - 23);
  assert.ok(tank.recoveryTimer > 0);
  const before = tank.hp;
  game._damageEnemy(tank, 10);
  assert.equal(before - tank.hp, 15);
  tank.recoveryTimer = 0;
  const armored = tank.hp;
  game._damageEnemy(tank, 10);
  assert.equal(armored - tank.hp, 8);
});

test('boss ring is telegraphed before projectiles and followed by recovery', () => {
  const game = arena();
  const boss = game.spawnEnemy('boss', { x: 1300, y: 1000 });
  boss.attackCount = 1;
  boss.attackTimer = 0;
  game.update(0.01);
  assert.equal(boss.attackKind, 'ring');
  assert.ok(boss.windup > 0);
  assert.equal(game.bullets.length, 0);
  advance(game, 0.6);
  assert.equal(game.bullets.length, 0);
  advance(game, 0.3);
  assert.equal(game.bullets.length, 14);
  assert.ok(boss.recoveryTimer > 0);
});

test('ranged enemies seek a clear shot instead of repeatedly firing into cover', () => {
  const game = arena();
  game.obstacles.push({ id: 8000, x: 1100, y: 1000, radius: 35 });
  const enemy = game.spawnEnemy('spitter', { x: 1300, y: 1000 });
  enemy.attackTimer = 0;
  game.update(0.02);
  assert.equal(enemy.windup, 0);
  assert.equal(game.bullets.length, 0);
  assert.ok(enemy.x < 1300);
  enemy.x = 1300; enemy.y = 1200;
  game.update(0.01);
  assert.ok(enemy.windup > 0);
  assert.equal(game.bullets.length, 0);
});

test('enemies steer around isolated rocks and separate exact overlaps', () => {
  const game = arena();
  game.player.invulnerable = 20;
  game.obstacles.push({ id: 8000, x: 1100, y: 1000, radius: 45 });
  const enemy = game.spawnEnemy('crawler', { x: 1250, y: 1000 });
  advance(game, 4.5);
  assert.ok(enemy.x < 1100);
  const first = game.spawnEnemy('crawler', { x: 1500, y: 1500 });
  const second = game.spawnEnemy('crawler', { x: 1500, y: 1500 });
  first.speed = 0; second.speed = 0;
  advance(game, 0.5);
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > 20);
});

test('reinforcements pause during recovery and each relay has its own wave theme', () => {
  const game = arena();
  game.elapsed = 49.1;
  game.spawnTimer = 0;
  advance(game, 2);
  assert.equal(game.pressurePhase, 'recovery');
  assert.equal(game.enemies.length, 0);
  for (const [index, type] of [[0, 'crawler'], [1, 'spitter'], [2, 'tank']]) {
    const trial = arena();
    trial.elapsed = 30;
    const relay = trial.relays[index];
    Object.assign(trial.player, { x: relay.x, y: relay.y });
    trial.interact();
    advance(trial, 1.3);
    assert.equal(trial.enemies[0].type, type);
    relay.progress = 0.34;
    trial.update(0.01);
    assert.equal(relay.wave, 2);
    assert.ok(trial.drainEvents().some(event => event.type === 'relay-wave' && event.wave === 2));
  }
});

test('relay experience is guaranteed when completion occurs at the defense perimeter', () => {
  const game = arena();
  const relay = game.relays[0];
  Object.assign(game.player, { x: relay.x, y: relay.y });
  game.interact();
  game.player.x = relay.x + relay.radius - 5;
  relay.progress = 0.9998;
  game.update(0.02);
  assert.equal(relay.status, 'active');
  assert.equal(game.phase, 'upgrade');
  assert.equal(game.player.level, 2);
  assert.equal(game.player.xp, 28);
  assert.equal(game.pickups.filter(pickup => pickup.type === 'xp').length, 0);
  assert.ok(game.drainEvents().some(event => event.type === 'relay-complete' && event.xp === 60));
});

test('reset clears combat, upgrades, resources, objectives and event history', () => {
  const game = arena();
  game.spawnEnemy('tank');
  game.player.hp = 3;
  game.player.credits = 200;
  game.completedRelays = 2;
  game.bossSpawned = true;
  game.upgradeStacks.damage = 3;
  game.reset();
  assert.equal(game.phase, 'ready');
  assert.equal(game.player.hp, 120);
  assert.equal(game.player.credits, 0);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.completedRelays, 0);
  assert.equal(game.bossSpawned, false);
  assert.deepEqual(game.upgradeStacks, {});
  assert.equal(game.drainEvents().length, 0);
});

function at(game, entity) { game.player.x = entity.x; game.player.y = entity.y; }
function finishContract(game, contract) {
  at(game, contract); assert.equal(game.interact(), true);
  if (contract.kind === 'salvage') {
    for (const node of contract.nodes) { at(game, node); assert.equal(game.interact(), true); }
  } else {
    for (const enemy of [...game.enemies].filter(enemy => enemy.contractId === contract.id)) game._damageEnemy(enemy, 100000);
  }
  assert.equal(contract.status, 'ready');
  at(game, contract); assert.equal(game.interact(), true);
}

test('all three optional contracts have completeable distinct objectives and unique rewards', () => {
  const game = arena();
  for (const contract of game.contracts) {
    const credits = game.player.credits;
    finishContract(game, contract);
    assert.equal(game.phase, 'relic');
    assert.equal(game.player.credits, credits + 30);
    assert.equal(game.relicChoices.length, 3 - game.relics.length);
    const choice = game.relicChoices[0].id;
    assert.equal(game.chooseRelic(choice), true);
    assert.equal(game.chooseRelic(choice), false);
    assert.equal(contract.status, 'complete');
    assert.equal(game.interact(), false);
  }
  assert.equal(new Set(game.relics).size, 3);
  assert.equal(game.score >= 1350, true);
  assert.equal(game.completedRelays, 0);
});

test('core collection is proximity gated, counts once and blocks a second active contract', () => {
  const game = arena(), [salvage, hunt] = game.contracts;
  at(game, salvage.nodes[0]); assert.equal(game.interact(), false);
  at(game, salvage); game.interact();
  at(game, hunt); assert.equal(game.interact(), false);
  at(game, salvage.nodes[0]); assert.equal(game.interact(), true);
  assert.equal(game.interact(), false); assert.equal(salvage.progress, 1);
  assert.equal(game.contractTarget(salvage).collected, false);
  game.player.x = 20; game.player.y = 20; advance(game, .1);
  assert.equal(salvage.progress, 1);
});

test('reward selection freezes combat and queues a pending experience upgrade', () => {
  const game = arena(); finishContract(game, game.contracts[0]);
  const before = { elapsed: game.elapsed, x: game.player.x, ammo: game.player.ammo };
  game.update(.2, { moveX: 1, shoot: true });
  assert.deepEqual({ elapsed: game.elapsed, x: game.player.x, ammo: game.player.ammo }, before);
  assert.equal(game.dash(), false); assert.equal(game.interact(), false);
  assert.equal(game.chooseRelic('invalid'), false);
  game.player.xp = game.player.xpNeeded;
  game.chooseRelic('phase-mag'); assert.equal(game.phase, 'upgrade');
  game.chooseUpgrade(game.upgradeChoices[0].id); assert.equal(game.phase, 'playing');
  assert.deepEqual(game.relics, ['phase-mag']);
});

test('phase magazine restores only the current weapon and cannot bypass dash cooldown', () => {
  const game = arena(); game.relics.push('phase-mag');
  game.ammoByWeapon = [0, 1, 2]; game._syncWeapon();
  game.dash({ x: 1, y: 0 }); assert.deepEqual(game.ammoByWeapon, [8, 1, 2]);
  assert.equal(game.dash(), false); assert.equal(game.ammoByWeapon[0], 8);
  game.player.dashCooldown = 0; game.player.dashTimer = 0;
  game.ammoByWeapon[0] = 29; game.dash(); assert.equal(game.ammoByWeapon[0], 30);
});

test('echo pulse retains its cast position, waits, and clears projectiles at that position', () => {
  const game = arena(); game.relics.push('echo-pulse');
  const enemy = game.spawnEnemy('tank', { x: 1070, y: 1000 }); enemy.hp = enemy.maxHp = 1000;
  game.useSkill(); const initialHp = enemy.hp;
  game.player.x = 1800;
  advance(game, .6); assert.equal(enemy.hp, initialHp);
  game.bullets.push({ id: 999, owner: 'enemy', x: 1000, y: 1000, vx: 0, vy: 0, radius: 6, lifetime: 5, damage: 10 });
  advance(game, .1); assert.ok(enemy.hp < initialHp);
  assert.equal(game.bullets.some(bullet => bullet.id === 999), false);
  assert.equal(game.echoBursts.length, 0);
});

test('hunter prism fires exactly once on a successful precision reload', () => {
  const game = arena(); game.relics.push('precision-burst');
  game.player.hp = 80; game.ammoByWeapon[0] = 10; game._syncWeapon(); game.reload();
  advance(game, WEAPONS[0].reloadTime * .6); assert.equal(game.reload(), true);
  assert.equal(game.bullets.length, 3); assert.equal(game.player.hp, 90);
  assert.ok(game.bullets.every(bullet => bullet.pierce === 2 && bullet.damage === 45));
  assert.equal(game.reload(), false); assert.equal(game.bullets.length, 3);
  game.bullets = []; game.ammoByWeapon[0] = 1; game.reload(); game.reload();
  advance(game, 2); assert.equal(game.bullets.length, 0); assert.equal(game.player.hp, 90);
});

test('mortar locks a warned landing zone that can be dodged or interrupted', () => {
  const game = arena(), mortar = game.spawnEnemy('mortar', { x: 1270, y: 1000 });
  mortar.attackTimer = 0; advance(game, .05);
  assert.equal(game.hazards.length, 1); assert.equal(game.player.hp, 120);
  const mark = { x: game.hazards[0].x, y: game.hazards[0].y };
  game.player.x = 800; advance(game, 1.3); assert.equal(game.player.hp, 120);
  assert.equal(mark.x, 1000);
  advance(game, 1.3); mortar.attackTimer = 0; advance(game, .05); assert.equal(game.hazards.length, 1);
  at(game, mortar); game.useSkill(); assert.equal(game.hazards.length, 0);
});

test('nests stay fixed, cap their own brood and stop spawning after destruction', () => {
  const game = arena(), nest = game.spawnEnemy('nest', { x: 1300, y: 1000 });
  game.player.invulnerable = 100; nest.attackTimer = 0;
  advance(game, 25);
  assert.equal(game.enemies.filter(enemy => enemy.nestId === nest.id).length, 3);
  assert.equal(nest.x, 1300); assert.equal(nest.y, 1000);
  game._damageEnemy(nest, 10000); const count = game.enemies.filter(enemy => enemy.nestId === nest.id).length;
  advance(game, 7); assert.equal(game.enemies.filter(enemy => enemy.nestId === nest.id).length, count);
});

test('a full enemy cap delays contract spawning without losing targets or progress', () => {
  const game = arena(), hunt = game.contracts[1];
  for (let i = 0; i < 55; i++) game.spawnEnemy('crawler', { x: 2900, y: 200 });
  at(game, hunt); game.interact(); assert.equal(hunt.spawned, 0);
  game.enemies[0].hp = 0; game.enemies[1].hp = 0;
  advance(game, .05); assert.equal(hunt.spawned, 2);
  assert.equal(game.enemies.filter(enemy => enemy.contractId === hunt.id).length, 2);
});

test('boss arrival preserves active contract targets at the population cap', () => {
  const game = arena(), hunt = game.contracts[1]; at(game, hunt); game.interact();
  for (let i = game.enemies.length; i < 55; i++) game.spawnEnemy('crawler', { x: 2900, y: 200 });
  game.enemies.unshift({ id: -1, type: 'crawler', hp: 0 });
  game._spawnBoss();
  assert.equal(game.enemies.filter(enemy => enemy.type === 'boss').length, 1);
  assert.equal(game.enemies.filter(enemy => enemy.contractId === hunt.id).length, 2);
  for (const enemy of game.enemies.filter(enemy => enemy.contractId === hunt.id)) game._damageEnemy(enemy, 10000);
  assert.equal(hunt.status, 'ready');
});

test('a delayed relic killing the boss stops the remaining simulation step', () => {
  const game = arena(); game.elapsed = 100; game.spawnTimer = 0;
  const boss = game.spawnEnemy('boss', { x: 1050, y: 1000 }); boss.hp = 1;
  game.echoBursts.push({ x: 1000, y: 1000, radius: 210, damage: 80, remaining: .001 });
  advance(game, .05);
  assert.equal(game.phase, 'won'); assert.equal(game.enemies.length, 1);
  assert.equal(game.spawnTimer, 0);
});

test('late reinforcements retain tanks alongside the new mortar enemy', () => {
  for (const [roll, expected] of [[.2, 'crawler'], [.6, 'spitter'], [.85, 'charger'], [.95, 'tank'], [.99, 'mortar']]) {
    const game = arena(); game.elapsed = 140; game.spawnTimer = 0; game.random = () => roll;
    game._spawnDirector(.05);
    assert.equal(game.enemies[0].type, expected);
  }
});

test('new expedition state resets and all contract terminals and cores remain accessible', () => {
  const game = new Game();
  for (const point of game.contracts.flatMap(contract => [contract, ...contract.nodes])) {
    assert.ok(game.obstacles.every(rock => Math.hypot(rock.x - point.x, rock.y - point.y) > rock.radius + point.radius));
  }
  game.relics = RELICS.map(relic => relic.id); game.contracts[0].status = 'complete'; game.echoBursts.push({}); game.reset();
  assert.equal(game.relics.length, 0); assert.equal(game.echoBursts.length, 0);
  assert.ok(game.contracts.every(contract => contract.status === 'idle' && contract.progress === 0));
});

test('phase dash marks its actual path once and leaves distant enemies untouched', () => {
  const game = arena();
  const near = game.spawnEnemy('crawler', { x: 1100, y: 1060 });
  const far = game.spawnEnemy('crawler', { x: 1100, y: 1110 });
  near.stunTimer = far.stunTimer = 10;
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  assert.ok(near.phaseMarkTimer > 3.7);
  assert.equal(far.phaseMarkTimer, 0);
  assert.equal(near.hp, near.maxHp);
  assert.equal(game.drainEvents().filter(event => event.type === 'phase-mark').length, 1);
  advance(game, 4.1);
  assert.equal(near.phaseMarkTimer, 0);
  game.player.x = 1000; game.player.y = 1000;
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  assert.ok(near.phaseMarkTimer > 0);
});

test('phase marks follow the blocked dash position instead of marking through distant cover', () => {
  const game = arena();
  game.obstacles.push({ x: 1060, y: 1000, radius: 35 });
  const enemy = game.spawnEnemy('crawler', { x: 1140, y: 1000 }); enemy.stunTimer = 10;
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  assert.ok(game.player.x < 1010);
  assert.equal(enemy.phaseMarkTimer, 0);
});

test('dash captures enemy bullets within 80 pixels once while preserving player bullets', () => {
  const game = arena();
  for (const [id, y, owner] of [[9001, 1079, 'enemy'], [9002, 1081, 'enemy'], [9003, 1000, 'player']]) {
    game.bullets.push({ id, owner, x: 1010, y, vx: 0, vy: 0, radius: 3, lifetime: 2, damage: 5, hitIds: [] });
  }
  game.dash({ x: 1, y: 0 }); advance(game, .2);
  assert.equal(game.reactor.captures, 1);
  assert.equal(game.reactor.charge, 7);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.deepEqual(game.bullets.map(bullet => bullet.id), [9002, 9003]);
  assert.equal(game.drainEvents().filter(event => event.type === 'phase-capture').length, 1);
});

test('dash captures a fast crossing projectile but cover intercepts it first', () => {
  for (const covered of [false, true]) {
    const game = arena(); game.player.dashTimer = .2;
    if (covered) game.obstacles.push({ x: 900, y: 1000, radius: 20 });
    game.bullets.push({ id: 9001, owner: 'enemy', x: 800, y: 1000, vx: 20000, vy: 0, radius: 3, lifetime: 2, damage: 10 });
    game._updateBullets(.01);
    assert.equal(game.reactor.captures, covered ? 0 : 1);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.player.hp, game.player.maxHp);
  }
});

function phaseShot(game, enemy, damage = 1) {
  game.bullets.push({ id: game._id(), owner: 'player', x: enemy.x, y: enemy.y, vx: 0, vy: 0,
    radius: 3, lifetime: 1, damage, hitIds: [], pierce: 0 });
  game._updateBullets(.001);
}

test('a bullet consumes a phase mark once and its explosion respects the blast radius', () => {
  const game = arena();
  const target = game.spawnEnemy('spitter', { x: 1200, y: 1000 });
  const near = game.spawnEnemy('crawler', { x: 1290, y: 1000 });
  const far = game.spawnEnemy('crawler', { x: 1360, y: 1000 });
  target.hp = target.maxHp = near.hp = near.maxHp = 1000;
  target.phaseMarkTimer = 4;
  phaseShot(game, target);
  assert.equal(target.hp, 944);
  assert.equal(near.hp, 945);
  assert.equal(far.hp, far.maxHp);
  assert.equal(target.phaseMarkTimer, 0);
  assert.equal(game.reactor.charge, 8);
  phaseShot(game, target);
  assert.equal(target.hp, 943);
  assert.equal(game.reactor.detonations, 1);
});

test('phase chain reactions reach linked marks and are bounded even in a dense crowd', () => {
  const game = arena();
  const enemies = Array.from({ length: 11 }, (_, index) => {
    const enemy = game.spawnEnemy('crawler', { x: 1250 + index * 5, y: 1000 });
    enemy.hp = enemy.maxHp = 10000; enemy.phaseMarkTimer = 4; return enemy;
  });
  game.phaseDashRefund = .9; game.player.dashCooldown = 2.8;
  phaseShot(game, enemies[0]);
  assert.equal(game.reactor.detonations, 8);
  assert.equal(enemies.filter(enemy => enemy.phaseMarkTimer === 0).length, 8);
  assert.ok(Math.abs(game.player.dashCooldown - 1.9) < 1e-9);
  assert.equal(game.phaseDashRefund, 0);
  assert.equal(game.reactor.charge, 64);
  assert.deepEqual(game.drainEvents().filter(event => event.type === 'phase-burst').map(event => event.chain), [0, 1, 2, 3, 4, 5, 6, 7]);
  const isolated = arena();
  const first = isolated.spawnEnemy('crawler', { x: 1200, y: 1000 });
  const second = isolated.spawnEnemy('crawler', { x: 1320, y: 1000 });
  const third = isolated.spawnEnemy('crawler', { x: 1440, y: 1000 });
  for (const enemy of [first, second, third]) enemy.phaseMarkTimer = 4;
  phaseShot(isolated, first);
  assert.equal(isolated.kills, 3);
  assert.equal(isolated.reactor.detonations, 3);
});

test('phase bursts reduce boss damage and stop all queued damage on victory', () => {
  const game = arena();
  const boss = game.spawnEnemy('boss', { x: 1200, y: 1000 });
  boss.phaseMarkTimer = 4; phaseShot(game, boss);
  assert.ok(Math.abs(boss.hp - (boss.maxHp - 55 * .55 - 1)) < 1e-8);
  const other = game.spawnEnemy('crawler', { x: 1250, y: 1000 }); other.phaseMarkTimer = 4;
  boss.hp = 1; boss.phaseMarkTimer = 4; phaseShot(game, boss);
  assert.equal(game.phase, 'won');
  assert.equal(other.hp, other.maxHp);
  assert.equal(game.kills, 1);
  const charge = game.reactor.charge, bursts = game.reactor.detonations;
  phaseShot(game, other); game._detonatePhase(other); game._damageEnemy(other, 999);
  assert.equal(other.hp, other.maxHp);
  assert.equal(game.reactor.charge, charge);
  assert.equal(game.reactor.detonations, bursts);
});

test('overdrive requires full charge and fills every magazine while cancelling reloads', () => {
  const game = arena();
  game.reactor.charge = 99; assert.equal(game.activateOverdrive(), false);
  game.ammoByWeapon = [1, 0, 2]; game.reload(); game.player.dashCooldown = 2;
  game._chargeReactor(8); assert.equal(game.reactor.charge, 100);
  assert.equal(game.activateOverdrive(), true);
  assert.equal(game.activateOverdrive(), false);
  assert.equal(game.reactor.timer, 7); assert.equal(game.reactor.charge, 0);
  assert.deepEqual(game.ammoByWeapon, WEAPONS.map(weapon => weapon.magSize));
  assert.deepEqual(game.reloadByWeapon, WEAPONS.map(() => 0));
  assert.equal(game.player.dashCooldown, 0);
  assert.equal(game.player.reloadTimer, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'overdrive-start').length, 1);
});

test('overdrive boosts shooting without spending ammo then restores normal shooting and charge', () => {
  const game = arena(); game.reactor.charge = 100; game.activateOverdrive();
  game._shoot();
  assert.equal(game.player.ammo, 30);
  assert.equal(game.bullets[0].damage, WEAPONS[0].damage * 1.2);
  assert.equal(game.bullets[0].reactor, true);
  assert.equal(game.fireTimer, WEAPONS[0].fireInterval / 1.45);
  game._chargeReactor(100); assert.equal(game.reactor.charge, 0);
  advance(game, 7.05);
  game._shoot();
  assert.equal(game.player.ammo, 29);
  assert.equal(game.bullets.at(-1).damage, WEAPONS[0].damage);
  assert.equal(game.bullets.at(-1).reactor, false);
  game._chargeReactor(8); assert.equal(game.reactor.charge, 8);
  assert.equal(game.drainEvents().filter(event => event.type === 'overdrive-end').length, 1);
});

test('reactor, marks and combo freeze during decisions and terminal phases', () => {
  const game = arena(), enemy = game.spawnEnemy('tank', { x: 1600, y: 1000 });
  game.reactor.timer = 3; game.combo = { count: 3, timer: 2, best: 3 }; enemy.phaseMarkTimer = 4;
  for (const phase of ['ready', 'upgrade', 'relic', 'paused', 'won', 'lost']) {
    game.phase = phase; game.reactor.charge = 100;
    game.update(.2, { shoot: true });
    assert.equal(game.reactor.timer, 3); assert.equal(game.combo.timer, 2); assert.equal(enemy.phaseMarkTimer, 4);
    assert.equal(game.activateOverdrive(), false);
  }
  game.phase = 'playing'; game.update(.1);
  assert.ok(game.reactor.timer < 3); assert.ok(game.combo.timer < 2); assert.ok(enemy.phaseMarkTimer < 4);
});

test('kills build a timed combo and recharge; precise reload grants charge only once', () => {
  const game = arena();
  for (let index = 0; index < 3; index += 1) game._damageEnemy(game.spawnEnemy('crawler', { x: 1600, y: 1000 }), 100);
  assert.deepEqual(game.combo, { count: 3, timer: 4, best: 3 });
  assert.equal(game.reactor.charge, 24);
  advance(game, 4.1); assert.equal(game.combo.count, 0); assert.equal(game.combo.best, 3);
  game._damageEnemy(game.spawnEnemy('crawler', { x: 1600, y: 1000 }), 100);
  assert.equal(game.combo.count, 1);
  game.ammoByWeapon[0] = 10; game.reload(); advance(game, WEAPONS[0].reloadTime * .6);
  assert.equal(game.reload(), true); assert.equal(game.reactor.charge, 42);
  assert.equal(game.reload(), false); assert.equal(game.reactor.charge, 42);
  game.reset();
  assert.deepEqual(game.combo, { count: 0, timer: 0, best: 0 });
  assert.deepEqual(game.reactor, { charge: 0, maxCharge: 100, timer: 0, duration: 7, captures: 0, detonations: 0 });
});

test('first-minute director introduces ranged attacks after 12 seconds and retains recovery waves', () => {
  const game = arena(); game.random = () => .8;
  game.elapsed = 11; game.spawnTimer = 0; game._spawnDirector(.01);
  assert.equal(game.enemies.at(-1).type, 'crawler');
  game.elapsed = 12; game.spawnTimer = 0; game._spawnDirector(.01);
  assert.equal(game.enemies.at(-1).type, 'spitter');
  game.elapsed = 26; game.spawnTimer = 0; game._spawnDirector(.01);
  assert.ok(game.spawnTimer < 2.5);
  game.elapsed = 50; game.spawnTimer = 0; const count = game.enemies.length; game._spawnDirector(.01);
  assert.equal(game.pressurePhase, 'recovery'); assert.equal(game.enemies.length, count);
});

test('map selection creates distinct layouts and reset preserves or validates the selection', () => {
  assert.deepEqual(MAPS.map(map => map.id), ['frontier', 'foundry', 'frost', 'storm', 'ruins']);
  const layouts = new Set();
  for (const map of MAPS) {
    const game = new Game({ mapId: map.id });
    assert.equal(game.map.id, map.id);
    assert.deepEqual(game.spawn, { x: game.player.x, y: game.player.y });
    assert.ok(game.relays.every(relay => relay.mode === map.mode));
    layouts.add(JSON.stringify([game.spawn, game.relays.map(relay => [relay.x, relay.y]), game.crates.map(crate => [crate.x, crate.y])]));
    for (const point of [game.spawn, ...game.relays, ...game.stations, ...game.crates, ...game.contracts, ...game.contracts.flatMap(contract => contract.nodes)]) {
      assert.ok(game.obstacles.every(rock => distanceForTest(point, rock) > rock.radius + 100));
    }
    game.reset(); assert.equal(game.map.id, map.id);
    game.reset('missing-map'); assert.equal(game.map.id, 'frontier');
  }
  assert.equal(layouts.size, MAPS.length);
  assert.equal(new Game({ mapId: 'bad' }).map.id, 'frontier');
});

function distanceForTest(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

test('foundry targets require damage, stay fixed, and all three demolitions unlock the boss', () => {
  const game = new Game({ mapId: 'foundry', random: () => .5 }); game.start();
  game.spawnTimer = Infinity; game.player.invulnerable = 100;
  for (const [index, relay] of game.relays.entries()) {
    at(game, relay); assert.equal(game.interact(), true);
    const core = game.enemies.find(enemy => enemy.id === relay.reactorId);
    assert.ok(core); assert.equal(core.type, 'reactor'); assert.equal(core.objectiveRelayId, relay.id);
    game._updateRelays(100); assert.equal(relay.progress, 0); assert.equal(relay.status, 'charging');
    const hp = core.hp; game._damageEnemy(core, hp / 2); game._updateRelays(.01);
    assert.ok(Math.abs(relay.progress - .5) < 1e-9);
    const position = { x: core.x, y: core.y }; game._updateEnemies(1);
    assert.deepEqual({ x: core.x, y: core.y }, position);
    game._damageEnemy(core, hp);
    assert.equal(relay.status, 'active'); assert.equal(relay.progress, 1); assert.equal(game.completedRelays, index + 1);
    game._damageEnemy(core, hp); assert.equal(game.completedRelays, index + 1);
  }
  assert.equal(game.bossSpawned, true);
  const boss = game.enemies.find(enemy => enemy.type === 'boss'); game._damageEnemy(boss, 10000);
  assert.equal(game.phase, 'won');
  game.reset(); assert.equal(game.map.id, 'foundry'); assert.equal(game.completedRelays, 0);
  assert.ok(game.relays.every(relay => relay.status === 'idle' && relay.reactorId === null));
});

test('a foundry reactor waits for population space without losing its objective', () => {
  const game = new Game({ mapId: 'foundry', random: () => .5 }); game.start();
  for (let index = 0; index < 55; index += 1) game.spawnEnemy('crawler', { x: 2900, y: 2200 });
  const relay = game.relays[0]; at(game, relay); game.interact();
  assert.equal(relay.reactorId, null); assert.equal(relay.status, 'charging');
  game.enemies[0].hp = 0; game._updateRelays(.01);
  assert.ok(game.enemies.some(enemy => enemy.id === relay.reactorId && enemy.objectiveRelayId === relay.id));
});

test('frost convoy waits outside its circle, follows clear routes and unlocks segments in order', () => {
  const game = new Game({ mapId: 'frost', random: () => .5 }); game.start(); game.spawnTimer = Infinity;
  const initial = game.relays.map(relay => ({ x: relay.x, y: relay.y }));
  assert.deepEqual(game.relays.map(relay => relay.status), ['idle', 'locked', 'locked']);
  for (const relay of game.relays) for (let index = 1; index < relay.waypoints.length; index += 1) {
    const start = relay.waypoints[index - 1], end = relay.waypoints[index];
    assert.ok(game.obstacles.every(rock => game._segmentHit(start.x, start.y, end.x - start.x, end.y - start.y, rock, 165) === null));
  }
  at(game, game.relays[1]); game.interact(); assert.equal(game.relays[1].status, 'locked');
  for (const [index, relay] of game.relays.entries()) {
    at(game, relay); assert.equal(game.interact(), true); assert.equal(game.escort, relay);
    game.player.x = 50; game.player.y = 50; game._updateRelays(1);
    assert.equal(relay.progress, 0);
    assert.deepEqual({ x: relay.x, y: relay.y }, initial[index]);
    for (let step = 0; step < 500 && relay.status === 'charging'; step += 1) { at(game, relay); game._updateRelays(.1); }
    assert.equal(relay.status, 'active'); assert.equal(relay.progress, 1); assert.equal(game.escort, null);
    assert.deepEqual({ x: relay.x, y: relay.y }, relay.waypoints.at(-1));
    if (index < 2) assert.equal(game.relays[index + 1].status, 'idle');
  }
  assert.equal(game.completedRelays, 3); assert.equal(game.bossSpawned, true);
  game._damageEnemy(game.enemies.find(enemy => enemy.type === 'boss'), 10000); assert.equal(game.phase, 'won');
  game.reset(); assert.equal(game.map.id, 'frost'); assert.equal(game.escort, null);
  assert.deepEqual(game.relays.map(relay => ({ x: relay.x, y: relay.y })), initial);
  assert.deepEqual(game.relays.map(relay => relay.status), ['idle', 'locked', 'locked']);
});

test('every map has a normal loss state and freezes goals after death', () => {
  for (const map of MAPS) {
    const game = new Game({ mapId: map.id }); game.start();
    const relay = game.relays[0]; at(game, relay); game.interact();
    game._damagePlayer(1000); assert.equal(game.phase, 'lost');
    const before = { elapsed: game.elapsed, x: relay.x, y: relay.y, progress: relay.progress };
    game.update(.2, { shoot: true, moveX: 1 });
    assert.deepEqual({ elapsed: game.elapsed, x: relay.x, y: relay.y, progress: relay.progress }, before);
    assert.equal(game.interact(), false);
  }
});

function fireSpecial(game, weapon, angle = 0) {
  game.switchWeapon(weapon); game.fireTimer = 0; game.player.angle = angle; game._shoot();
  return game.bullets.at(-1);
}

test('grenades explode once on enemies and damage nearby enemies without double direct damage', () => {
  const game = arena();
  const direct = game.spawnEnemy('crawler', { x: 1180, y: 1000 });
  const near = game.spawnEnemy('crawler', { x: 1180, y: 1090 });
  const far = game.spawnEnemy('crawler', { x: 1180, y: 1250 });
  for (const enemy of [direct, near, far]) { enemy.hp = enemy.maxHp = 1000; enemy.stunTimer = 10; }
  const grenade = fireSpecial(game, 3); advance(game, .5);
  assert.equal(grenade.kind, 'grenade'); assert.equal(grenade.exploded, true);
  assert.equal(direct.hp, 922); assert.equal(near.hp, 922); assert.equal(far.hp, 1000);
  game._burstGrenade(grenade); assert.equal(direct.hp, 922);
  assert.equal(game.drainEvents().filter(event => event.type === 'grenade-burst').length, 1);
  assert.equal(game.player.ammo, WEAPONS[3].magSize - 1);
});

test('grenades detonate against cover or at fuse expiry even without an enemy impact', () => {
  for (const cover of [false, true]) {
    const game = arena();
    if (cover) game.obstacles.push({ x: 1200, y: 1000, radius: 25 });
    const grenade = fireSpecial(game, 3); advance(game, 1.3);
    const events = game.drainEvents().filter(event => event.type === 'grenade-burst');
    assert.equal(events.length, 1); assert.equal(grenade.exploded, true); assert.equal(game.bullets.length, 0);
    assert.ok(cover ? events[0].x < 1220 : events[0].x > 1500);
  }
});

test('boomerang crosses an enemy at most once per leg and returns to the player', () => {
  const game = arena(), enemy = game.spawnEnemy('crawler', { x: 1200, y: 1000 });
  enemy.hp = enemy.maxHp = 1000; enemy.stunTimer = 10;
  const blade = fireSpecial(game, 4); advance(game, 1.3);
  assert.equal(blade.kind, 'boomerang'); assert.equal(blade.returning, true);
  assert.equal(enemy.hp, 916); assert.equal(game.bullets.length, 0);
  assert.equal(game.drainEvents().filter(event => event.type === 'hit' && event.enemyId === enemy.id).length, 2);
});

test('boomerang return direction tracks player movement and solid cover blocks the blade', () => {
  const game = arena(); const blade = fireSpecial(game, 4); advance(game, .5);
  game.player.y = 1250; advance(game, .05);
  assert.equal(blade.returning, true); assert.ok(blade.vy > 0); assert.ok(blade.vx < 0);
  advance(game, 1); assert.equal(game.bullets.length, 0);
  const covered = arena(); covered.obstacles.push({ x: 1100, y: 1000, radius: 30 });
  const enemy = covered.spawnEnemy('crawler', { x: 1240, y: 1000 }); enemy.stunTimer = 10;
  fireSpecial(covered, 4); advance(covered, 1.3);
  assert.equal(enemy.hp, enemy.maxHp); assert.equal(covered.bullets.length, 0);
});

test('new weapon upgrades change explosion radius and return damage and work with precision reload', () => {
  for (const [weapon, upgrade] of [[3, 'blast-radius'], [4, 'return-edge']]) {
    const game = arena(); game.switchWeapon(weapon); game.player.xp = game.player.xpNeeded; game._levelUp();
    assert.ok(game.upgradeChoices.some(choice => choice.id === upgrade));
    game.chooseUpgrade(upgrade);
    const enemy = game.spawnEnemy('crawler', { x: 1200, y: 1000 }); enemy.hp = enemy.maxHp = 1000; enemy.stunTimer = 10;
    const shot = fireSpecial(game, weapon); advance(game, 1.3);
    if (weapon === 3) assert.equal(shot.blastRadius, 202.5);
    else assert.ok(Math.abs(enemy.hp - (1000 - 42 - 42 * 1.6)) < 1e-9);
    game.reload(); advance(game, WEAPONS[weapon].reloadTime * .6); assert.equal(game.reload(), true);
    assert.equal(game.player.ammo, WEAPONS[weapon].magSize); assert.equal(game.player.overcharged, true);
  }
});

test('new objectives summon defenders before the original frontier arrival window ends', () => {
  for (const mapId of ['foundry', 'frost']) {
    const game = new Game({ mapId, random: () => .5 }); game.start();
    at(game, game.relays[0]); game.interact(); game.elapsed = 6; game.relaySpawnTimer = 0;
    game._updateRelays(.01);
    assert.ok(game.enemies.some(enemy => enemy.type !== 'reactor'));
  }
});

test('grenade victory stops remaining blast damage and paused fuses do not advance', () => {
  const game = arena(); const grenade = fireSpecial(game, 3);
  game.phase = 'upgrade'; const timer = grenade.lifetime; game.update(.2);
  assert.equal(grenade.lifetime, timer); assert.equal(grenade.exploded, undefined);
  game.phase = 'playing';
  const boss = game.spawnEnemy('boss', { x: grenade.x, y: grenade.y }); boss.hp = 1;
  const other = game.spawnEnemy('crawler', { x: grenade.x + 70, y: grenade.y });
  game._burstGrenade(grenade);
  assert.equal(game.phase, 'won'); assert.equal(other.hp, other.maxHp);
  assert.equal(game.kills, 1);
});

test('lane hazards use capsule width and end caps, including rotated boundary cases', () => {
  const game = arena();
  const horizontal = { type: 'lane', x: 900, y: 1000, angle: 0, length: 200, radius: 32 };
  for (const [x, y, hit] of [[1000, 1048, true], [1000, 1048.01, false], [852, 1000, true], [851.99, 1000, false], [1148, 1000, true], [1148.01, 1000, false]]) {
    assert.equal(game._hazardHits(horizontal, { x, y, radius: 16 }), hit);
  }
  const vertical = { ...horizontal, x: 1000, y: 900, angle: Math.PI / 2 };
  assert.equal(game._hazardHits(vertical, { x: 1048, y: 1000, radius: 16 }), true);
  assert.equal(game._hazardHits(vertical, { x: 1048.01, y: 1000, radius: 16 }), false);
});

test('ring hazards leave the inner circle safe and collide with inner and outer body edges', () => {
  const game = arena(), ring = { type: 'ring', x: 1000, y: 1000, radius: 215, innerRadius: 125 };
  for (const [gap, hit] of [[0, false], [108.99, false], [109, true], [180, true], [231, true], [231.01, false]]) {
    assert.equal(game._hazardHits(ring, { x: 1000 + gap, y: 1000, radius: 16 }), hit);
  }
});

test('hazard shapes settle once after their warning and obey armor and invulnerability', () => {
  for (const type of ['lane', 'ring']) {
    const game = arena(); game.player.resistance = .25;
    game._addHazard(type, type === 'lane' ? 900 : 850, 1000, type === 'lane' ? 32 : 215, 1.5, 20, { angle: 0, length: 200, innerRadius: 100, color: '#8fdcff' });
    const hazard = game.hazards[0]; game._updateHazards(1.4); assert.equal(game.player.hp, 120);
    game._updateHazards(.2); assert.equal(game.player.hp, 105); assert.equal(hazard.resolved, true);
    game._updateHazards(3); assert.equal(game.player.hp, 105);
    const event = game.drainEvents().find(item => item.type === 'hazard-burst'); assert.equal(event.hazardType, type);
    game._addHazard(type, type === 'lane' ? 900 : 850, 1000, type === 'lane' ? 32 : 215, .01, 20, { angle: 0, length: 200, innerRadius: 100 });
    game._updateHazards(.02); assert.equal(game.player.hp, 105);
  }
});

test('ice slowing lasts two seconds, normal movement recovers and dash keeps full speed', () => {
  const game = arena();
  game._addHazard('blast', 1000, 1000, 95, .01, 10, { effect: 'slow' }); game._updateHazards(.02);
  assert.equal(game.player.slowTimer, 2);
  advance(game, 1, { moveX: 1 }); assert.ok(Math.abs(game.player.x - 1000 - game.player.speed * .6) < .001);
  advance(game, 1.1); assert.equal(game.player.slowTimer, 0);
  const start = game.player.x; advance(game, .5, { moveX: 1 }); assert.ok(Math.abs(game.player.x - start - game.player.speed * .5) < .001);
  const slowed = arena(), normal = arena(); slowed.player.slowTimer = 2;
  slowed.dash({ x: 1, y: 0 }); normal.dash({ x: 1, y: 0 }); advance(slowed, .15); advance(normal, .15);
  assert.ok(Math.abs(slowed.player.x - normal.player.x) < .001);
  const immune = arena(); immune.player.invulnerable = 1;
  immune._addHazard('blast', 1000, 1000, 95, .01, 10, { effect: 'slow' }); immune._updateHazards(.02);
  assert.equal(immune.player.slowTimer, 0); assert.equal(immune.player.hp, 120);
});

test('map threats warn clearly and repeat at their specified sector interval', () => {
  // Delivery warnings are tied to carrying cargo and have separate 4.0 tests.
  for (const map of MAPS.filter(map => map.mode !== 'delivery')) {
    const game = new Game({ mapId: map.id, random: () => .5 }); game.start();
    at(game, game.relays[0]); game.interact();
    game._updateSectorThreat(map.id === 'storm' ? 2.4 : 5.9); assert.equal(game.sectorThreat.count, 0);
    game._updateSectorThreat(.11); assert.equal(game.sectorThreat.count, 1);
    const hazard = game.hazards.find(item => item.owner === 'environment');
    assert.ok(hazard.duration >= 1.3); assert.equal(hazard.name, map.threat.name); assert.ok(hazard.hint);
    assert.equal(hazard.type, map.id === 'foundry' ? 'lane' : 'blast');
    assert.equal(hazard.effect, map.id === 'frost' ? 'slow' : undefined);
    assert.ok(game._hazardHits(hazard, game.player));
    game._updateHazards(2); game._updateSectorThreat(game.sectorThreat.interval - .1); assert.equal(game.sectorThreat.count, 1);
    game._updateSectorThreat(.11); assert.equal(game.sectorThreat.count, 2);
    assert.equal(game.drainEvents().filter(event => event.type === 'sector-warning').length, 2);
  }
});

test('environment threats wait for a clear warning window and stop on objective completion or boss arrival', () => {
  const game = arena(); const relay = game.relays[0]; at(game, relay); game.interact();
  game.sectorThreat.timer = 0; game._addHazard('blast', game.player.x + 300, game.player.y, 80, 1.5, 10);
  game._updateSectorThreat(.1); assert.equal(game.sectorThreat.count, 0);
  game.hazards = []; game._updateSectorThreat(1); assert.equal(game.sectorThreat.count, 1);
  game._completeRelay(relay); assert.equal(game.hazards.length, 0); assert.equal(game.sectorThreat.active, false);
  at(game, game.relays[1]); game.interact(); game.breathingTimer = 0; game.sectorThreat.timer = 0;
  game._updateSectorThreat(.1); assert.ok(game.hazards.some(hazard => hazard.owner === 'environment'));
  game._spawnBoss(); assert.equal(game.hazards.some(hazard => hazard.owner === 'environment'), false);
  const count = game.sectorThreat.count; game._updateSectorThreat(100); assert.equal(game.sectorThreat.count, count);
  assert.equal(game.sectorThreat.active, false);
});

test('environment blasts can hurt normal enemies but never damage bosses or objective reactors', () => {
  const game = arena(); game.player.invulnerable = 2;
  const crawler = game.spawnEnemy('crawler', { x: 1040, y: 1000 }); crawler.hp = crawler.maxHp = 100;
  const boss = game.spawnEnemy('boss', { x: 1050, y: 1000 });
  const reactor = game.spawnEnemy('reactor', { x: 1060, y: 1000 });
  game._addHazard('blast', 1000, 1000, 105, .01, 12, { owner: 'environment', enemyDamage: 60 });
  game._updateHazards(.02);
  assert.equal(crawler.hp, 40); assert.equal(boss.hp, boss.maxHp); assert.equal(reactor.hp, reactor.maxHp);
  game._updateHazards(1); assert.equal(crawler.hp, 40);
});

test('killing or removing a hazard source cancels its warning without damage or burst', () => {
  const game = arena();
  const source = game.spawnEnemy('mortar', { x: 1300, y: 1000 });
  game._addHazard('lane', 900, 1000, 32, 1.5, 20, { sourceId: source.id, angle: 0, length: 200 });
  game._damageEnemy(source, 1000); assert.equal(game.hazards.length, 0);
  game._updateHazards(2); assert.equal(game.player.hp, game.player.maxHp);
  const removed = game.spawnEnemy('mortar', { x: 1300, y: 1000 });
  game._addHazard('ring', 850, 1000, 215, 1.5, 20, { sourceId: removed.id, innerRadius: 100 });
  game.enemies = game.enemies.filter(enemy => enemy.id !== removed.id); game._updateHazards(2);
  assert.equal(game.hazards.length, 0); assert.equal(game.drainEvents().filter(event => event.type === 'hazard-burst').length, 0);
});

test('slow state, warnings and threat timers freeze with decisions and reset cleanly on every map', () => {
  for (const map of MAPS.filter(map => map.mode !== 'delivery')) {
    const game = new Game({ mapId: map.id }); game.start(); at(game, game.relays[0]); game.interact();
    game.sectorThreat.timer = 0; game._updateSectorThreat(.01); game.player.slowTimer = 2;
    const before = { timer: game.sectorThreat.timer, warning: game.hazards[0].remaining };
    for (const phase of ['upgrade', 'relic', 'paused']) {
      game.phase = phase; game.update(.2);
      assert.equal(game.player.slowTimer, 2); assert.equal(game.sectorThreat.timer, before.timer); assert.equal(game.hazards[0].remaining, before.warning);
    }
    game.phase = 'playing'; game._damagePlayer(1000);
    assert.equal(game.phase, 'lost'); assert.equal(game.hazards.length, 0); assert.equal(game.player.slowTimer, 0); assert.equal(game.sectorThreat.active, false);
    game.reset(); assert.equal(game.player.slowTimer, 0); assert.equal(game.sectorThreat.timer, 6); assert.equal(game.sectorThreat.count, 0); assert.equal(game.hazards.length, 0);
  }
});

test('all map bosses expose three distinct attacks with the matching warning shapes', () => {
  const patterns = { frontier: ['blast', 'ring', 'charge'], foundry: ['heat-cross', 'fan', 'charge'], frost: ['ice-ring', 'ice-hunt', 'charge'], storm: ['storm-call', 'storm-cross', 'fan'] };
  for (const map of MAPS.filter(map => map.mode !== 'delivery')) for (let index = 0; index < 3; index += 1) {
    const game = new Game({ mapId: map.id, random: () => .5 }); game.start(); game.obstacles = [];
    game.player.x = 1000; game.player.y = 1000;
    const boss = game.spawnEnemy('boss', { x: 1240, y: 1000 }); boss.attackTimer = 0; boss.attackCount = index;
    game._updateBoss(boss, .01, -1, 0, 240);
    assert.equal(boss.variant, map.id); assert.equal(boss.name, map.boss.name); assert.equal(boss.color, map.boss.color);
    assert.equal(boss.attackKind, patterns[map.id][index]); assert.ok(boss.attackName); assert.ok(boss.attackHint);
    if (map.id !== 'frontier') assert.ok(boss.windup >= 1.3);
    if (map.id === 'foundry' && index === 0) { assert.equal(game.hazards.length, 2); assert.ok(game.hazards.every(hazard => hazard.type === 'lane')); }
    if (map.id === 'frost' && index === 0) { assert.equal(game.hazards[0].type, 'ring'); assert.ok(game.hazards[0].innerRadius > boss.radius + game.player.radius * 2); }
    if (map.id === 'frost' && index === 1) { assert.equal(game.hazards[0].effect, 'slow'); assert.equal(game.hazards[0].type, 'blast'); }
    assert.equal(game.drainEvents().filter(event => event.type === 'boss-attack').length, 1);
    const windup = boss.windup; game._updateBoss(boss, windup + .01, -1, 0, 240);
    if (index === 2 && map.id !== 'storm') assert.ok(boss.chargeTimer > 0);
    else { assert.ok(boss.recoveryTimer > 0); assert.equal(boss.attackName, ''); }
    if (map.id === 'foundry' && index === 1) assert.equal(game.bullets.length, 7);
    if (map.id === 'frontier' && index === 1) assert.equal(game.bullets.length, 14);
  }
});

test('boss phase changes cancel old warnings, retain variant attacks and complete every map', () => {
  for (const map of MAPS) {
    const game = new Game({ mapId: map.id, random: () => .5 }); game.start(); game.obstacles = [];
    game.player.x = 1000; game.player.y = 1000; game._spawnBoss();
    const boss = game.enemies.find(enemy => enemy.type === 'boss'); boss.attackTimer = 0;
    game._updateBoss(boss, .01, 1, 0, 200); assert.ok(game.hazards.length > 0);
    boss.hp = boss.maxHp * .49; game._updateBoss(boss, .01, 1, 0, 200);
    assert.equal(boss.stage, 2); assert.equal(game.hazards.some(hazard => hazard.sourceId === boss.id), false);
    assert.equal(boss.windup, 0); assert.equal(boss.attackName, ''); assert.ok(boss.recoveryTimer > 0);
    for (let attack = 0; attack < 3; attack += 1) {
      boss.attackCount = attack; boss.attackTimer = boss.recoveryTimer = boss.windup = boss.chargeTimer = 0;
      game._updateBoss(boss, .01, 1, 0, 200); assert.ok(boss.attackName); assert.ok(boss.windup > 0);
    }
    game.player.slowTimer = 2; game._damageEnemy(boss, 10000);
    assert.equal(game.phase, 'won'); assert.equal(game.hazards.length, 0); assert.equal(game.player.slowTimer, 0); assert.equal(game.sectorThreat.active, false);
  }
});
