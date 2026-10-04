'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Game, MAPS, TRIAL_WAVES } = require('../action-engine.js');
const projectRoot = process.env.FRONTIER_TEST_ROOT || path.join(__dirname, '..');
const enginePath = path.join(projectRoot, 'action-engine.js');
const engineHash = crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex');
let publicResults, idleResult;

test.after(() => {
  if (!process.env.TRIAL_REPORT_PATH || !publicResults || !idleResult) return;
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'), engineHash, 'Engine changed during the trial simulation');
  fs.writeFileSync(process.env.TRIAL_REPORT_PATH, JSON.stringify({
    version: '2.6.0', generatedAt: new Date().toISOString(), sourceEngineSha256: engineHash,
    command: '$env:TRIAL_REPORT_PATH = "reports/trial-balance-2.6.0.json"; node --test tests/trials.test.js',
    method: 'Public-action Explorer with arena orbit routing at 60 Hz. Fixed reward paths, no player health, damage, or objective overrides. Seeds select layouts and encounters, not complete combat replay.',
    limitations: 'Synthetic skilled bot is not a human playtest or mobile-device measurement. Low damage exposure cannot establish reward win-rate balance.',
    results: publicResults, idle: idleResult
  }, null, 2) + '\n');
});

function trial(seed = 1) { const game = new Game({ mode: 'trial', seed, random: () => .5 }); game.start(); game.drainEvents(); return game; }
function advance(game, seconds) { for (let time = 0; time < seconds - 1e-9; time += 1 / 60) game.update(Math.min(1 / 60, seconds - time)); }
function clearWave(game) {
  for (let frame = 0; frame < 60 * 90 && game.phase === 'playing'; frame++) {
    game.update(1 / 60);
    for (const enemy of game.enemies) if (enemy.hp > 0) game._damageEnemy(enemy, enemy.hp * 2);
  }
}

test('trial seeds determine independent layouts and finite encounters without changing standard maps', () => {
  const first = new Game({ mode: 'trial', seed: 123, random: () => .1 });
  const second = new Game({ mode: 'trial', seed: 123, random: () => .9 });
  assert.deepEqual(first.world, { width: 1800, height: 1400 });
  assert.equal(first.phase, 'ready'); assert.equal(first.map.id, 'trial');
  assert.deepEqual(first.obstacles, second.obstacles); assert.deepEqual(first.trial, second.trial);
  assert.notDeepEqual(first.obstacles, new Game({ mode: 'trial', seed: 124 }).obstacles);
  assert.equal(first.trial.plans.length, 6);
  assert.ok(first.trial.plans.every(plan => plan.length > 0 && plan.length <= 16));
  assert.deepEqual(first.trial.plans[5], ['boss']);
  assert.ok(first.obstacles.every(rock => Math.hypot(rock.x - first.player.x, rock.y - first.player.y) > rock.radius + 160));
  assert.ok(first.trial.portals.every(point => point.x > 70 && point.y > 70 && point.x < 1730 && point.y < 1330));
  assert.equal(first.relays.length + first.contracts.length + first.stations.length + first.crates.length, 0);
  for (const map of MAPS) {
    first.reset(map.id);
    assert.equal(first.mode, 'expedition'); assert.equal(first.trial, null); assert.equal(first.map.id, map.id);
    assert.deepEqual(first.world, { width: 3200, height: 2400 });
    assert.equal(first.relays.length, 3); assert.equal(first.crates.length, 16); assert.equal(first.contracts.length, 3);
  }
});

test('each wave announces before combat and spawns only its finite quota from clear distant portals', () => {
  const game = trial(); game.player.invulnerable = 1000;
  advance(game, 2.9); assert.equal(game.enemies.length, 0); assert.equal(game.trial.status, 'warning');
  advance(game, .2); assert.equal(game.enemies.length, 1); assert.equal(game.trial.status, 'combat');
  const enemy = game.enemies[0]; assert.ok(Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) > 320);
  assert.ok(game.obstacles.every(rock => Math.hypot(enemy.x - rock.x, enemy.y - rock.y) >= enemy.radius + rock.radius));
  advance(game, 70);
  assert.equal(game.trial.spawned, TRIAL_WAVES[0].enemies.length);
  assert.equal(game.enemies.length, game.trial.quota); assert.equal(game.trial.remaining, game.trial.quota);
  assert.equal(game.drainEvents().filter(event => event.type === 'trial-wave').length, 1);
});

