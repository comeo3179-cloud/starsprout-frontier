'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, tilePosition } = require('../engine.js');

function gameWithRow(values, direction) {
  const game = new Game({ random: () => 0.999 });
  game.board = Array(16).fill(null);
  values.forEach((value, index) => {
    if (value) game.board[index] = { id: 100 + index, type: value[0], level: value[1] };
  });
  game.nextSeed = { type: 'bloom', level: 1 };
  game.move(direction || 'left');
  return game;
}

test('four equal plants form two pairs, preserving left-to-right merge order', () => {
  const game = gameWithRow(Array(4).fill(['sun', 1]));
  assert.deepEqual(game.board.slice(0, 4).map(tile => tile && tile.level), [2, 2, null, null]);
  assert.equal(game.movesLeft, 4);
  assert.equal(game.drainEvents().filter(event => event.type === 'merge').length, 2);
});

test('a freshly merged plant cannot merge again in the same move', () => {
  const game = gameWithRow([['sun', 1], ['sun', 1], ['sun', 2]]);
  assert.deepEqual(game.board.slice(0, 4).map(tile => tile && tile.level), [2, 2, null, null]);
});

test('right, up, and down use the correct leading edge', () => {
  const right = gameWithRow([['sun', 1], ['sun', 1], ['sun', 2]], 'right');
  assert.equal(right.board[3].level, 2);
  assert.equal(right.board[2].level, 2);
  for (const [direction, target] of [['up', 0], ['down', 12]]) {
    const game = new Game({ random: () => 0.9 });
    game.board = Array(16).fill(null);
    game.board[4] = { id: 100, type: 'frost', level: 2 };
    game.board[8] = { id: 101, type: 'frost', level: 2 };
    assert.equal(game.move(direction), true);
    assert.equal(game.board[target].level, 3);
  }
});

test('different species and maximum-level plants do not merge', () => {
  const game = gameWithRow([['sun', 1], ['frost', 1], ['bloom', 5], ['bloom', 5]]);
  assert.equal(game.movesLeft, 5);
  assert.deepEqual(game.board.slice(0, 4).map(tile => tile.level), [1, 1, 5, 5]);
  assert.deepEqual(game.drainEvents(), []);
});

test('invalid moves cost nothing and generate no seed', () => {
  const game = gameWithRow([['sun', 1]]);
  assert.equal(game.movesLeft, 5);
  assert.equal(game.board.filter(Boolean).length, 1);
  assert.equal(game.move('diagonal'), false);
  game.movesLeft = 0;
  assert.equal(game.move('right'), false);
});

test('a move generates the previewed seed and a new preview', () => {
  const game = gameWithRow([null, ['sun', 1]]);
  assert.deepEqual({ type: game.board[15].type, level: game.board[15].level }, { type: 'bloom', level: 1 });
  assert.equal(game.board.filter(Boolean).length, 2);
});

test('combat is separate from building and pauses outside the wave', () => {
  const game = new Game();
  game.update(2);
  assert.equal(game.waveElapsed, 0);
  assert.equal(game.pulse(), false);
  assert.equal(game.startWave(), true);
  assert.equal(game.startWave(), false);
  assert.equal(game.move('left'), false);
  game.update(0.1);
  assert.ok(game.waveElapsed > 0);
  assert.equal(game.spawnRemaining, 12);
  assert.equal(game.enemies.length, 1);
});

test('wave finishes only after spawning is complete and all enemies are gone', () => {
  const game = new Game();
  game.startWave();
  game._spawnTimer = 999;
  game.update(0.1);
  assert.equal(game.phase, 'wave');
  game.spawnRemaining = 0;
  game.update(0.1);
  assert.equal(game.phase, 'upgrade');
  assert.equal(game.wave, 1);
  assert.equal(game.upgradeChoices.length, 3);
});

test('upgrade can be applied once, then a fresh build starts', () => {
  const game = new Game();
  game.startWave();
  game.spawnRemaining = 0;
  game.update(0.1);
  assert.equal(game.chooseUpgrade('unknown'), false);
  assert.equal(game.chooseUpgrade('power'), true);
  assert.equal(game.chooseUpgrade('power'), false);
  assert.equal(game.upgrades.power, 1);
  assert.equal(game.phase, 'build');
  assert.equal(game.wave, 2);
  assert.equal(game.movesLeft, 5);
});

