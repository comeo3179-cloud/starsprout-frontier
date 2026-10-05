'use strict';
// Ordinary-action strategies. No position, HP, damage, spawn or quota edits.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { VoyageExplorer, simulate } = require('./check-voyage-runs.cjs');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
const option = (name, fallback) => args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const enginePath = path.resolve(option('engine', path.join(root, 'action-engine.js'))), { Game } = require(enginePath);
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.resolve(option('output', path.join(root, 'reports/expansion-6-7', 'battlefield-natural-' + version + '.json')));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const engineSha256 = sha(enginePath), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const report = { generatedAt: new Date().toISOString(), version, enginePath, engineSha256, botSha256: sha(__filename), runs: [],
  method: 'Existing original-stat VoyageExplorer with explicit ordinary-action policies: default, approach visible fields for a real EMP, or shoot an idle field when an enemy is in its blast and the player is outside. Finite 60Hz simulation, 250ms decisions, 0.10 rad aim error; legal upgrade/shop/equip/route choices. Observer subclass logs successful actual spawns, mines, fields and outcomes without changing game state. Natural losses retained. No teleports, buffs, enemy injection, objective completion shortcuts or human win-rate claims.' };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const route = VoyageExplorer.prototype.route, input = VoyageExplorer.prototype.input;
let policy = 'default';
const visible = (game, from, to) => !game.obstacles.some(rock => game._segmentHit(from.x, from.y, to.x - from.x, to.y - from.y, rock, 0) !== null);
function fields(game) { return game.battlefield ? [...game.battlefield.props, ...game.battlefield.mines].filter(field => field.status === 'idle' && !field.friendly) : []; }
VoyageExplorer.prototype.route = function(game) {
  if (policy === 'pulse-fields' && game.player.skillCooldown <= 0 && !game.voyage.room.objectiveDone) {
    const field = fields(game).filter(value => distance(game.player, value) < 380 && visible(game, game.player, value)).toSorted((a, b) => distance(game.player, a) - distance(game.player, b))[0];
    if (field && distance(game.player, field) > game.player.skillRadius - 25) {
      const gap = distance(game.player, field);
      return { x: field.x + (game.player.x - field.x) / gap * 160, y: field.y + (game.player.y - field.y) / gap * 160 };
    }
  }
  return route.call(this, game);
};
VoyageExplorer.prototype.input = function(game) {
  if (policy === 'pulse-fields' && game.player.skillCooldown <= 0) {
    const origin = game.skillTarget();
    if (fields(game).some(field => distance(origin, field) <= game.player.skillRadius + field.radius && visible(game, origin, field))) game.useSkill();
  }
  const command = input.call(this, game);
  if (policy === 'shoot-fields') {
    const field = fields(game).find(value => distance(game.player, value) > value.blastRadius + game.player.radius + 25 && distance(game.player, value) < 620 && visible(game, game.player, value)
      && game.enemies.some(enemy => enemy.hp > 0 && distance(enemy, value) <= value.blastRadius + enemy.radius && visible(game, value, enemy)));
    if (field) {
      const angle = Math.atan2(field.y - game.player.y, field.x - game.player.x) + Math.sin(game.elapsed * 2.13 + this.settings.seed) * .1;
      const gap = distance(game.player, field);
      command.aimX = game.player.x + Math.cos(angle) * gap; command.aimY = game.player.y + Math.sin(angle) * gap; command.shoot = true;
    }
  }
  return command;
};
const settings = [
  { seed: 731, deviceId: 'afterimage', difficulty: 'normal', risk: 'calm', policy: 'default', evolution: { id: 'piercer-mirror', prerequisite: 'shatter', weapon: 2 } },
  { seed: 2, deviceId: 'mirror', difficulty: 'normal', risk: 'calm', policy: 'shoot-fields', evolution: { id: 'assault-chain', prerequisite: 'arc', weapon: 0 } },
  { seed: 3, deviceId: 'well', difficulty: 'normal', risk: 'calm', policy: 'pulse-fields', evolution: { id: 'grenade-echo', prerequisite: 'blast-radius', weapon: 3 } },
  { seed: 4, deviceId: 'afterimage', difficulty: 'overload', risk: 'surge', policy: 'shoot-fields', evolution: { id: 'boomerang-twin', prerequisite: 'return-edge', weapon: 4 } },
  { seed: 17, deviceId: 'mirror', difficulty: 'overload', risk: 'surge', policy: 'pulse-fields', evolution: { id: 'piercer-mirror', prerequisite: 'shatter', weapon: 2 } },
  { seed: 5, deviceId: 'mirror', difficulty: 'normal', risk: 'calm', policy: 'default', idle: true }
];
try {
  for (const config of settings) {
    policy = config.policy;
    const audit = { spawned: {}, minesCreated: 0, minePeak: 0, propPeak: 0, finite: true }; let observed;
    class Observer extends Game {
      constructor(...args) { super(...args); observed = this; }
      spawnEnemy(...args) { const enemy = super.spawnEnemy(...args); if (enemy) audit.spawned[enemy.type] = (audit.spawned[enemy.type] || 0) + 1; return enemy; }
      _spawnMine(...args) { const mine = super._spawnMine(...args); if (mine) audit.minesCreated++; return mine; }
      _step(...args) {
        super._step(...args);
        if (this.battlefield) {
          audit.minePeak = Math.max(audit.minePeak, this.battlefield.mines.length); audit.propPeak = Math.max(audit.propPeak, this.battlefield.props.length);
          audit.finite &&= [...this.battlefield.props, ...this.battlefield.mines].every(field => [field.x, field.y, field.hp, field.remaining].every(Number.isFinite) && field.hp >= 0 && field.remaining >= 0);
        }
      }
    }
    const run = simulate(Observer, config);
    run.battlefield = { ...audit, cumulative: structuredClone(observed.voyage.fieldStats) }; report.runs.push(run); save();
    assert.ok(audit.finite && audit.minePeak <= 12 && !run.invalid);
    console.log(JSON.stringify({ policy, seed: config.seed, device: config.deviceId, difficulty: config.difficulty, outcome: run.outcome, node: run.node, seconds: run.seconds, hp: run.hp, battlefield: run.battlefield }));
  }
  assert.equal(sha(enginePath), engineSha256, 'Engine did not change during these attempts');
  assert.ok(report.runs.every(run => ['won', 'lost'].includes(run.outcome)), 'Every normal-input attempt reaches a finite natural outcome');
  assert.ok(report.runs.some(run => run.outcome === 'won' && run.history.length === 7));
  assert.ok(report.runs.filter(run => run.idle).every(run => run.outcome === 'lost' && run.node === 1));
  assert.ok(report.runs.some(run => run.policy === 'pulse-fields' && run.battlefield.cumulative.captures > 0), 'A real-action EMP policy actually captures fields');
} catch (error) { report.failure = error.stack; save(); throw error; }
finally { VoyageExplorer.prototype.route = route; VoyageExplorer.prototype.input = input; }
