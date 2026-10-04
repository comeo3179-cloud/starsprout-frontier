// Controlled CPU comparison, not a browser FPS or win-rate test.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ref = process.argv[2] || 'HEAD';
const sources = {
  baseline: execFileSync('git', ['show', `${ref}:action-engine.js`], { cwd: root, encoding: 'utf8' }),
  candidate: fs.readFileSync(path.join(root, 'action-engine.js'), 'utf8')
};
const engines = Object.fromEntries(Object.entries(sources).map(([name, source]) => {
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  return [name, module.exports];
}));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function measure(engine, count, shoot) {
  let seed = 42;
  const game = new engine.Game({ random: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) });
  game.start();
  game.player.hp = game.player.maxHp = 1e9;
  game.player.x = 1600; game.player.y = 1200;
  game.spawnTimer = game.relaySpawnTimer = game.threatTimer = Infinity;
  for (let i = 0; i < count; i++) {
    const enemy = game.spawnEnemy('crawler', { x: 1600 + Math.cos(i) * 300, y: 1200 + Math.sin(i) * 300 });
    enemy.hp = enemy.maxHp = 1e9;
  }
  const input = { moveX: .8, moveY: .4, aimX: 1800, aimY: 1100, shoot };
  for (let i = 0; i < 900; i++) { game.update(1 / 60, input); game.drainEvents(); }
  const elapsed = game.elapsed, steps = 3000;
  const started = performance.now();
  for (let i = 0; i < steps; i++) { game.update(1 / 60, input); game.drainEvents(); }
  const perStepUs = (performance.now() - started) * 1000 / steps;
  assert.equal(game.phase, 'playing');
  assert.equal(game.enemies.length, count);
  assert.ok(Math.abs(game.elapsed - elapsed - steps / 60) < 1e-7);
  for (const entity of [game.player, ...game.enemies, ...game.bullets]) {
    assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y));
  }
  return perStepUs;
}
const result = { node: process.version, baseline: ref, rounds: 6, warmupSteps: 900, measuredSteps: 3000, scenarios: [] };
for (const [count, shoot] of [[15, false], [55, false], [55, true]]) {
  const samples = { baseline: [], candidate: [] };
  for (let round = 0; round < result.rounds; round++) {
    for (const name of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) samples[name].push(measure(engines[name], count, shoot));
  }
  const beforeUs = median(samples.baseline), afterUs = median(samples.candidate);
  result.scenarios.push({ enemies: count, shoot, beforeUs, afterUs, speedup: beforeUs / afterUs, samples });
}
console.log(JSON.stringify(result, null, 2));
