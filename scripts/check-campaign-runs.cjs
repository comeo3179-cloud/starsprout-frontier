'use strict';

// Original-stat integration runs. Only ordinary player actions and the actual
// menu choices advance a run. The bot has precise aim and reads visible hazard
// geometry, so these are reachability checks, not estimates of human win rates.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const simulator = fs.readFileSync(path.join(__dirname, 'simulate-expedition.js'), 'utf8');
const botCode = simulator.slice(simulator.indexOf('function seededRandom('), simulator.indexOf('\nfunction simulate('));
const { Explorer, seededRandom } = vm.runInNewContext(botCode + '\n({ Explorer, seededRandom })', { options: { mode: 'explore', build: 'reactor' }, distance });
const round = value => +value.toFixed(2);

class CampaignExplorer extends Explorer {
  constructor(evolution, settings = {}) { super(); this.lastStage = 0; this.evolution = evolution; this.settings = settings; }
  chooseUpgrade(game) {
    if (this.evolution) {
      const planned = game.upgradeChoices.find(choice => choice.id === this.evolution.id) || game.upgradeChoices.find(choice => choice.id === this.evolution.prerequisite);
      if (planned) return game.chooseUpgrade(planned.id);
    }
    const order = game.player.hp < game.player.maxHp * .6
      ? ['health', 'shield', 'vampire', 'damage', 'rapid', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash']
      : ['vampire', 'damage', 'rapid', 'health', 'shield', 'magnet', 'pulse', 'reload', 'crit', 'capacity', 'speed', 'dash'];
    const featured = this.evolution ? null : game.upgradeChoices.find(choice => choice.evolution);
    const rank = choice => order.includes(choice.id) ? order.indexOf(choice.id) : 50;
    const choice = featured || game.upgradeChoices.toSorted((a, b) => rank(a) - rank(b))[0];
    return choice && game.chooseUpgrade(choice.id);
  }
  route(game) {
    if (this.lastStage !== game.campaign.stage) { this.target = null; this.lastStage = game.campaign.stage; }
    const player = game.player, relay = game.relays.find(item => item.status === 'charging');
    if (relay && game.map.mode === 'conduction') {
      const warning = game.hazards.find(hazard => hazard.conductionRelayId === relay.id && hazard.remaining > 0);
      if (warning) {
        let dx = relay.x - warning.x, dy = relay.y - warning.y;
        const length = Math.hypot(dx, dy);
        if (length < 12) { dx = Math.cos(game.elapsed); dy = Math.sin(game.elapsed); }
        else { dx /= length; dy /= length; }
        return { x: relay.x + dx * 130, y: relay.y + dy * 130 };
      }
      return relay;
    }
    const boss = game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
    if (boss?.variant === 'storm') {
      const warning = game.hazards.find(hazard => hazard.backlashId === boss.id && hazard.remaining > 0);
      if (warning && distance(player, warning) < warning.radius + player.radius + 25) {
        const angle = Math.atan2(player.y - warning.y, player.x - warning.x);
        return { x: warning.x + Math.cos(angle) * (warning.radius + 90), y: warning.y + Math.sin(angle) * (warning.radius + 90) };
      }
      if (!warning && boss.attackCount % 3 === 0) {
        const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
        return { x: boss.x + Math.cos(angle) * 130, y: boss.y + Math.sin(angle) * 130 };
      }
    }
    return super.route(game);
  }
  input(game) {
    if (this.evolution) {
      game.switchWeapon(game.map.id === 'nexus' && this.settings.nexusStrategy ? 0 : this.evolution.weapon); this.lastSwitch = game.elapsed;
    }
    const input = super.input(game);
    if (this.evolution?.weapon === 1 && game.evolutionId && game.enemies.some(enemy => enemy.hp > 0 && distance(enemy, game.player) < 440)) game.dash({ x: input.moveX, y: input.moveY });
    if (game.map.id === 'nexus' && this.settings.nexusStrategy) {
      const target = this.settings.nexusStrategy === 'anchors' && game.enemies.find(enemy => enemy.type === 'anchor' && enemy.hp > 0) || game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
      if (target) { input.aimX = target.x; input.aimY = target.y; input.shoot = distance(target, game.player) < 760; }
      if (this.settings.nexusStrategy === 'boss' && target) {
        const dx = target.x - game.player.x, dy = target.y - game.player.y, length = Math.hypot(dx, dy);
        // Hold fire while a visible anchor blocks the rifle line. No entity
        // is edited or made invulnerable to force the chosen strategy.
        if (game.enemies.some(enemy => {
          if (enemy.type !== 'anchor' || enemy.hp <= 0) return false;
          const along = ((enemy.x - game.player.x) * dx + (enemy.y - game.player.y) * dy) / Math.max(1, length);
          const gap = Math.hypot(game.player.x + dx / length * along - enemy.x, game.player.y + dy / length * along - enemy.y);
          return along > 0 && along < length && gap < enemy.radius + 85;
        })) input.shoot = false;
      }
    }
    if (this.settings.aimError) {
      const dx = input.aimX - game.player.x, dy = input.aimY - game.player.y;
      const angle = Math.atan2(dy, dx) + Math.sin(game.elapsed * 2.13 + this.settings.seed) * this.settings.aimError;
      const length = Math.hypot(dx, dy);
      input.aimX = game.player.x + Math.cos(angle) * length; input.aimY = game.player.y + Math.sin(angle) * length;
    }
    return input;
  }
}

function simulate(Game, settings) {
  const game = new Game({ mode: 'campaign', mapId: settings.mapId, doctrineId: settings.doctrineId, seed: settings.seed, random: seededRandom(settings.seed) });
  assert.equal(game.mode, 'campaign', 'Campaign is present in the selected engine');
  const bot = new CampaignExplorer(settings.evolution, settings);
  const result = { ...settings, initial: { hp: game.player.hp, maxHp: game.player.maxHp, damage: game.player.damageMultiplier, speed: game.player.speed }, maps: [game.map.id], rests: [], milestones: [], upgrades: [], evolutions: [], evolutionTriggers: {}, anchorsBroken: 0, shieldsBroken: 0, finaleStarted: null, shieldBrokenAt: null, damage: 0, attacks: {}, invalid: null };
  let heldInput = null, nextDecision = 0;
  game.start();
  for (let frame = 0; frame < (settings.seconds || 1500) * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'campaign-rest') {
      const choices = game.campaign.routeChoices;
      const selected = choices.find(choice => (choice.mapId || choice.id) === settings.secondMap) || choices[0];
      const mapId = selected.mapId || selected.id;
      const supplyId = game.player.hp < game.player.maxHp * .7 ? 'repair' : settings.supply || 'power';
      const awakeningId = game.campaign.stage === 1 ? settings.awakeningId || ({ skirmisher: 'slide-reload', marksman: 'interrupt-round', conductor: 'mobile-field' })[settings.doctrineId] : undefined;
      result.rests.push({ stage: game.campaign.stage, at: round(game.elapsed), hp: round(game.player.hp), level: game.player.level, evolutionId: game.evolutionId, mapId, crisisId: selected.crisisId, supplyId, awakeningId });
      assert.equal(game.chooseCampaignRoute(mapId, supplyId, awakeningId), true, 'Actual route/reward/awakening choice is accepted once');
      result.maps.push(game.map.id);
      heldInput = null;
    }
    if (game.phase === 'upgrade') { assert.equal(bot.chooseUpgrade(game), true); continue; }
    if (game.phase === 'tactic') { assert.equal(game.chooseTactic(game.tacticChoices[0].id), true); continue; }
    if (game.phase === 'relic') { assert.equal(game.chooseRelic(game.relicChoices[0].id), true); continue; }
    assert.equal(game.phase, 'playing', 'Unexpected blocked campaign phase');
    if (!heldInput || game.elapsed >= nextDecision) { heldInput = settings.idle ? {} : bot.input(game); nextDecision = game.elapsed + (settings.reaction || 0); }
    game.update(1 / 60, heldInput);
    for (const event of game.drainEvents()) {
      if (event.type === 'damage') result.damage += event.amount;
      if (event.type === 'upgrade') result.upgrades.push(event.upgrade);
      if (event.type === 'weapon-evolved') result.evolutions.push({ id: event.evolutionId, at: round(game.elapsed), stage: game.campaign.stage });
      if (event.type === 'evolution-trigger' || event.type === 'arc' && event.evolutionId) {
        const key = game.campaign.stage + ':' + (event.stage || 'chain'); result.evolutionTriggers[key] = (result.evolutionTriggers[key] || 0) + 1;
      }
      if (event.type === 'anchor-break') result.anchorsBroken++;
      if (event.type === 'nexus-shield-break') { result.shieldsBroken++; result.shieldBrokenAt = round(game.elapsed); }
      if (event.type === 'boss-spawn' && game.map.id === 'nexus') result.finaleStarted = round(game.elapsed);
      if (event.type === 'boss-attack') result.attacks[event.name] = (result.attacks[event.name] || 0) + 1;
      if (['relay-complete', 'boss-spawn', 'boss-phase', 'campaign-rest', 'campaign-stage', 'awakening-acquired', 'awakening-trigger', 'win', 'lose'].includes(event.type)) result.milestones.push({ event: event.type, stage: game.campaign.stage, map: game.map.id, at: round(game.elapsed), hp: round(game.player.hp), name: event.name, awakeningId: event.awakeningId, trigger: event.stage });
    }
    const numbers = [game.player.x, game.player.y, game.player.hp, game.elapsed, ...game.bullets.flatMap(bullet => [bullet.x, bullet.y, bullet.vx, bullet.vy, bullet.damage])];
    if (!numbers.every(Number.isFinite) || game.player.hp < 0 || game.player.hp > game.player.maxHp) { result.invalid = 'Non-finite state or HP bounds'; break; }
  }
  Object.assign(result, { outcome: ['won', 'lost'].includes(game.phase) ? game.phase : result.invalid ? 'invalid' : 'timeout', seconds: round(game.elapsed), stage: game.campaign.stage, hp: round(game.player.hp), level: game.player.level, kills: game.kills, damage: round(result.damage), endEchoes: game.evolutionState.echoes.length,
    finaleSeconds: result.finaleStarted === null ? null : round(game.elapsed - result.finaleStarted), awakeningId: game.campaign.awakeningId, lastDamage: game.lastDamage });
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2), option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
  const enginePath = path.resolve(option('engine', path.join(root, 'action-engine.js'))), { Game } = require(enginePath);
  const basicCases = [
    { doctrineId: 'skirmisher', mapId: 'frontier', secondMap: 'foundry', seed: 731, supply: 'mobility' },
    { doctrineId: 'marksman', mapId: 'foundry', secondMap: 'frost', seed: 2, supply: 'power' },
    { doctrineId: 'conductor', mapId: 'storm', secondMap: 'frontier', seed: 1, supply: 'repair' }
  ];
  const evolutions = [
    { id: 'shotgun-breach', prerequisite: 'repulsor', weapon: 1 },
    { id: 'piercer-mirror', prerequisite: 'shatter', weapon: 2 },
    { id: 'assault-chain', prerequisite: 'arc', weapon: 0 }
  ];
  const matrix = [
    ...basicCases.map((settings, index) => ({ ...settings, evolution: evolutions[index], aimError: .1, reaction: .25 })),
    ...basicCases.map((settings, index) => ({ ...settings, mapId: ['frost', 'storm', 'frontier'][index], secondMap: ['storm', 'foundry', 'frost'][index], seed: settings.seed + 40, evolution: evolutions[index], aimError: .1, reaction: .25 })),
    ...['anchors', 'boss'].map(nexusStrategy => ({ ...basicCases[1], evolution: evolutions[1], nexusStrategy, aimError: .1, reaction: .25 }))
  ];
  const awakeningCases = basicCases.flatMap((settings, index) => ({ skirmisher: ['return-dash', 'slide-reload'], marksman: ['mag-relay', 'interrupt-round'], conductor: ['mobile-field', 'charged-pulse'] })[settings.doctrineId].map(awakeningId => ({ ...settings, awakeningId, evolution: evolutions[index], aimError: .1, reaction: .25 })));
  const cases = (args.includes('--idle-only') ? basicCases.map(settings => ({ ...settings, idle: true })) : args.includes('--awakenings') ? awakeningCases : args.includes('--matrix') ? matrix : [...basicCases, ...basicCases.map((settings, index) => ({ ...settings, evolution: evolutions[index] }))])
    .filter(settings => (!option('doctrine', '') || settings.doctrineId === option('doctrine', '')) && (!args.includes('--planned-only') || settings.evolution));
  assert.ok(cases.length, 'Choose an existing doctrine');
  const report = { generatedAt: new Date().toISOString(), enginePath, engineSha256: crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'), botSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), method: '60 Hz simulation, original stats, public player actions and actual upgrade/intermission choices. Bot reads enemy/map/visible hazard geometry. Each run records optional reaction delay, aim error or idle policy. Natural defeats retained. No teleport, HP/damage edits or forced objective progress. This small synthetic matrix is not a human difficulty or win-rate estimate.', runs: [] };
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const output = path.resolve(option('output', path.join(root, 'reports/campaign-runs-' + version + '.json')));
  for (const settings of cases) {
    const result = simulate(Game, { ...settings, seconds: Number(option('seconds', 1500)) }); report.runs.push(result);
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ doctrineId: result.doctrineId, maps: result.maps, outcome: result.outcome, seconds: result.seconds, stage: result.stage, hp: result.hp, evolutions: result.evolutions, anchors: result.anchorsBroken, shields: result.shieldsBroken }));
  }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'), report.engineSha256, 'Engine changed during the integration matrix');
  assert.ok(report.runs.every(run => ['won', 'lost'].includes(run.outcome) && !run.invalid && run.endEchoes === 0), 'All runs finish in a valid state');
  assert.ok(report.runs.filter(run => run.evolution && run.outcome === 'won').every(run => run.evolutions.length === 1 && run.evolutions[0].id === run.evolution.id && run.rests.at(-1).evolutionId === run.evolution.id), 'A planned winning build naturally evolves once and carries its evolution to the final act');
  if (args.includes('--idle-only')) assert.ok(report.runs.every(run => run.outcome === 'lost' && run.stage === 1 && run.rests.length === 0 && run.lastDamage?.name), 'Idle play naturally loses with a named damage cause and no progression');
  else assert.ok(report.runs.some(run => run.outcome === 'won' && run.maps.length === 3 && new Set(run.maps).size === 3), 'At least one complete three-act campaign is reachable');
}

module.exports = { CampaignExplorer, seededRandom, simulate };
