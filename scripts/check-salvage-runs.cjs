'use strict';

// Reachability, not a human win-rate estimate. This explorer changes no stats,
// source progress, spawn tickets or geometry; it only calls ordinary actions.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { CampaignExplorer } = require('./check-campaign-runs.cjs');
const root = path.resolve(__dirname, '..'), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), round = value => +value.toFixed(3);

class SalvageExplorer extends CampaignExplorer {
  constructor(settings = {}) { super(null, settings); this.objective = null; }
  route(game) {
    const player = game.player, state = game.salvage;
    let target;
    if (state.evac) target = state.exits.find(exit => exit.id === state.evac.exitId);
    else if (this.settings.policy === 'empty' || this.settings.policy === 'early' && state.carried >= 3)
      target = state.exits.toSorted((a, b) => distance(a, player) - distance(b, player))[0];
    else target = state.sources.filter(source => source.status !== 'collected').toSorted((a, b) => distance(a, player) - distance(b, player))[0] ||
      state.exits.toSorted((a, b) => distance(a, player) - distance(b, player))[0];
    this.objective = target;
    if (target && state.selectedId !== target.id) game.selectSalvageTarget(target.id);
    if (target?.kind === 'vault' && this.settings.quiet && target.status === 'locked' && distance(target, player) <= 100 && player.skillCooldown <= 0) game.useSkill();
    if (target && distance(target, player) < 78) game.interact();
    const medical = game.stations.find(station => station.kind === 'medical' && player.hp < player.maxHp * .45 && player.credits >= station.cost && distance(station, player) < 350);
    if (medical) { if (distance(medical, player) < 75) game.interact(); else return medical; }
    if (target && (target.type === 'salvage-exit' && state.evac || target.kind === 'drill' && target.status === 'drilling') && distance(target, player) < 95)
      return { x: target.x + Math.cos(game.elapsed * 1.2) * 48, y: target.y + Math.sin(game.elapsed * 1.2) * 48 };
    return target || player;
  }
  input(game) {
    const input = super.input(game), player = game.player, target = this.objective;
    const nearest = game.enemies.filter(enemy => enemy.hp > 0).toSorted((a, b) => distance(a, player) - distance(b, player))[0];
    const shouldBreak = target && target.hp > 0 && ['locked', 'flying'].includes(target.status) &&
      (target.kind !== 'vault' || !this.settings.quiet || player.skillCooldown > 0 && target.quietTimer <= 0);
    if (shouldBreak && distance(target, player) < 520 && (!nearest || distance(nearest, player) > 175)) {
      game.switchWeapon(0);
      const angle = Math.atan2(target.y - player.y, target.x - player.x) + Math.sin(game.elapsed * 2.13 + this.settings.seed) * .1, length = distance(target, player);
      input.aimX = player.x + Math.cos(angle) * length; input.aimY = player.y + Math.sin(angle) * length; input.shoot = true;
    }
    const warnings = [...game.hazards.filter(hazard => hazard.remaining > 0 && !hazard.resolved && hazard.type === 'blast'),
      ...(game.battlefield ? [...game.battlefield.props, ...game.battlefield.mines].filter(field => field.status === 'armed').map(field => ({ ...field, radius: field.blastRadius })) : [])];
    const warning = warnings.find(value => distance(value, player) < value.radius + player.radius + 18);
    if (warning) {
      let dx = player.x - warning.x, dy = player.y - warning.y, length = Math.hypot(dx, dy);
      if (length < 1) { dx = Math.cos(game.elapsed); dy = Math.sin(game.elapsed); length = 1; }
      const move = this.move(game, { x: warning.x + dx / length * (warning.radius + 85), y: warning.y + dy / length * (warning.radius + 85) }, game.enemies.filter(enemy => enemy.hp > 0));
      input.moveX = move.x; input.moveY = move.y;
      if (distance(warning, player) < warning.radius * .65) game.dash({ x: move.x, y: move.y });
    }
    return input;
  }
}