test('clear-wave rest pauses the entire game, removes danger and applies exactly one chosen reward', () => {
  const game = trial(); clearWave(game);
  assert.equal(game.phase, 'trial-reward'); assert.equal(game.trial.completedWaves, 1);
  assert.equal(game.trial.status, 'reward'); assert.equal(game.trial.choices.length, 3);
  assert.equal(game.bullets.length + game.hazards.length + game.echoBursts.length, 0);
  const elapsed = game.elapsed, hp = game.player.hp, cooldown = game.player.skillCooldown;
  game.update(10, { moveX: 1, shoot: true });
  assert.equal(game.elapsed, elapsed); assert.equal(game.player.hp, hp); assert.equal(game.player.skillCooldown, cooldown);
  assert.equal(game.dash(), false); assert.equal(game.useSkill(), false); assert.equal(game.chooseTrialReward('invalid'), false);
  const damage = game.player.damageMultiplier;
  assert.equal(game.chooseTrialReward('power'), true);
  assert.equal(game.player.damageMultiplier, damage + .12); assert.equal(game.trial.wave, 2);
  assert.equal(game.trial.countdown, 3); assert.equal(game.chooseTrialReward('power'), false);
  assert.deepEqual(game.trial.rewards, ['power']);
});

test('rest preserves earned experience and queued upgrades before the next countdown', () => {
  const game = trial(); clearWave(game);
  const xp = game.player.xp; assert.ok(xp >= 40);
  const oldMaxHp = game.player.maxHp; game.player.hp = 20;
  assert.equal(game.chooseTrialReward('patch'), true);
  assert.equal(game.player.maxHp, oldMaxHp + 12); assert.equal(game.player.hp, 60);
  assert.equal(game.phase, 'upgrade'); assert.equal(game.trial.wave, 2);
  const countdown = game.trial.countdown; game.update(.1); assert.equal(game.trial.countdown, countdown);
  while (game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id);
  assert.equal(game.phase, 'playing'); assert.equal(game.trial.status, 'warning');
  assert.ok(game.player.level > 1);
});

test('six-wave progression has five rests, a seeded boss, and no post-victory rewards or damage', () => {
  const game = trial(7); const completed = [], spawned = [];
  for (let wave = 1; wave <= 6; wave++) {
    if (wave === 6) {
      advance(game, 3.1);
      const boss = game.enemies.find(enemy => enemy.type === 'boss');
      assert.ok(boss); assert.equal(boss.variant, game.trial.bossMapId); assert.equal(boss.maxHp, 2400);
    }
    clearWave(game);
    for (const event of game.drainEvents()) {
      if (event.type === 'trial-complete') completed.push(event.wave);
      if (event.type === 'trial-wave') spawned.push(event.wave);
    }
    if (wave < 6) { assert.equal(game.phase, 'trial-reward'); assert.equal(game.chooseTrialReward('mobility'), true); while (game.phase === 'upgrade') game.chooseUpgrade(game.upgradeChoices[0].id); }
  }
  assert.deepEqual(completed, [1, 2, 3, 4, 5, 6]); assert.deepEqual(spawned, [1, 2, 3, 4, 5, 6]);
  assert.equal(game.phase, 'won'); assert.equal(game.trial.status, 'complete'); assert.equal(game.trial.remaining, 0);
  assert.equal(game.trial.rewards.length, 5); assert.equal(game.chooseTrialReward('patch'), false);
  const score = game.score, elapsed = game.elapsed; game.update(.25, { shoot: true });
  assert.equal(game.score, score); assert.equal(game.elapsed, elapsed);
});

test('a temporarily blocked boss spawn retains its quota and retries successfully', () => {
  const game = trial(7);
  game._beginTrialWave(6);
  const originalPortals = game.trial.portals;
  game.trial.portals = originalPortals.map(() => ({ x: game.player.x, y: game.player.y }));
  advance(game, 3.1);
  assert.equal(game.bossSpawned, false); assert.equal(game.trial.spawned, 0);
  assert.equal(game.trial.remaining, 1); assert.equal(game.enemies.length, 0);
  assert.equal(game.drainEvents().some(event => event.type === 'boss-spawn'), false);
  game.trial.portals = originalPortals;
  advance(game, 1.1);
  assert.equal(game.bossSpawned, true); assert.equal(game.trial.spawned, 1);
  assert.equal(game.trial.remaining, 1); assert.equal(game.enemies.filter(enemy => enemy.type === 'boss').length, 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'boss-spawn').length, 1);
});