test('pulse damages, pushes outward and cannot be reused during cooldown', () => {
  const game = new Game();
  game.startWave();
  game._spawnTimer = 999;
  game.board = Array(16).fill(null);
  game.enemies = [{ id: 500, type: 'tank', x: 200, y: 0, hp: 100, maxHp: 100, speed: 0, radius: 12, coreDamage: 10, slowTimer: 0, alive: true }];
  assert.equal(game.pulse(), true);
  assert.equal(game.enemies[0].hp, 75);
  assert.equal(game.enemies[0].x, 252);
  assert.equal(game.pulse(), false);
  game.update(11);
  assert.equal(game.pulse(), false);
  game.update(1.01);
  assert.equal(game.pulse(), true);
});

test('core death loses the game and final wave cleanup wins', () => {
  const lost = new Game();
  lost.startWave();
  lost.health = 5;
  lost.enemies.push({ id: 500, type: 'crawler', x: 10, y: 0, hp: 100, maxHp: 100, speed: 30, coreDamage: 7, alive: true });
  lost.update(0.1);
  assert.equal(lost.phase, 'lost');
  assert.equal(lost.health, 0);
  assert.equal(lost.startWave(), false);
  const won = new Game();
  won.wave = 6;
  won.startWave();
  won.spawnRemaining = 0;
  won.update(0.1);
  assert.equal(won.phase, 'won');
  assert.ok(won.drainEvents().some(event => event.type === 'win'));
});

test('frost slows its target and bloom hits nearby enemies', () => {
  for (const type of ['frost', 'bloom']) {
    const game = new Game();
    game.board = Array(16).fill(null);
    game.board[5] = { id: 100, type, level: 1 };
    game.startWave();
    game._spawnTimer = 999;
    game.enemies = [150, 155].map((x, i) => ({ id: 200 + i, type: 'tank', x, y: 0, hp: 100, maxHp: 100, speed: 0, radius: 12, coreDamage: 10, slowTimer: 0, alive: true }));
    game.update(0.1);
    assert.ok(game.enemies[0].hp < 100);
    if (type === 'frost') assert.ok(game.enemies[0].slowTimer > 0);
    else assert.ok(game.enemies[1].hp < 100);
  }
});

test('reset restores the complete initial state', () => {
  const game = new Game({ random: () => 0.2 });
  game.move('left');
  game.startWave();
  game.update(5);
  game.upgrades.power = 4;
  game.health = 12;
  game.reset();
  assert.equal(game.phase, 'build');
  assert.equal(game.health, 100);
  assert.equal(game.maxHealth, 100);
  assert.equal(game.wave, 1);
  assert.equal(game.movesLeft, 5);
  assert.equal(game.score, 0);
  assert.equal(game.kills, 0);
  assert.equal(game.pulseCooldown, 0);
  assert.deepEqual(game.upgrades, { power: 0, haste: 0, vitality: 0 });
  assert.equal(game.board.filter(Boolean).length, 4);
  assert.equal(game.enemies.length, 0);
  assert.deepEqual(game.drainEvents(), []);
  assert.deepEqual(tilePosition(0), { x: -96, y: -96 });
});

test('vitality expands and restores core health without exceeding the new maximum', () => {
  const game = new Game();
  game.startWave();
  game.spawnRemaining = 0;
  game.update(0.1);
  game.health = 90;
  assert.equal(game.chooseUpgrade('vitality'), true);
  assert.equal(game.maxHealth, 115);
  assert.equal(game.health, 115);
});

test('a seeded full run completes six real waves, spawns the boss and wins once', () => {
  let seed = 1;
  const random = () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const game = new Game({ random });
  let bossSeen = false;
  let wins = 0;
  for (let wave = 1; wave <= 6; wave++) {
    assert.equal(game.wave, wave);
    for (let attempts = 0; game.movesLeft > 0 && attempts < 50; attempts++) {
      game.move(['up', 'down', 'left', 'right'][Math.floor(random() * 4)]);
    }
    game.startWave();
    for (let frame = 0; game.phase === 'wave' && frame < 1000; frame++) {
      game.update(0.1);
      if (game.enemies.length >= 3 && game.pulseCooldown === 0) game.pulse();
      for (const event of game.drainEvents()) {
        if (event.type === 'enemy-spawn' && event.enemyType === 'boss') bossSeen = true;
        if (event.type === 'win') wins++;
      }
    }
    if (wave < 6) {
      assert.equal(game.phase, 'upgrade');
      game.chooseUpgrade(game.health < 70 ? 'vitality' : wave % 2 ? 'power' : 'haste');
    }
  }
  assert.equal(game.phase, 'won');
  assert.equal(bossSeen, true);
  assert.equal(wins, 1);
  assert.ok(game.kills > 100);
  game.update(10);
  assert.deepEqual(game.drainEvents(), []);
});
