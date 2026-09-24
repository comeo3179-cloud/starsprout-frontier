#!/usr/bin/env node
'use strict';

// Headless game soak, not a human playtest or a renderer benchmark.
// Only public player actions change the game: no teleports, stat edits, enemy
// injection, or task completion shortcuts. The bot can read the public map.
// Usage: node scripts/simulate-expedition.js --seeds 20 --seconds 600
//        node scripts/simulate-expedition.js --mode idle --seconds 90
//        node scripts/simulate-expedition.js --mode roam --seconds 600 --seeds 5
//        node scripts/simulate-expedition.js --build mods --seeds 20
//        node scripts/simulate-expedition.js --build reactor --seeds 3 --seconds 600
//        node scripts/simulate-expedition.js --engine PATH --output report.json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf('--' + name);
  return index === -1 ? fallback : args[index + 1];
};
const options = {
  seeds: Number(option('seeds', 20)),
  startSeed: Number(option('start-seed', 1)),
  seconds: Number(option('seconds', 600)),
  mode: option('mode', 'explore'),
  build: option('build', 'balanced'),
  map: option('map', 'frontier'),
  engine: path.resolve(option('engine', path.join(__dirname, '..', 'action-engine.js'))),
  output: option('output', '')
};
if (!['explore', 'idle', 'roam'].includes(options.mode) || !['balanced', 'mods', 'reactor'].includes(options.build) || !Number.isInteger(options.seeds) || options.seeds < 1 || !Number.isFinite(options.seconds) || options.seconds <= 0) {
  throw new Error('Use --mode explore|idle|roam, --build balanced|mods|reactor, --seeds positive_integer, --seconds positive_number.');
}
const { Game, WEAPONS, MAPS } = require(options.engine);
if (!MAPS.some(map => map.id === options.map)) throw new Error('Use --map frontier|foundry|frost.');
const engineHash = crypto.createHash('sha256').update(fs.readFileSync(options.engine)).digest('hex');
const DT = 1 / 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (number, digits = 2) => Number(number.toFixed(digits));
const mean = numbers => numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
const percentile = (numbers, fraction) => numbers.length ? numbers.toSorted((a, b) => a - b)[Math.min(numbers.length - 1, Math.floor(numbers.length * fraction))] : 0;

function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

class Explorer {
  constructor() { this.target = null; this.lastSwitch = -10; this.roamIndex = 0; }

  chooseUpgrade(game) {
    // Prefer sustain, then damage; health becomes the first choice when hurt.
    const order = game.player.hp < game.player.maxHp * .55
      ? ['health', 'vampire', 'shield', 'damage', 'rapid', 'pulse', 'magnet', 'reload', 'crit', 'capacity', 'speed', 'dash']
      : ['vampire', 'damage', 'rapid', 'health', 'shield', 'pulse', 'magnet', 'reload', 'crit', 'capacity', 'speed', 'dash'];
    if (options.build === 'mods') order.unshift('arc', 'repulsor', 'shatter');
    const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
    const choice = game.upgradeChoices.toSorted((a, b) => rank(a.id) - rank(b.id))[0];
    if (choice) game.chooseUpgrade(choice.id);
  }

