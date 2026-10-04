'use strict';

// Original-stat reachability checks. The explorer uses ordinary player inputs
// and real choices; natural defeats remain in the report. This is not a human
// win-rate, device-performance or session-length estimate.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { CampaignExplorer } = require('./check-campaign-runs.cjs');
const root = path.resolve(__dirname, '..');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), round = value => +value.toFixed(3);

class VoyageExplorer extends CampaignExplorer {
  constructor(settings = {}) { super(settings.evolution || null, settings); this.room = null; }
  route(game) {
    if (this.room !== game.voyage.node) { this.target = null; this.room = game.voyage.node; }
    const objective = game.voyageTarget();
    if (objective?.kind === 'exit') {
      if (distance(game.player, objective) < 78) game.interact();
      return objective;
    }
    const boss = game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
    const closest = game.enemies.filter(enemy => enemy.hp > 0 && !['anchor', 'reactor', 'nest'].includes(enemy.type)).toSorted((a, b) => distance(a, game.player) - distance(b, game.player))[0];
    if (boss) {
      const angle = Math.atan2(game.player.y - boss.y, game.player.x - boss.x) + .32;
      return { x: boss.x + Math.cos(angle) * 300, y: boss.y + Math.sin(angle) * 300 };
    }
    if (objective && !game.enemies.some(enemy => enemy.hp > 0 && distance(enemy, game.player) < 260)) return objective;
    if (closest) {
      const angle = Math.atan2(game.player.y - closest.y, game.player.x - closest.x) + .35;
      return { x: closest.x + Math.cos(angle) * 240, y: closest.y + Math.sin(angle) * 240 };
    }
    return objective || { x: game.world.width * .5, y: game.world.height * .5 };
  }
  input(game) {
    const input = super.input(game);
    if (this.settings.deviceId === 'afterimage' && game.enemies.some(enemy => enemy.hp > 0 && distance(enemy, game.player) < 180)) game.dash({ x: input.moveX, y: input.moveY });
    if (game.voyageActionState().collapseReady && game.player.skillCooldown > 0) game.useSkill();
    return input;
  }
}

function chooseRest(game, settings, result) {
  const v = game.voyage;
  const buy = game.player.hp < game.player.maxHp - 28 ? 'repair' : game.upgradeStacks.damage < 3 || !game.upgradeStacks.damage ? 'damage' : 'health';
  if (game.purchaseVoyage(buy)) result.purchases.push({ node: v.node, id: buy, hp: round(game.player.hp), credits: game.player.credits });
  const partner = { afterimage: 'needles', mirror: 'sentry', well: 'battery' }[settings.deviceId];
  const chosen = v.deviceChoices.find(item => item.id === partner && !v.devices.includes(partner)) || v.deviceChoices.find(item => !v.devices.includes(item.id));
  const slot = v.devices.indexOf(null);
  const equipped = chosen && slot >= 0 ? chosen.id : null;
  const route = v.routeChoices.find(item => item.risk === settings.risk) || v.routeChoices[0];
  assert.ok(route, 'The real rest has a route');
  assert.equal(game.chooseVoyageRoute(route.id, equipped, equipped ? slot : null), true, 'The real rest transaction is accepted once');
  result.choices.push({ node: game.voyage.node, route: structuredClone(route), equipped, slot: equipped ? slot : null, devices: [...game.voyage.devices] });
}

