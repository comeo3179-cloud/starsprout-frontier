'use strict';

// Independent geometry audit. No protected-point rules or engine collision
// helpers are reused. Ordinary movement below is an enemy-free layout fixture.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), enginePath = path.join(root, 'action-engine.js'), { Game } = require(enginePath);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), round = number => +number.toFixed(4);
const args = process.argv.slice(2), outputIndex = args.indexOf('--output'), sectorIndex = args.indexOf('--sector'), sector = sectorIndex >= 0 ? args[sectorIndex + 1] : 'all';
const sectorIds = ['scrapyard', 'frostport', 'stormcity'], sectors = sector === 'all' ? sectorIds : sectorIds.filter(id => id === sector);
const output = outputIndex >= 0 ? path.resolve(args[outputIndex + 1]) : path.join(root, 'reports/review-9-0/salvage-layout-audit.json'), engineSha256 = hash(fs.readFileSync(enginePath));
const started = performance.now(), report = { generatedAt: new Date().toISOString(), engineSha256, scriptSha256: hash(fs.readFileSync(__filename)),
  method: 'The same 256 unique uint32 seed samples per selected sector. Independent 32px cardinal grid with actual player radius+4px rock padding and radius+20 world border. Every traversed edge uses independent segment-circle clearance, not just endpoints or engine collision helpers. All 18 legacy target centers and 3 node cores connect to the spawn graph; nodes remain separated from legacy objects, field props, and each other. Complete closed drone and elite patrol paths use each actual spawned body radius+4px and player access sampled at <=16px along every segment. Last-chance geometry fixtures position the player at each exit solely to call its real interaction; future cargo must be reachable, directly connected, and separate from legacy interaction circles. Each sector boundary seeds and narrowest sampled layout use original-stat Game.update normal analog walking; enemies/pending removed once, all real cover/fields/sources/nodes remain, no teleport/buff/clear cover/dash/shoot in ordinary walks. Geometric enemy-free fixtures, NOT native input, natural victories, combat balance, or proof for all 2^32 seeds.',
  sectors, samplesPerSector: 256, seeds: [], sectorResults: [], ordinaryMovement: [], failures: [] };
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
fs.mkdirSync(path.dirname(output), { recursive: true });