// Reuse the public-action explorer used by existing expedition simulations.
const simulator = fs.readFileSync(path.join(projectRoot, 'scripts/simulate-expedition.js'), 'utf8');
const botCode = simulator.slice(simulator.indexOf('function seededRandom('), simulator.indexOf('\nfunction simulate('));
const botApi = vm.runInNewContext(botCode + '\n({ Explorer, seededRandom })', { options: { mode: 'explore', build: 'reactor' }, distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) });

function playTrial(seed, idle = false, rewardPath = 'adaptive') {
  const game = new Game({ mode: 'trial', seed, random: botApi.seededRandom(seed + 2000) });
  const bot = new botApi.Explorer();
  bot.route = () => {
    const enemy = game.enemies.filter(enemy => enemy.hp > 0).sort((a, b) => Math.hypot(a.x - game.player.x, a.y - game.player.y) - Math.hypot(b.x - game.player.x, b.y - game.player.y))[0];
    if (!enemy) return { x: 900, y: 700 };
    const angle = Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x) + .35, radius = enemy.type === 'boss' ? 310 : 245;
    return { x: Math.max(90, Math.min(1710, enemy.x + Math.cos(angle) * radius)), y: Math.max(90, Math.min(1310, enemy.y + Math.sin(angle) * radius)) };
  };
  const waves = [], states = [], rests = [], damage = { hits: 0, lost: 0 };
  game.start();
  for (let frames = 0; frames < 60 * 600 && !['won', 'lost'].includes(game.phase); frames++) {
    if (game.phase === 'trial-reward') {
      const reward = rewardPath === 'adaptive' ? game.player.hp < game.player.maxHp * .6 ? 'patch' : 'power' : rewardPath;
      rests.push({ wave: game.trial.wave, hp: Math.round(game.player.hp), maxHp: game.player.maxHp, reward });
      game.chooseTrialReward(reward);
    }
    if (game.phase === 'upgrade') bot.chooseUpgrade(game);
    game.update(1 / 60, idle ? {} : bot.input(game));
    for (const event of game.drainEvents()) {
      if (event.type === 'trial-wave') waves.push(event.wave);
      if (event.type === 'damage') { damage.hits++; damage.lost += event.amount; }
    }
    assert.ok(Number.isFinite(game.player.hp + game.player.x + game.player.y));
    if (frames % 600 === 0) states.push({ seconds: Math.round(game.elapsed), wave: game.trial.wave, hp: Math.round(game.player.hp) });
  }
  return { seed, rewardPath, outcome: game.phase, seconds: Math.round(game.elapsed * 10) / 10, boss: game.trial.bossMapId, hp: game.player.hp, maxHp: game.player.maxHp, waves, damage, rests, states };
}

test('public-action bot completes all six waves without health, damage or objective overrides', () => {
  const results = ['patch', 'power', 'mobility'].flatMap(rewardPath => [1, 2, 7].map(seed => playTrial(seed, false, rewardPath)));
  publicResults = results;
  console.log('TRIAL_PUBLIC_ACTION_RESULTS ' + JSON.stringify(results.map(({ seed, rewardPath, outcome, seconds, boss }) => ({ seed, rewardPath, outcome, seconds, boss }))));
  for (const result of results) {
    assert.equal(result.outcome, 'won', JSON.stringify(result));
    assert.deepEqual(result.waves, [1, 2, 3, 4, 5, 6]);
    assert.ok(result.seconds < 360);
  }
});

test('doing nothing loses a real trial and cannot progress its finite first wave', () => {
  const result = playTrial(7, true);
  idleResult = result;
  assert.equal(result.outcome, 'lost'); assert.deepEqual(result.waves, [1]); assert.ok(result.damage.hits > 0); assert.equal(result.hp, 0);
  console.log('TRIAL_IDLE_RESULT ' + JSON.stringify({ seed: result.seed, outcome: result.outcome, seconds: result.seconds, damage: result.damage }));
});
