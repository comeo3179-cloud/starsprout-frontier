'use strict';

// Public-action integration runs: no teleport, spawned test enemies, HP/damage
// edits, or forced objectives. This bot reads the visible lightning warnings.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const enginePath = path.resolve(option('engine', path.join(root, 'action-engine.js')));
const { Game } = require(enginePath), botPath = path.join(__dirname, 'simulate-expedition.js');
const context = { require: createRequire(botPath), __dirname, module: { exports: {} }, process: { argv: ['node', botPath, '--engine', enginePath, '--build', 'reactor'] }, performance };
vm.runInNewContext(fs.readFileSync(botPath, 'utf8').split('function simulate(seed) {')[0] + '\nmodule.exports = { Explorer, seededRandom };', context, { filename: botPath });
const { Explorer, seededRandom } = context.module.exports;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), round = n => +n.toFixed(2);

class StormExplorer extends Explorer {
  route(game) {
    const relay = game.relays.find(item => item.status === 'charging'), player = game.player;
    if (relay) {
      const warning = game.hazards.find(h => h.conductionRelayId === relay.id && h.remaining > 0);
      if (warning) {
        // A locked strike stays fixed. Step to the opposite side of the tower,
        // then return after impact; all movement still goes through collisions.
        let dx = relay.x - warning.x, dy = relay.y - warning.y;
        const length = Math.hypot(dx, dy);
        if (length < 12) { dx = Math.cos(game.elapsed); dy = Math.sin(game.elapsed); }
        else { dx /= length; dy /= length; }
        return { x: relay.x + dx * 130, y: relay.y + dy * 130 };
      }
      return { x: relay.x, y: relay.y };
    }
    const boss = game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
    if (boss) {
      const warning = game.hazards.find(h => h.backlashId === boss.id && h.remaining > 0);
      if (warning && distance(player, warning) < warning.radius + player.radius + 25) {
        const angle = Math.atan2(player.y - warning.y, player.x - warning.x);
        return { x: warning.x + Math.cos(angle) * (warning.radius + 90), y: warning.y + Math.sin(angle) * (warning.radius + 90) };
      }
      if (!warning && boss.attackCount % 3 === 0) {
        // The next visible attack cycle is the lock-on call. Bait it near the
        // boss, then use the ordinary retreat above once the warning appears.
        const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
        return { x: boss.x + Math.cos(angle) * 130, y: boss.y + Math.sin(angle) * 130 };
      }
    }
    return super.route(game);
  }
}

function simulate(seed) {
  const game = new Game({ mapId: 'storm', random: seededRandom(seed) }), bot = new StormExplorer();
  if (game.map.id !== 'storm') throw new Error('storm map is not in the selected engine');
  const result = { seed, outcome: '', relays: 0, seconds: 0, hp: 0, damage: 0, chargeEvents: 0, missedStrikes: 0, bossReached: false, bossAttacks: {}, backlash: 0, milestones: [], phaseFailures: [], invalid: null };
  const start = { hp: game.player.hp, maxHp: game.player.maxHp, damageMultiplier: game.player.damageMultiplier, speed: game.player.speed };
  game.start();
  for (let frame = 0; frame < 600 * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'upgrade') bot.chooseUpgrade(game);
    if (game.phase !== 'playing') { result.phaseFailures.push(game.phase); break; }
    game.update(1 / 60, bot.input(game));
    for (const event of game.drainEvents()) {
      if (event.type === 'damage') result.damage += event.amount;
      if (event.type === 'conduction-charge') result.chargeEvents++;
      if (event.type === 'conduction-miss') result.missedStrikes++;
      if (event.type === 'boss-spawn') result.bossReached = true;
      if (event.type === 'boss-attack') result.bossAttacks[event.name] = (result.bossAttacks[event.name] || 0) + 1;
      if (/backlash/.test(event.type)) result.backlash++;
      if (['relay-start', 'conduction-charge', 'relay-complete', 'boss-spawn', 'boss-phase', 'win', 'lose'].includes(event.type)) result.milestones.push({ event: event.type, at: round(game.elapsed), hp: round(game.player.hp) });
    }
    if (![game.player.x, game.player.y, game.player.hp, game.elapsed].every(Number.isFinite) || game.player.hp < 0 || game.player.hp > game.player.maxHp) { result.invalid = 'player/time bounds'; break; }
  }
  Object.assign(result, { outcome: ['won', 'lost'].includes(game.phase) ? game.phase : result.invalid ? 'invalid' : 'timeout', relays: game.completedRelays, seconds: round(game.elapsed), hp: round(game.player.hp), damage: round(result.damage), initial: start });
  console.log(JSON.stringify({ seed, outcome: result.outcome, relays: result.relays, charges: result.chargeEvents, bossReached: result.bossReached, seconds: result.seconds, hp: result.hp }));
  return result;
}

const seeds = option('seeds', '1,2,3,731').split(',').map(Number);
if (!seeds.length || !seeds.every(Number.isInteger)) throw new Error('--seeds must be a comma-separated integer list');
const runs = seeds.map(simulate), report = {
  generatedAt: new Date().toISOString(), enginePath, engineHash: crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'),
  note: 'Original stats and normal player actions. The bot reads the map and visible warning geometry and aims exactly. These integration runs do not estimate human win rates; natural defeats are retained.',
  summary: { runs: runs.length, wins: runs.filter(r => r.outcome === 'won').length, losses: runs.filter(r => r.outcome === 'lost').length, bosses: runs.filter(r => r.bossReached).length, allRelays: runs.filter(r => r.relays === 3).length }, runs
};
const output = path.resolve(option('output', path.join(root, 'reports/storm-expedition-public.json')));
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
if (runs.some(r => !['won', 'lost'].includes(r.outcome) || r.invalid || r.phaseFailures.length) || !runs.some(r => r.relays === 3 && r.bossReached)) process.exitCode = 1;