function pointSegmentSquared(point, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  return (point.x - from.x - t * dx) ** 2 + (point.y - from.y - t * dy) ** 2;
}
function graph(game) {
  const step = 32, padding = 4, border = game.player.radius + 20, radius = game.player.radius + padding;
  const cols = Math.floor((game.world.width - 2 * border) / step) + 1, rows = Math.floor((game.world.height - 2 * border) / step) + 1;
  const point = id => ({ x: border + id % cols * step, y: border + Math.floor(id / cols) * step });
  const inside = p => p.x >= border && p.y >= border && p.x <= game.world.width - border && p.y <= game.world.height - border;
  const clear = (a, b, sweptRadius = radius) => inside(a) && inside(b) && game.obstacles.every(rock => pointSegmentSquared(rock, a, b) >= (rock.radius + sweptRadius) ** 2 - 1e-9);
  const nearest = p => Math.max(0, Math.min(rows - 1, Math.round((p.y - border) / step))) * cols + Math.max(0, Math.min(cols - 1, Math.round((p.x - border) / step)));
  const start = nearest(game.spawn); assert.ok(clear(game.spawn, point(start)), 'Spawn has a true clear edge into the graph');
  const parents = new Int32Array(cols * rows).fill(-2), queue = [start]; parents[start] = -1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor], col = id % cols, row = Math.floor(id / cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = col + dc, r = row + dr, next = r * cols + c;
      if (c < 0 || r < 0 || c >= cols || r >= rows || parents[next] !== -2 || !clear(point(id), point(next))) continue;
      parents[next] = id; queue.push(next);
    }
  }
  const connect = target => {
    const id = nearest(target), col = id % cols, row = Math.floor(id / cols), candidates = [];
    for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) {
      const c = col + dc, r = row + dr, next = r * cols + c;
      if (c < 0 || r < 0 || c >= cols || r >= rows || parents[next] === -2) continue;
      const p = point(next), distance = Math.hypot(p.x - target.x, p.y - target.y);
      if (distance <= 64 && clear(p, target)) candidates.push({ id: next, distance });
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0]?.id ?? null;
  };
  const pathTo = target => {
    let id = connect(target); assert.notEqual(id, null, 'Target center connects to a reachable node'); const route = [];
    while (id !== -1) { route.push(point(id)); id = parents[id]; }
    return [game.spawn, ...route.reverse(), { x: target.x, y: target.y }];
  };
  return { clear, connect, pathTo, reached: queue.length, nodes: cols * rows };
}
function targets(game) { return [...game.salvage.sources, ...game.salvage.exits, game.salvage.hotCargo, game.salvage.comms, ...game.stations, ...game.crates]; }
function auditLoop(game, geometry, route, radius, label) {
  assert.ok(route.length >= 2, label + ' has an actual patrol path');
  let accessPoints = 0, minRockClearance = Infinity;
  for (const [index, from] of route.entries()) {
    const to = route[(index + 1) % route.length];
    assert.ok(geometry.clear(from, to, radius + 4), `${label}: complete segment ${index} has actual swept-body clearance`);
    minRockClearance = Math.min(minRockClearance, ...game.obstacles.map(rock => Math.sqrt(pointSegmentSquared(rock, from, to)) - rock.radius - radius));
    const subdivisions = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 16));
    for (let at = 0; at <= subdivisions; at++) {
      const p = { x: from.x + (to.x - from.x) * at / subdivisions, y: from.y + (to.y - from.y) * at / subdivisions };
      assert.notEqual(geometry.connect(p), null, `${label}: player can reach segment ${index} point ${at}`); accessPoints++;
    }
  }
  return { radius, segments: route.length, accessPoints, minRockClearance: round(minRockClearance), path: route.map(point => ({ x: point.x, y: point.y })) };
}
function audit(seed, sectorId) {
  const game = new Game({ mode: 'salvage', seed, sectorId }); game.start();
  const geometry = graph(game), checked = [];
  assert.equal(targets(game).length, 18);
  for (const target of targets(game)) {
    assert.notEqual(geometry.connect(target), null, `Seed ${seed}: ${target.name || target.kind || target.type} ${target.id} (${target.x},${target.y}) center is reachable`);
    const minRockClearance = Math.min(...game.obstacles.map(rock => Math.hypot(target.x - rock.x, target.y - rock.y) - rock.radius - game.player.radius));
    checked.push({ id: target.id, kind: target.kind || target.type, x: target.x, y: target.y, minRockClearance: round(minRockClearance) });
  }
  assert.equal(game.salvage.nodes.length, 3);
  const nodes = game.salvage.nodes.map(node => {
    assert.notEqual(geometry.connect(node), null, 'Node core is reachable by ordinary player movement');
    const others = [...targets(game), ...game.battlefield.props, ...game.salvage.nodes.filter(other => other !== node)];
    const minCenterDistance = Math.min(...others.map(other => Math.hypot(node.x - other.x, node.y - other.y)));
    const minBodyGap = Math.min(...others.map(other => Math.hypot(node.x - other.x, node.y - other.y) - node.radius - other.radius));
    assert.ok(minCenterDistance >= 90 - 1e-9, 'Node centers are at least 90px from other fixed objects');
    assert.ok(minBodyGap >= game.player.radius + 4 - 1e-9, 'Node and existing object footprints leave player-radius approach clearance');
    const minRockClearance = Math.min(...game.obstacles.map(rock => Math.hypot(node.x - rock.x, node.y - rock.y) - rock.radius - game.player.radius));
    return { id: node.id, kind: node.kind, x: node.x, y: node.y, minCenterDistance: round(minCenterDistance), minBodyGap: round(minBodyGap), minRockClearance: round(minRockClearance) };
  });
  const drone = game.salvage.sources.find(source => source.kind === 'drone'), droneLoop = auditLoop(game, geometry, drone.path, drone.radius, 'Drone');
  const elite = game.enemies.find(enemy => enemy.id === game.salvage.hunt.enemyId);
  assert.ok(elite?.salvageHunt && elite.radius > 0, 'Actual start spawns the patrol with its real body radius');
  const patrol = { type: elite.type, ...auditLoop(game, geometry, game.salvage.hunt.path, elite.radius, 'Elite patrol') };
  const lastChanceRoutes = game.salvage.exits.map((_, index) => {
    const called = new Game({ mode: 'salvage', seed, sectorId }); called.start();
    const exit = called.salvage.exits[index]; Object.assign(called.player, { x: exit.x, y: exit.y });
    assert.ok(called.interact(), 'Geometry fixture calls the actual exit interaction');
    const chance = called.salvage.lastChance; assert.ok(chance, `Seed ${seed}: optional offer exists at exit ${index}`);
    assert.notEqual(geometry.connect(chance), null, 'Future cargo connects to the spawn graph');
    assert.ok(geometry.clear(exit, chance), 'A complete independently swept route connects exit and cargo');
    assert.ok(Math.hypot(chance.x - exit.x, chance.y - exit.y) > exit.radius + 94, 'Cargo collection stays outside boarding circle');
    assert.ok([...called.salvage.sources, called.salvage.hotCargo, called.salvage.comms, ...called.stations, ...called.crates]
      .every(target => Math.hypot(chance.x - target.x, chance.y - target.y) > 188), 'Collection circle does not overlap other interaction circles');
    return { exitId: exit.id, x: chance.x, y: chance.y, remaining: chance.remaining, value: chance.value };
  });
  const geometrySha256 = hash(JSON.stringify({ obstacles: game.obstacles, sources: game.salvage.sources, exits: game.salvage.exits, cargo: game.salvage.hotCargo, comms: game.salvage.comms, stations: game.stations, crates: game.crates, nodes: game.salvage.nodes, patrol: game.salvage.hunt.path }));
  const minClearance = Math.min(...checked.map(target => target.minRockClearance), ...nodes.map(node => node.minRockClearance), droneLoop.minRockClearance, patrol.minRockClearance);
  return { sectorId, seed, obstacles: game.obstacles.length, geometrySha256, reachedNodes: geometry.reached, totalNodes: geometry.nodes, targets: checked, nodes, lastChanceRoutes, droneAccessPoints: droneLoop.accessPoints, droneMinClearance: droneLoop.minRockClearance, droneLoop, patrol, minClearance };
}
function walkLayout(seed, sectorId) {
  const game = new Game({ mode: 'salvage', seed, sectorId }); game.start();
  const elite = game.enemies.find(enemy => enemy.id === game.salvage.hunt.enemyId), patrolRadius = elite.radius;
  game.salvage.pending = []; game.enemies = [];
  const geometry = graph(game), initial = { hp: game.player.hp, speed: game.player.speed, radius: game.player.radius, damage: game.player.damageMultiplier }, walked = [];
  const walk = (route, label) => {
    const started = game.elapsed; let frames = 0;
    for (const destination of route) while (Math.hypot(destination.x - game.player.x, destination.y - game.player.y) > .01) {
      assert.ok(frames++ < 60000, `Actual walk does not stall: seed ${seed} ${label}`);
      const dx = destination.x - game.player.x, dy = destination.y - game.player.y, length = Math.hypot(dx, dy), divisor = Math.max(length, game.player.speed / 60);
      game.update(1 / 60, { moveX: dx / divisor, moveY: dy / divisor });
      assert.equal(game.phase, 'playing'); assert.equal(game.player.hp, initial.hp);
    }
    walked.push({ label, frames, seconds: round(game.elapsed - started), x: round(game.player.x), y: round(game.player.y) });
  };
  for (const target of [...targets(game), ...game.salvage.nodes]) {
    // Return by actual walking before taking a new spawn-rooted graph path.
    if (walked.length) walk(geometry.pathTo({ x: game.player.x, y: game.player.y }).reverse(), 'walk-back-to-spawn');
    const destination = { x: target.x, y: target.y };
    walk(geometry.pathTo(destination), `reach-${target.kind || target.type}-${target.id}`);
    assert.ok(Math.hypot(destination.x - game.player.x, destination.y - game.player.y) < .01);
  }
  walk(geometry.pathTo({ x: game.player.x, y: game.player.y }).reverse(), 'walk-back-to-spawn');
  const drone = game.salvage.sources.find(source => source.kind === 'drone'); walk(geometry.pathTo(drone.path[0]), 'reach-drone-path');
  walk([...drone.path.slice(1), drone.path[0]], 'walk-complete-drone-loop');
  let waitFrames = 0;
  while (Math.hypot(drone.x - game.player.x, drone.y - game.player.y) > 60 && waitFrames++ < 1800) game.update(1 / 60, {});
  const actualDroneDistance = Math.hypot(drone.x - game.player.x, drone.y - game.player.y);
  assert.ok(actualDroneDistance <= 60, 'Actual flying drone reaches the normally walked path point');
  walk(geometry.pathTo({ x: game.player.x, y: game.player.y }).reverse(), 'walk-back-to-spawn');
  walk(geometry.pathTo(game.salvage.hunt.path[0]), 'reach-elite-patrol-path');
  walk([...game.salvage.hunt.path.slice(1), game.salvage.hunt.path[0]], 'walk-complete-elite-patrol-loop');
  assert.equal(game.player.speed, initial.speed); assert.equal(game.player.damageMultiplier, initial.damage); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.alarm, 0);
  assert.ok(game.salvage.nodes.every(node => node.status === 'idle'), 'Walking never wakes a node');
  return { sectorId, seed, fixture: 'enemies/pending removed once; original-stat Game.update analog movement, no teleport/dash/fire/EMP', patrolRadius, initial, ending: { hp: game.player.hp, speed: game.player.speed, damage: game.player.damageMultiplier, phase: game.phase, status: game.salvage.status }, gameSeconds: round(game.elapsed), actualDroneDistance: round(actualDroneDistance), waitFrames, walked };
}

