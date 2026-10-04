'use strict';

// Reachability with original player stats and legal inputs. This bot reads
// public target positions; its results are not estimates of human win rates.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { CampaignExplorer, seededRandom } = require('./check-campaign-runs.cjs');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2), option = (key, fallback) => args.includes('--' + key) ? args[args.indexOf('--' + key) + 1] : fallback;
const enginePath = path.resolve(option('engine', path.join(root, 'action-engine.js'))), { Game } = require(enginePath);
const output = path.resolve(option('output', path.join(root, 'reports/ruins-runs-source-4.0.0.json')));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), round = value => +value.toFixed(2);

class RuinsExplorer extends CampaignExplorer {
  constructor(settings) { super(null, settings); this.settings = settings; }
  route(game) {
    if (game.map.id !== 'ruins' || game.bossSpawned) return super.route(game);
    const target = game.deliveryTarget();
    if (!target) return game.player;
    if (distance(game.player, target) < 78) game.interact();
    return game.deliveryTarget() || target;
  }
  chooseUpgrade(game) {
    if (this.settings.starline) {
      const choice = game.upgradeChoices.find(item => item.id === 'star-bridge') || game.upgradeChoices.find(item => item.id === 'star-capacitor');
      if (choice) return game.chooseUpgrade(choice.id);
    }
    return super.chooseUpgrade(game);
  }
  input(game) {
    if (this.settings.starline && game.map.id === 'ruins') { game.switchWeapon(5); this.lastSwitch = game.elapsed; }
    return super.input(game);
  }
}

function simulate(settings) {
  const game = new Game({ mode: 'campaign', mapId: 'ruins', doctrineId: settings.doctrineId, seed: settings.seed, random: seededRandom(settings.seed) });
  const bot = new RuinsExplorer({ ...settings, reaction: .25, aimError: .10 });
  const result = { ...settings, initial: { hp: game.player.hp, maxHp: game.player.maxHp, speed: game.player.speed, damage: game.player.damageMultiplier }, maps: ['ruins'], events: {}, deliveries: [], milestones: [], bossAttacks: {}, upgrades: [], invalid: null, peaks: { pins: 0, lines: 0 } };
  let held = null, nextDecision = 0;
  game.start();
  for (let frame = 0; frame < 900 * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'upgrade') { assert.equal(bot.chooseUpgrade(game), true); continue; }
    if (game.phase === 'relic') { assert.equal(game.chooseRelic(game.relicChoices[0].id), true); continue; }
    if (game.phase === 'tactic') { assert.equal(game.chooseTactic(game.tacticChoices[0].id), true); continue; }
    if (game.phase === 'campaign-rest') {
      const route = game.campaign.routeChoices.find(item => item.mapId === settings.secondMap) || game.campaign.routeChoices[0];
      assert.equal(game.chooseCampaignRoute(route.mapId, game.player.hp < game.player.maxHp * .7 ? 'repair' : 'power', game.campaign.stage === 1 ? settings.awakeningId : undefined), true);
      result.maps.push(game.map.id); held = null; continue;
    }
    assert.equal(game.phase, 'playing');
    if (!held || game.elapsed >= nextDecision) { held = bot.input(game); nextDecision = game.elapsed + .25; }
    game.update(1 / 60, held);
    for (const event of game.drainEvents()) {
      result.events[event.type] = (result.events[event.type] || 0) + 1;
      if (event.type === 'upgrade') result.upgrades.push(event.upgrade);
      if (event.type === 'cargo-delivered') result.deliveries.push({ id: event.cargoId, at: round(game.elapsed), hp: round(game.player.hp) });
      if (event.type === 'boss-attack') result.bossAttacks[event.name] = (result.bossAttacks[event.name] || 0) + 1;
      if (['boss-spawn', 'campaign-rest', 'campaign-stage', 'win', 'lose'].includes(event.type)) result.milestones.push({ type: event.type, map: game.map.id, at: round(game.elapsed), hp: round(game.player.hp) });
    }
    result.peaks.pins = Math.max(result.peaks.pins, game.starPins.length); result.peaks.lines = Math.max(result.peaks.lines, game.starLines.length);
    const values = [game.player.x, game.player.y, game.player.hp, game.elapsed, ...game.starPins.flatMap(pin => [pin.x, pin.y, pin.remaining]), ...game.starLines.flatMap(line => [line.x, line.y, line.endX, line.endY, line.remaining])];
    if (!values.every(Number.isFinite) || game.player.hp < 0 || game.player.hp > game.player.maxHp || result.peaks.pins > 6 || result.peaks.lines > 3) { result.invalid = 'Finite state, health or bounded star field'; break; }
  }
  return { ...result, outcome: ['won', 'lost'].includes(game.phase) ? game.phase : 'timeout', seconds: round(game.elapsed), stage: game.campaign.stage, hp: round(game.player.hp), level: game.player.level, evolutionId: game.evolutionId, lastDamage: game.lastDamage };
}

const engineSha256 = crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex');
const settings = [
  { seed: 1, doctrineId: 'marksman', awakeningId: 'interrupt-round', secondMap: 'foundry', starline: false },
  { seed: 2, doctrineId: 'conductor', awakeningId: 'mobile-field', secondMap: 'storm', starline: false },
  { seed: 3, doctrineId: 'marksman', awakeningId: 'mag-relay', secondMap: 'frontier', starline: true },
  { seed: 4, doctrineId: 'skirmisher', awakeningId: 'slide-reload', secondMap: 'frost', starline: true }
];
const runs = settings.map(simulate);
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), enginePath, engineSha256, reaction: .25, aimErrorRadians: .10, limitations: ['Original stats and ordinary actions, no teleports, forced completions or result edits.', 'The bot reads public targets, aims accurately and picks upgrades immediately.', 'Fixed seeds and simulated time are not human win rate, device performance or session-length evidence.'], runs }, null, 2) + '\n');
console.log(JSON.stringify(runs.map(run => ({ seed: run.seed, starline: run.starline, outcome: run.outcome, deliveries: run.deliveries.length, stage: run.stage, seconds: run.seconds, pins: run.peaks.pins, lines: run.peaks.lines })), null, 2));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'), engineSha256, 'Engine changed during runs');
assert.ok(runs.every(run => !run.invalid && ['won', 'lost'].includes(run.outcome)), 'All attempts naturally reach a finite ending');
assert.ok(runs.some(run => run.outcome === 'won' && run.deliveries.length === 3 && run.maps.length === 3), 'The new route can naturally reach the campaign finale');
assert.ok(runs.some(run => run.starline && run.deliveries.length === 3 && run.events['starline-trigger']), 'The new weapon is usable in a real delivery run');
