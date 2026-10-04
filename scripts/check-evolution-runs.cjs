'use strict';

// Normal-stat integration runs. The bot uses only movement, aiming, firing,
// reload, dash, EMP, overdrive, interaction and the actual upgrade choices.
// This checks reachable builds and lifecycle, not human difficulty or win rate.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const enginePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'action-engine.js');
const { Game, EVOLUTIONS } = require(enginePath);
const botPath = path.join(__dirname, 'simulate-expedition.js');
const context = { require: createRequire(botPath), __dirname, module: { exports: {} }, process: { argv: ['node', botPath, '--build', 'reactor', '--engine', enginePath] } };
vm.runInNewContext(fs.readFileSync(botPath, 'utf8').split('function simulate(seed) {')[0] + '\nmodule.exports = { Explorer, seededRandom };', context, { filename: botPath });
const { Explorer, seededRandom } = context.module.exports;

class EvolutionExplorer extends Explorer {
  constructor(evolution) { super(); this.evolution = evolution; }
  chooseUpgrade(game) {
    const wanted = game.upgradeChoices.find(item => item.id === this.evolution.id) || game.upgradeChoices.find(item => item.id === this.evolution.prerequisite);
    if (wanted) return game.chooseUpgrade(wanted.id);
    // Declining a different evolution keeps this run's planned build available.
    const order = ['vampire', 'health', 'shield', 'damage', 'rapid', 'magnet', 'reload', 'crit', 'capacity', 'speed', 'dash', 'pulse'];
    const rank = item => item.evolution ? 100 : order.includes(item.id) ? order.indexOf(item.id) : 50;
    return game.chooseUpgrade(game.upgradeChoices.toSorted((a, b) => rank(a) - rank(b))[0].id);
  }
  input(game) {
    game.switchWeapon(this.evolution.weapon);
    this.lastSwitch = game.elapsed;
    const input = super.input(game);
    if (this.evolution.weapon === 1 && game.evolutionId && game.enemies.some(enemy => enemy.hp > 0 && Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) < 420)) game.dash({ x: input.moveX, y: input.moveY });
    return input;
  }
}

const runs = EVOLUTIONS.map((evolution, index) => {
  const mapId = ['frontier', 'foundry', 'frost'][index % 3], seed = 731;
  const game = new Game({ mapId, random: seededRandom(seed) }), bot = new EvolutionExplorer(evolution);
  const result = { evolution: evolution.id, mapId, seed, acquiredAt: null, acquiredLevel: null, triggers: {}, upgrades: [], peaks: { bullets: 0, echoes: 0 }, invalid: null };
  game.start();
  for (let frame = 0; frame < 600 * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'upgrade') { bot.chooseUpgrade(game); continue; }
    assert.equal(game.phase, 'playing', 'Unexpected blocked phase');
    game.update(1 / 60, bot.input(game));
    for (const event of game.drainEvents()) {
      if (event.type === 'upgrade') result.upgrades.push(event.upgrade);
      if (event.type === 'weapon-evolved') { result.acquiredAt = +game.elapsed.toFixed(2); result.acquiredLevel = game.player.level; }
      if (event.type === 'evolution-trigger' || event.type === 'arc' && event.evolutionId) {
        const key = event.stage || 'chain'; result.triggers[key] = (result.triggers[key] || 0) + 1;
      }
    }
    result.peaks.bullets = Math.max(result.peaks.bullets, game.bullets.length);
    result.peaks.echoes = Math.max(result.peaks.echoes, game.evolutionState.echoes.length);
    if (![game.player.x, game.player.y, game.player.hp, game.elapsed, ...game.bullets.flatMap(b => [b.x, b.y, b.vx, b.vy, b.damage])].every(Number.isFinite)) { result.invalid = 'Non-finite player or projectile state'; break; }
  }
  Object.assign(result, { outcome: game.phase, seconds: +game.elapsed.toFixed(2), hp: +game.player.hp.toFixed(2), level: game.player.level, objectives: game.completedRelays, kills: game.kills, endEchoes: game.evolutionState.echoes.length });
  console.log(JSON.stringify(result)); return result;
});
const report = { generatedAt: new Date().toISOString(), engine: path.relative(root, enginePath), engineSha256: crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'),
  method: 'Five planned weapon builds; original game stats and actual upgrade cards; public actions at 60 Hz. Existing Explorer routing and precise aim exceed typical human knowledge.',
  limits: 'Five fixed-seed integration cases are not estimates of human difficulty, mobile performance or statistical build balance. Natural defeats remain visible.', runs };
fs.writeFileSync(path.join(root, 'reports/evolution-runs-2.9.0.json'), JSON.stringify(report, null, 2) + '\n');
assert.ok(runs.every(run => run.acquiredAt !== null && run.acquiredLevel >= 4 && ['won', 'lost'].includes(run.outcome) && !run.invalid && run.endEchoes === 0), 'Every build must be naturally acquired, finish without invalid state, and clear pending effects');