function simulate(Game, settings) {
  const game = new Game({ mode: 'voyage', seed: settings.seed, difficulty: settings.difficulty, deviceId: settings.deviceId });
  assert.equal(game.mode, 'voyage');
  const bot = new VoyageExplorer({ ...settings, reaction: .25, aimError: .1 });
  const result = { ...settings, initial: { hp: game.player.hp, maxHp: game.player.maxHp, speed: game.player.speed, damageMultiplier: game.player.damageMultiplier },
    milestones: [], events: {}, choices: [], purchases: [], upgrades: [], roomTypes: [], devices: [], bossAttacks: {}, damage: 0, minHp: game.player.hp,
    peaks: { enemies: 0, bullets: 0, hazards: 0, pins: 0, lines: 0 }, invalid: null };
  let held = null, nextDecision = 0, lastNode = 0;
  game.start();
  for (let frame = 0; frame < 1200 * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'upgrade') { assert.equal(bot.chooseUpgrade(game), true); continue; }
    if (game.phase === 'voyage-rest') { chooseRest(game, settings, result); held = null; continue; }
    assert.equal(game.phase, 'playing');
    if (lastNode !== game.voyage.node) { result.roomTypes.push({ node: game.voyage.node, type: game.voyage.room.type, risk: game.voyage.room.risk, quota: game.voyage.room.quota }); lastNode = game.voyage.node; held = null; }
    if (!held || game.elapsed >= nextDecision) { held = settings.idle ? {} : bot.input(game); nextDecision = game.elapsed + .25; }
    game.update(1 / 60, held);
    for (const event of game.drainEvents()) {
      result.events[event.type] = (result.events[event.type] || 0) + 1;
      if (event.type === 'upgrade') result.upgrades.push(event.upgrade);
      if (event.type === 'damage') result.damage += event.amount;
      if (event.type === 'boss-attack') result.bossAttacks[event.name] = (result.bossAttacks[event.name] || 0) + 1;
      if (['voyage-room', 'voyage-objective', 'voyage-rest', 'voyage-device', 'voyage-resonance', 'voyage-boss-phase', 'voyage-complete', 'win', 'lose'].includes(event.type)) result.milestones.push({ type: event.type, node: game.voyage.node, at: round(game.elapsed), hp: round(game.player.hp), deviceId: event.deviceId, resonanceId: event.resonanceId, phase: event.phase });
    }
    result.minHp = Math.min(result.minHp, game.player.hp);
    for (const [name, field] of [['enemies', 'enemies'], ['bullets', 'bullets'], ['hazards', 'hazards'], ['pins', 'starPins'], ['lines', 'starLines']]) result.peaks[name] = Math.max(result.peaks[name], game[field].length);
    const values = [game.player.x, game.player.y, game.player.hp, game.elapsed, ...game.bullets.flatMap(bullet => [bullet.x, bullet.y, bullet.vx, bullet.vy])];
    if (!values.every(Number.isFinite) || game.player.hp < 0 || game.player.hp > game.player.maxHp || game.player.x < 0 || game.player.y < 0 || game.player.x > game.world.width || game.player.y > game.world.height || game.voyage.node < 1 || game.voyage.node > 7 || new Set(game.voyage.devices.filter(Boolean)).size !== game.voyage.devices.filter(Boolean).length) { result.invalid = 'Finite positions, HP bounds, node bounds or unique devices'; break; }
  }
  return { ...result, outcome: ['won', 'lost'].includes(game.phase) ? game.phase : result.invalid ? 'invalid' : 'timeout', seconds: round(game.elapsed), node: game.voyage.node,
    hp: round(game.player.hp), minHp: round(result.minHp), damage: round(result.damage), level: game.player.level, kills: game.kills,
    evolutionId: game.evolutionId, devices: [...game.voyage.devices], history: structuredClone(game.voyage.history), lastDamage: game.lastDamage };
}

if (require.main === module) {
  const args = process.argv.slice(2), option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
  const enginePath = path.resolve(option('engine', path.join(root, 'action-engine.js'))), { Game } = require(enginePath);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const output = path.resolve(option('output', path.join(root, 'reports/voyage-runs-source-' + version + '.json')));
  const settings = [
    { seed: 731, deviceId: 'afterimage', difficulty: 'normal', risk: 'calm', evolution: { id: 'piercer-mirror', prerequisite: 'shatter', weapon: 2 } },
    { seed: 2, deviceId: 'mirror', difficulty: 'normal', risk: 'calm', evolution: { id: 'assault-chain', prerequisite: 'arc', weapon: 0 } },
    { seed: 3, deviceId: 'well', difficulty: 'normal', risk: 'calm', evolution: { id: 'grenade-echo', prerequisite: 'blast-radius', weapon: 3 } },
    { seed: 4, deviceId: 'afterimage', difficulty: 'overload', risk: 'surge', evolution: { id: 'boomerang-twin', prerequisite: 'return-edge', weapon: 4 } },
    { seed: 5, deviceId: 'mirror', difficulty: 'normal', risk: 'calm', idle: true }
  ].filter(item => (!option('device', '') || item.deviceId === option('device', '')) && (!args.includes('--normal-only') || item.difficulty === 'normal' && !item.idle));
  assert.ok(settings.length);
  const engineSha256 = crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex');
  const report = { generatedAt: new Date().toISOString(), enginePath, engineSha256, botSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), reactionSeconds: .25, aimErrorRadians: .1,
    method: '60 Hz simulation with original player stats and ordinary inputs/real upgrades, purchases, devices and routes. No teleports, HP/damage edits, enemy injection, quota edits or forced objective completion. Bot reads visible enemy/target/hazard geometry and chooses upgrades immediately. Fixed seeds are reachability checks, not human win rate or real-device certification.', runs: [] };
  for (const item of settings) {
    const result = simulate(Game, item); report.runs.push(result); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ device: item.deviceId, difficulty: item.difficulty, seed: item.seed, idle: !!item.idle, outcome: result.outcome, node: result.node, seconds: result.seconds, hp: result.hp, devices: result.devices, roomTypes: result.roomTypes.map(room => room.type), bossAttacks: result.bossAttacks }));
  }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'), engineSha256, 'Engine changed during these attempts');
  assert.ok(report.runs.every(run => !run.invalid && ['won', 'lost'].includes(run.outcome)), 'Every attempt reaches a finite natural outcome');
  assert.ok(report.runs.some(run => run.outcome === 'won' && run.node === 7 && run.history.length === 7), 'A real seven-node run is reachable');
  if (report.runs.some(run => run.idle)) assert.ok(report.runs.filter(run => run.idle).every(run => run.outcome === 'lost' && run.node === 1), 'Idle cannot skip the first finite room');
}

module.exports = { VoyageExplorer, simulate };