  route(game) {
    const player = game.player;
    if (this.target && (this.target.opened || this.target.status === 'active')) this.target = null;
    if (options.mode === 'roam') {
      // Explore all supply boxes, then patrol the perimeter without activating
      // relays. This tests sustained time pressure, not the victory objective.
      if (!this.target) {
        const box = game.crates.filter(crate => !crate.opened).toSorted((a, b) => distance(a, player) - distance(b, player))[0];
        const corners = [[.2, .2], [.8, .2], [.8, .8], [.2, .8]];
        const corner = corners[this.roamIndex % corners.length];
        this.target = box || { x: game.world.width * corner[0], y: game.world.height * corner[1], type: 'patrol' };
      }
      if (distance(player, this.target) < 78) {
        if (this.target.type === 'crate') game.interact();
        else this.roamIndex += 1;
        this.target = null;
      }
      return this.target || player;
    }
    const charging = game.relays.find(relay => relay.status === 'charging');
    const boss = game.enemies.find(enemy => enemy.type === 'boss' && enemy.hp > 0);
    if (boss) {
      // Orbit the boss; the bot does not read hazard countdowns or future shots.
      const angle = Math.atan2(player.y - boss.y, player.x - boss.x) + .28;
      return { x: boss.x + Math.cos(angle) * 310, y: boss.y + Math.sin(angle) * 310 };
    }
    if (charging) {
      const orbit = game.map.mode === 'demolition' ? 230 : 92;
      return { x: charging.x + Math.cos(game.elapsed * 1.7) * orbit, y: charging.y + Math.sin(game.elapsed * 1.7) * orbit };
    }
    if (!this.target) {
      const relay = game.relays.filter(item => item.status === 'idle').toSorted((a, b) => distance(a, player) - distance(b, player))[0];
      if (!relay) return player;
      const routeLength = distance(player, relay);
      const crates = game.crates.filter(crate => !crate.opened && distance(player, crate) < 460 && distance(crate, relay) < routeLength + 90);
      const medical = game.stations.filter(station => station.kind === 'medical' && player.hp < player.maxHp * .55 && player.credits >= station.cost && distance(player, station) < 550);
      const armory = game.stations.filter(station => station.kind === 'armory' && station.uses < 4 && player.credits >= station.cost && distance(player, station) < 300);
      this.target = [...medical, ...armory, ...crates].toSorted((a, b) => distance(a, player) - distance(b, player))[0] || relay;
    }
    if (distance(player, this.target) < 78) {
      game.interact();
      this.target = null;
    }
    return this.target || player;
  }

  move(game, target, enemies) {
    const player = game.player;
    let dx = target.x - player.x, dy = target.y - player.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) { dx /= length; dy /= length; }
    // Basic local avoidance, not pathfinding: prefer progressing toward the
    // waypoint and step away from close enemies and blocked directions.
    for (const enemy of enemies) {
      const gap = distance(player, enemy);
      if (gap < enemy.radius + 85) {
        dx += (player.x - enemy.x) / Math.max(gap, 1) * 1.25;
        dy += (player.y - enemy.y) / Math.max(gap, 1) * 1.25;
      }
    }
    if (Math.hypot(dx, dy) < .1) return { x: 0, y: 0 };
    const desired = Math.atan2(dy, dx);
    let best = null;
    for (let index = 0; index < 24; index += 1) {
      const angle = desired + index * Math.PI * 2 / 24;
      const x = Math.cos(angle), y = Math.sin(angle);
      let score = Math.cos(angle - desired);
      const end = { x: player.x + x * 75, y: player.y + y * 75 };
      if (end.x < 42 || end.y < 42 || end.x > game.world.width - 42 || end.y > game.world.height - 42) score -= 8;
      for (const rock of game.obstacles) {
        const projection = Math.max(0, Math.min(75, (rock.x - player.x) * x + (rock.y - player.y) * y));
        const clearance = Math.hypot(player.x + x * projection - rock.x, player.y + y * projection - rock.y);
        if (clearance < rock.radius + player.radius + 9) score -= 6;
      }
      if (!best || score > best.score) best = { x, y, score };
    }
    return best;
  }

  input(game) {
    const player = game.player;
    const enemies = game.enemies.filter(enemy => enemy.hp > 0).toSorted((a, b) => distance(a, player) - distance(b, player));
    const target = this.route(game);
    const movement = this.move(game, target, enemies);
    const enemy = enemies[0];
    const gap = enemy ? distance(player, enemy) : Infinity;
    if (options.build === 'reactor' && game.reactor.charge >= game.reactor.maxCharge) game.activateOverdrive();
    if (enemy && game.elapsed - this.lastSwitch > 1) {
      const wanted = enemy.type === 'reactor' ? 3 : game.map.id === 'frost' && gap < 290 ? 4 : gap < 160 ? 1 : enemy.type === 'tank' || enemy.type === 'boss' ? 2 : 0;
      if (wanted !== player.weapon && game.switchWeapon(wanted)) this.lastSwitch = game.elapsed;
    }
    if (enemies.filter(item => distance(player, item) < player.skillRadius).length >= 3 || gap < 62) game.useSkill();
    if (options.build === 'reactor' && gap < 150) game.dash({ x: enemy.x - player.x, y: enemy.y - player.y });
    else if (gap < 57) game.dash();
    if (!enemy && player.reloadTimer <= 0 && player.ammo < player.magSize * .7) game.reload();
    // Supplemental coverage only: read the same reload meter the player sees.
    if (['mods', 'reactor'].includes(options.build) && player.reloadTimer > 0 && !player.reloadAttempted && player.reloadProgress >= .6 && player.reloadProgress <= .7) game.reload();
    const aim = enemy || { x: player.x + Math.cos(player.angle) * 150, y: player.y + Math.sin(player.angle) * 150 };
    return { moveX: movement.x, moveY: movement.y, aimX: aim.x, aimY: aim.y, shoot: !!enemy && gap < 760 };
  }
}