try {
  assert.ok(sectors.length, '--sector must be scrapyard, frostport, stormcity, or all');
  const seeds = new Set([0, 1, 2, 17, 731, 912, 65535, 65536, 2147483647, 2147483648, 4294967294, 4294967295]); let state = 0xC0FFEE;
  while (seeds.size < 256) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; seeds.add(state); }
  report.seedSamples = [...seeds];
  for (const sectorId of sectors) {
    for (const seed of seeds) { try { report.seeds.push(audit(seed, sectorId)); } catch (error) { report.failures.push({ sectorId, seed, error: error.stack }); } }
    const samples = report.seeds.filter(item => item.sectorId === sectorId), narrowest = samples.toSorted((a, b) => a.minClearance - b.minClearance)[0];
    const ordinaryMovementSeeds = [...new Set([0, 4294967295, ...(narrowest ? [narrowest.seed] : [])])];
    report.sectorResults.push({ sectorId, samples: samples.length, distinctGeometry: new Set(samples.map(item => item.geometrySha256)).size, narrowest: narrowest?.seed, minClearance: narrowest?.minClearance, ordinaryMovementSeeds });
    for (const seed of ordinaryMovementSeeds) { try { report.ordinaryMovement.push(walkLayout(seed, sectorId)); } catch (error) { report.failures.push({ sectorId, seed, movement: true, error: error.stack }); } }
  }
  report.distinctGeometry = new Set(report.seeds.map(item => item.geometrySha256)).size;
  assert.equal(hash(fs.readFileSync(enginePath)), engineSha256, 'Frozen engine changed during layout audit');
  assert.equal(hash(fs.readFileSync(__filename)), report.scriptSha256, 'Audit script changed during layout audit');
  assert.equal(report.seeds.length, sectors.length * 256); assert.equal(report.failures.length, 0, 'See the report for every failed seed or ordinary walk');
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { report.elapsedSeconds = round((performance.now() - started) / 1000); save(); }
console.log(JSON.stringify({ pass: !report.failure, seeds: report.seeds.length, sectorResults: report.sectorResults, distinctGeometry: report.distinctGeometry, movement: report.ordinaryMovement.length, elapsedSeconds: report.elapsedSeconds, failures: report.failures.length,
  examples: report.failures.slice(0, 3).map(item => ({ sectorId: item.sectorId, seed: item.seed, movement: !!item.movement, error: item.error.split('\n')[0] })), failure: report.failure?.split('\n')[0], output }));