function simulate(Game, settings) {
  const spawned = [], queued = [];
  class ObservedGame extends Game {
    _queueSalvage(plan, reason) {
      const before = this.salvage?.pending.length || 0;
      super._queueSalvage(plan, reason);
      if ((this.salvage?.pending.length || 0) > before) queued.push({ reason, types: [...plan], at: round(this.elapsed) });
    }
    spawnEnemy(type, point) {
      const reason = this.salvage?.pending[0]?.reason;
      const enemy = super.spawnEnemy(type, point);
      if (enemy && this.salvage) spawned.push({ type, reason, x: round(enemy.x), y: round(enemy.y), playerX: round(this.player.x), playerY: round(this.player.y), at: round(this.elapsed) });
      return enemy;
    }
  }
  const game = new ObservedGame({ mode: 'salvage', seed: settings.seed, difficulty: settings.difficulty }), bot = new SalvageExplorer({ ...settings, aimError: .1 });
  assert.equal(game.mode, 'salvage');
  const result = { ...settings, initial: { hp: game.player.hp, maxHp: game.player.maxHp, speed: game.player.speed, damageMultiplier: game.player.damageMultiplier },
    events: {}, milestones: [], upgrades: [], shots: {}, damage: 0, minHp: game.player.hp, peaks: { enemies: 0, bullets: 0, hazards: 0, mines: 0, pending: game.salvage.pending.length }, invalid: null };
  let held = null, nextDecision = 0;
  game.start();
  for (let frame = 0; frame < (settings.seconds || 420) * 60 && !['won', 'lost'].includes(game.phase); frame++) {
    if (game.phase === 'upgrade') { assert.equal(bot.chooseUpgrade(game), true); held = null; continue; }
    assert.equal(game.phase, 'playing');
    if (!held || game.elapsed >= nextDecision) { held = settings.policy === 'idle' ? {} : bot.input(game); nextDecision = game.elapsed + .25; }
    game.update(1 / 60, held);
    for (const event of game.drainEvents()) {
      result.events[event.type] = (result.events[event.type] || 0) + 1;
      if (event.type === 'damage') result.damage += event.amount;
      if (event.type === 'upgrade') result.upgrades.push(event.upgrade);
      if (event.type === 'shot' && event.owner === 'player') result.shots[event.weapon] = (result.shots[event.weapon] || 0) + 1;
      if (event.type.startsWith('salvage-') || ['win', 'lose', 'field-capture', 'field-burst'].includes(event.type)) result.milestones.push({ type: event.type, at: round(game.elapsed), hp: round(game.player.hp), sourceId: event.sourceId, kind: event.kind, value: event.value, samples: event.samples, bonus: event.bonus, level: event.level, alarm: event.alarm });
    }
    result.minHp = Math.min(result.minHp, game.player.hp);
    for (const name of ['enemies', 'bullets', 'hazards']) result.peaks[name] = Math.max(result.peaks[name], game[name].length);
    result.peaks.mines = Math.max(result.peaks.mines, game.battlefield?.mines.length || 0);
    result.peaks.pending = Math.max(result.peaks.pending, game.salvage.pending.length);
    const numbers = [game.player.x, game.player.y, game.player.hp, game.elapsed, game.salvage.carried, game.salvage.alarm,
      ...game.bullets.flatMap(bullet => [bullet.x, bullet.y, bullet.vx, bullet.vy]), ...game.salvage.sources.flatMap(source => [source.x, source.y, source.hp])];
    if (!numbers.every(Number.isFinite) || playerInvalid(game) || game.salvage.carried < 0 || game.salvage.carried > 17 || game.salvage.alarm < 0 || game.salvage.alarm > 100 || game.enemies.filter(enemy => enemy.hp > 0).length > 14 || (game.battlefield?.mines.length || 0) > 12) {
      result.invalid = 'Finite geometry, HP, samples, alarm or load cap'; break;
    }
  }
  return { ...result, outcome: ['won', 'lost'].includes(game.phase) ? game.salvage.status : result.invalid ? 'invalid' : 'timeout', seconds: round(game.elapsed),
    hp: round(game.player.hp), minHp: round(result.minHp), kills: game.kills, level: game.player.level, damage: round(result.damage), score: game.score,
    carried: game.salvage.carried, settled: game.salvage.settled, lostSamples: game.salvage.lostSamples, bonus: game.salvage.bonus, alarm: game.salvage.alarm,
    sources: game.salvage.sources.map(source => ({ id: source.id, kind: source.kind, status: source.status, progress: source.progress, hp: source.hp })),
    spawned, queued, generatedTickets: queued.reduce((sum, group) => sum + group.types.length, 0),
    unspawnedAtTerminal: queued.reduce((sum, group) => sum + group.types.length, 0) - spawned.length,
    fieldStats: structuredClone(game.salvage.fieldStats), lastDamage: game.lastDamage };
}
function playerInvalid(game) { const player = game.player; return player.hp < 0 || player.hp > player.maxHp || player.x < 0 || player.y < 0 || player.x > game.world.width || player.y > game.world.height; }

