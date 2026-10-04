'use strict';

// Normal-stat integration soak. Reuse the existing public-action Explorer bot,
// adding only the route to earn one tactic and inputs that can activate it.
// No teleports, enemy injection, stat edits, or forced objective completion.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'action-engine.js');
const { Game, MAPS, TACTICS } = require(enginePath);
const botPath = path.join(__dirname, 'simulate-expedition.js');
const context = { require: createRequire(botPath), __dirname, module: { exports: {} }, process: { argv: [] }, performance };
vm.runInNewContext(fs.readFileSync(botPath, 'utf8').split('function simulate(seed) {')[0] + '\nmodule.exports = { Explorer, seededRandom };', context, { filename: botPath });
const { Explorer, seededRandom } = context.module.exports;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round = n => +n.toFixed(2);

class TacticExplorer extends Explorer {
  route(game) {
    if (game.tacticId || game.encounters[0].status === 'failed') return super.route(game);
    const encounter = game.encounters[0], target = game.encounterTarget(encounter);
    if (['idle', 'ready'].includes(encounter.status) && distance(game.player, encounter) < 75 && game.interactionState().target === encounter) game.interact();
    return target;
  }

  input(game) {
    const input = super.input(game), player = game.player;
    if (game.tacticId === 'decoy-dash' && game.tactical.cooldown === 0 && game.enemies.some(enemy => enemy.hp > 0 && distance(enemy, player) < 280)) game.dash({ x: input.moveX, y: input.moveY });
    if (game.tacticId === 'gravity-pulse' && game.enemies.some(enemy => enemy.hp > 0 && !['boss', 'nest', 'reactor'].includes(enemy.type) && enemy.windup <= 0 && enemy.chargeTimer <= 0 && distance(enemy, player) > 90 && distance(enemy, player) < player.skillRadius)) game.useSkill();
    // Press reload again in the same visible precision meter used by humans.
    if (game.tacticId === 'reload-mine' && player.reloadTimer > 0 && !player.reloadAttempted && player.reloadProgress >= .6 && player.reloadProgress <= .7) game.reload();
    return input;
  }
}

function simulate(mapId, tacticId, seed) {
  const game = new Game({ mapId, random: seededRandom(seed) }), bot = new TacticExplorer();
  const result = { map: mapId, tacticId, seed, outcome: '', acquiredAt: null, hpAfterReward: null, damage: 0, bossReached: false, relays: 0, triggers: {}, milestones: [], phaseFailures: [], invalid: null };
  game.start();
  for (let frame = 0; frame < 600 * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'upgrade') bot.chooseUpgrade(game);
    if (game.phase === 'tactic') {
      if (!game.chooseTactic(tacticId)) result.phaseFailures.push('valid tactic choice rejected');
      result.acquiredAt = round(game.elapsed); result.hpAfterReward = round(game.player.hp);
    }
    if (game.phase !== 'playing') { result.phaseFailures.push(game.phase); break; }
    const input = bot.input(game);
    game.update(1 / 60, input);
    for (const event of game.drainEvents()) {
      if (event.type === 'damage') result.damage += event.amount;
      if (event.type === 'tactic-trigger') {
        const key = event.stage || event.tacticId;
        result.triggers[key] = (result.triggers[key] || 0) + 1;
      }
      if (event.type === 'boss-spawn') result.bossReached = true;
      if (['encounter-start', 'encounter-ready', 'encounter-reward', 'tactic-equipped', 'relay-start', 'relay-complete', 'boss-spawn', 'win', 'lose'].includes(event.type)) result.milestones.push({ event: event.type, at: round(game.elapsed), hp: round(game.player.hp) });
    }
    if (!Number.isFinite(game.player.x + game.player.y + game.player.hp + game.elapsed) || game.player.hp < 0 || game.player.hp > game.player.maxHp) { result.invalid = 'player/time bounds'; break; }
  }
  result.outcome = ['won', 'lost'].includes(game.phase) ? game.phase : result.invalid ? 'invalid' : 'timeout';
  result.seconds = round(game.elapsed); result.hp = round(game.player.hp); result.damage = round(result.damage); result.relays = game.completedRelays;
  result.tacticalClearedAtEnd = game.tactical.decoy === null && game.tactical.mine === null && game.tactical.cooldown === 0;
  result.encounterStatus = game.encounters[0].status;
  console.log(JSON.stringify(result));
  return result;
}

const runs = MAPS.flatMap(map => TACTICS.map(tactic => simulate(map.id, tactic.id, 731)));
const report = {
  generatedAt: new Date().toISOString(),
  engineHash: crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'),
  bot: 'Existing Explorer public movement/combat, opening race route, optional decoy dash, precision reload, and EMP when a mobile target is visibly in range.',
  limitations: ['Original game stats and finite normal play only; no state or map mutations.', 'Exact aim and map visibility exceed normal human knowledge; these are integration runs, not estimates of human difficulty.', 'One fixed seed per map/module is causal feature coverage, not a balanced win-rate study.', 'A natural loss remains a valid recorded outcome; a timeout, invalid state, unacquired module, or zero module activation is a verification failure.'],
  summary: { runs: runs.length, wins: runs.filter(run => run.outcome === 'won').length, losses: runs.filter(run => run.outcome === 'lost').length, bossesReached: runs.filter(run => run.bossReached).length },
  runs
};
fs.writeFileSync(path.join(root, 'reports', 'encounter-expedition-public.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
if (runs.some(run => !['won', 'lost'].includes(run.outcome) || run.phaseFailures.length || run.acquiredAt === null || !Object.values(run.triggers).some(Boolean) || !run.tacticalClearedAtEnd)) process.exitCode = 1;