function simulate(seed) {
  const game = new Game({ random: seededRandom(seed), mapId: options.map });
  const bot = new Explorer();
  const result = { seed, outcome: '', seconds: 0, relays: 0, kills: 0, level: 1, hp: 0, minimumHp: game.player.hp, damageTaken: 0, damageHits: 0, firstDamageAt: null, cratesOpened: 0, stationUses: 0, distanceWalked: 0, stuckSeconds: 0, upgrades: [], milestones: [], shotsByWeapon: WEAPONS.map(() => 0), perfectReloads: 0, arcEvents: 0, shatterEvents: 0, captures: 0, detonations: 0, bestCombo: 0, overdrives: 0, sectorWarnings: 0, bossAttacks: {}, slowSeconds: 0, peaks: { enemies: 0, bullets: 0, pickups: 0, hazards: 0 }, deepestEnemyOverlap: 0, maxDeepOverlapPairs: 0, invalidState: null };
  const timings = [], counts = { enemies: 0, bullets: 0, pickups: 0, hazards: 0 };
  let frames = 0, samples = 0, totalUpdateMs = 0;
  const began = performance.now();
  game.start();
  while (frames < options.seconds / DT && !['won', 'lost'].includes(game.phase)) {
    if (game.phase === 'upgrade') bot.chooseUpgrade(game);
    const input = options.mode === 'idle' ? {} : bot.input(game);
    const before = { x: game.player.x, y: game.player.y };
    const startUpdate = performance.now();
    game.update(DT, input);
    const updateMs = performance.now() - startUpdate;
    totalUpdateMs += updateMs;
    frames += 1;
    const moved = distance(before, game.player);
    result.distanceWalked += moved;
    if (Math.hypot(input.moveX || 0, input.moveY || 0) > .4 && moved < game.player.speed * DT * .2) result.stuckSeconds += DT;
    result.minimumHp = Math.min(result.minimumHp, game.player.hp);
    if (game.player.slowTimer > 0) result.slowSeconds += DT;
    for (const event of game.drainEvents()) {
      if (event.type === 'damage') {
        result.damageTaken += event.amount; result.damageHits += 1;
        if (result.firstDamageAt === null) result.firstDamageAt = round(game.elapsed);
      }
      if (event.type === 'upgrade') result.upgrades.push(event.upgrade);
      if (event.type === 'shot' && event.owner === 'player') result.shotsByWeapon[event.weapon] += 1;
      if (event.type === 'reload-perfect') result.perfectReloads += 1;
      if (event.type === 'arc') result.arcEvents += 1;
      if (event.type === 'explosion' && event.owner === 'player') result.shatterEvents += 1;
      if (event.type === 'overdrive-start') result.overdrives += 1;
      if (event.type === 'sector-warning') result.sectorWarnings += 1;
      if (event.type === 'boss-attack') result.bossAttacks[event.name] = (result.bossAttacks[event.name] || 0) + 1;
      if (['relay-start', 'relay-complete', 'boss-spawn', 'boss-phase', 'win', 'lose'].includes(event.type)) result.milestones.push({ event: event.type, seconds: round(game.elapsed), name: event.name, hp: round(game.player.hp) });
    }
    if (!Number.isFinite(game.player.x + game.player.y + game.player.hp + game.elapsed) || game.player.hp < 0 || game.player.hp > game.player.maxHp || game.player.x < 0 || game.player.y < 0 || game.player.x > game.world.width || game.player.y > game.world.height) {
      result.invalidState = 'Player position, HP or time violated finite/range bounds';
      break;
    }
    if (game.reactor && (!Number.isFinite(game.reactor.charge + game.reactor.timer + game.combo.count + game.combo.timer) || game.reactor.charge < 0 || game.reactor.charge > game.reactor.maxCharge || game.reactor.timer < 0 || game.reactor.timer > game.reactor.duration || game.combo.count < 0 || game.combo.timer < 0 || game.enemies.some(enemy => !Number.isFinite(enemy.phaseMarkTimer) || enemy.phaseMarkTimer < 0 || enemy.phaseMarkTimer > 4))) {
      result.invalidState = 'Reactor, combo or phase marks violated finite/range bounds';
      break;
    }
    if (frames % 30 === 0) {
      samples += 1; timings.push(updateMs);
      for (const key of Object.keys(counts)) { const amount = game[key].length; counts[key] += amount; result.peaks[key] = Math.max(result.peaks[key], amount); }
      let overlaps = 0;
      for (let a = 0; a < game.enemies.length; a += 1) for (let b = a + 1; b < game.enemies.length; b += 1) {
        const left = game.enemies[a], right = game.enemies[b];
        if (left.hp <= 0 || right.hp <= 0 || left.type === 'boss' || right.type === 'boss') continue;
        const fraction = distance(left, right) / (left.radius + right.radius);
        if (fraction < .65) overlaps += 1;
        result.deepestEnemyOverlap = Math.max(result.deepestEnemyOverlap, 1 - fraction);
      }
      result.maxDeepOverlapPairs = Math.max(result.maxDeepOverlapPairs, overlaps);
    }
  }
  Object.assign(result, {
    outcome: result.invalidState ? 'invalid' : ['won', 'lost'].includes(game.phase) ? game.phase : 'timeout',
    seconds: round(game.elapsed), relays: game.completedRelays, kills: game.kills, level: game.player.level,
    captures: game.reactor?.captures || 0, detonations: game.reactor?.detonations || 0, bestCombo: game.combo?.best || 0,
    hp: round(game.player.hp), minimumHp: round(result.minimumHp), damageTaken: round(result.damageTaken),
    cratesOpened: game.crates.filter(crate => crate.opened).length,
    stationUses: game.stations.reduce((sum, station) => sum + station.uses, 0),
    slowSeconds: round(result.slowSeconds), distanceWalked: round(result.distanceWalked), stuckSeconds: round(result.stuckSeconds),
    deepestEnemyOverlap: round(result.deepestEnemyOverlap),
    means: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, round(value / Math.max(samples, 1))])),
    performance: { wallMs: round(performance.now() - began), engineMeanMs: round(totalUpdateMs / Math.max(frames, 1), 4), engineSampleP95Ms: round(percentile(timings, .95), 4), frames }
  });
  return result;
}