if (require.main === module) {
  const args = process.argv.slice(2), option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
  const enginePath = path.resolve(option('engine', path.join(root, 'action-engine.js'))), { Game } = require(enginePath);
  const engineSha256 = crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex');
  const output = path.resolve(option('output', path.join(root, 'reports/expansion-6-7/salvage-natural-source.json')));
  const cases = [
    { seed: 731, difficulty: 'normal', policy: 'early', quiet: true },
    { seed: 2, difficulty: 'normal', policy: 'deep', quiet: false },
    { seed: 3, difficulty: 'normal', policy: 'deep', quiet: true },
    { seed: 4, difficulty: 'normal', policy: 'empty' },
    { seed: 5, difficulty: 'normal', policy: 'idle' },
    { seed: 17, difficulty: 'overload', policy: 'deep', quiet: false }
  ].filter(settings => !option('policy', '') || settings.policy === option('policy', ''));
  const report = { generatedAt: new Date().toISOString(), enginePath, engineSha256, botSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    method: '60 Hz original-stat simulation, public movement/aim/fire/dash/EMP/interact/map-selection and real upgrades. Reaction 0.25 s, aim error 0.1 rad for enemies and sources. Visible hazard steering; no teleport, invulnerability, source/timer edits, spawn removal or forced completion. Natural failures retained; deterministic reachability, not human balance/win-rate or real-device performance.', runs: [] };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  for (const settings of cases) {
    const run = simulate(Game, settings); report.runs.push(run); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ policy: run.policy, quiet: run.quiet, seed: run.seed, difficulty: run.difficulty, outcome: run.outcome, seconds: run.seconds, hp: run.hp, settled: run.settled, lost: run.lostSamples, alarm: run.alarm, peaks: run.peaks, lastDamage: run.lastDamage }));
  }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'), engineSha256, 'Engine changed during natural attempts');
  assert.ok(report.runs.every(run => !run.invalid && ['extracted', 'withdrawn', 'failed'].includes(run.outcome)), 'Every attempt ends naturally in a valid terminal state');
  if (cases.some(settings => settings.policy === 'early')) assert.ok(report.runs.some(run => run.policy === 'early' && run.outcome === 'extracted'), 'Early extraction is reachable');
  if (cases.some(settings => settings.policy === 'deep')) assert.ok(report.runs.some(run => run.policy === 'deep' && run.outcome === 'extracted' && run.settled >= 7), 'A deeper recovery is reachable');
  if (cases.some(settings => settings.policy === 'empty')) assert.ok(report.runs.some(run => run.policy === 'empty' && run.outcome === 'withdrawn' && run.bonus === 0), 'Empty withdrawal is distinct from extraction');
  if (cases.some(settings => settings.policy === 'idle')) assert.ok(report.runs.filter(run => run.policy === 'idle').every(run => run.outcome === 'failed' && run.lastDamage?.name), 'Idle play has a real named failure');
}
module.exports = { SalvageExplorer, simulate };