const runs = Array.from({ length: options.seeds }, (_, index) => simulate(options.startSeed + index));
const wins = runs.filter(run => run.outcome === 'won');
const upgradeCounts = {};
for (const run of runs) for (const upgrade of run.upgrades) upgradeCounts[upgrade] = (upgradeCounts[upgrade] || 0) + 1;
const summary = {
  runs: runs.length, wins: wins.length, losses: runs.filter(run => run.outcome === 'lost').length,
  timeouts: runs.filter(run => run.outcome === 'timeout').length, invalid: runs.filter(run => run.invalidState).length,
  winSeconds: wins.length ? { min: Math.min(...wins.map(run => run.seconds)), median: percentile(wins.map(run => run.seconds), .5), max: Math.max(...wins.map(run => run.seconds)) } : null,
  meanSeconds: round(mean(runs.map(run => run.seconds))), meanRelays: round(mean(runs.map(run => run.relays))),
  meanDamageTaken: round(mean(runs.map(run => run.damageTaken))), meanDamageHits: round(mean(runs.map(run => run.damageHits))),
  earliestDamageAt: Math.min(...runs.filter(run => run.firstDamageAt !== null).map(run => run.firstDamageAt)),
  meanCrates: round(mean(runs.map(run => run.cratesOpened))), meanStationUses: round(mean(runs.map(run => run.stationUses))),
  meanStuckSeconds: round(mean(runs.map(run => run.stuckSeconds))), upgradeCounts,
  featureCoverage: { shotsByWeapon: WEAPONS.map((weapon, index) => runs.reduce((sum, run) => sum + run.shotsByWeapon[index], 0)), perfectReloads: runs.reduce((sum, run) => sum + run.perfectReloads, 0), arcEvents: runs.reduce((sum, run) => sum + run.arcEvents, 0), shatterEvents: runs.reduce((sum, run) => sum + run.shatterEvents, 0) },
  phaseCoverage: { captures: runs.reduce((sum, run) => sum + run.captures, 0), detonations: runs.reduce((sum, run) => sum + run.detonations, 0), overdrives: runs.reduce((sum, run) => sum + run.overdrives, 0), bestCombo: Math.max(...runs.map(run => run.bestCombo)) },
  threatCoverage: { sectorWarnings: runs.reduce((sum, run) => sum + run.sectorWarnings, 0), bossAttacks: [...new Set(runs.flatMap(run => Object.keys(run.bossAttacks)))], slowSeconds: round(runs.reduce((sum, run) => sum + run.slowSeconds, 0)) },
  worstEngineMeanMs: Math.max(...runs.map(run => run.performance.engineMeanMs)),
  worstEngineSampleP95Ms: Math.max(...runs.map(run => run.performance.engineSampleP95Ms)),
  entityPeaks: Object.fromEntries(Object.keys(runs[0].peaks).map(key => [key, Math.max(...runs.map(run => run.peaks[key]))])),
  worstDeepOverlapPairs: Math.max(...runs.map(run => run.maxDeepOverlapPairs))
};
const report = {
  schema: 1, botVersion: 'explorer-4', generatedAt: new Date().toISOString(), engineHash,
  runtime: { node: process.version, platform: process.platform, architecture: process.arch }, options,
  limitations: ['The bot reads the public map and enemy positions, aims exactly at current targets, and selects upgrades instantly.', 'It does not predict enemy shots or hazard timing; its local steering is not full pathfinding.', 'The optional mods build prioritizes weapon modifications and uses the visible active-reload meter; compare balanced builds for the fixed baseline.', 'The optional reactor build dashes toward close enemies, activates full overdrive immediately and uses the visible active-reload meter.', 'Seeds represent deterministic simulated runs, not human win rates or measured human session lengths.', 'Damage is summed from rounded game events. Engine timings exclude rendering, audio and the bot; p95 is sampled every 30 frames.'],
  summary, runs
};
console.table(runs.map(run => ({ seed: run.seed, result: run.outcome, seconds: run.seconds, relays: run.relays, kills: run.kills, level: run.level, damage: run.damageTaken, crates: run.cratesOpened, stuck: run.stuckSeconds, engineP95: run.performance.engineSampleP95Ms })));
console.log(JSON.stringify({ engineHash, botVersion: report.botVersion, mode: options.mode, build: options.build, summary }, null, 2));
if (options.output) { fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true }); fs.writeFileSync(options.output, JSON.stringify(report, null, 2) + '\n'); console.log('Report: ' + path.resolve(options.output)); }
if (summary.invalid) process.exitCode = 1;
