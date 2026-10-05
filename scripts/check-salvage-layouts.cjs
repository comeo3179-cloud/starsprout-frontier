'use strict';

// Independent geometry audit. No protected-point rules or engine collision
// helpers are reused. Ordinary movement below is an enemy-free layout fixture.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), enginePath = path.join(root, 'action-engine.js'), { Game } = require(enginePath);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), round = number => +number.toFixed(4);
const output = path.join(root, 'reports/expansion-6-7/salvage-layout-audit.json'), engineSha256 = hash(fs.readFileSync(enginePath));
const report = { generatedAt: new Date().toISOString(), engineSha256, scriptSha256: hash(fs.readFileSync(__filename)),
  method: '256 unique uint32 seed samples, independent 32px cardinal grid with player radius16+4px rock padding and radius+20 world border. Every traversed edge is checked by independently computed segment-circle clearance, not just passable endpoints. Every target center connects by a clear segment to the spawn-connected graph. Drone entire closed path tested for its radius25 plus4px, and player access sampled at <=16px along each segment. Three selected layouts walked by original-stat Game.update normal analog movement; enemies/pending removed once, real cover/fields/sources remain, no teleport/buff/clear cover/dash/shoot. Geometric reachability fixtures, NOT natural victories or proof for all 2^32 seeds.',
  seeds: [], ordinaryMovement: [], failures: [] };
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
function targets(game) { return [...game.salvage.sources, ...game.salvage.exits, ...game.stations, ...game.crates]; }
function audit(seed) {
  const game = new Game({ mode: 'salvage', seed }), geometry = graph(game), checked = [];
  assert.equal(targets(game).length, 16);
  for (const target of targets(game)) {
    assert.notEqual(geometry.connect(target), null, `Seed ${seed}: ${target.name || target.kind || target.type} center is reachable`);
    const minRockClearance = Math.min(...game.obstacles.map(rock => Math.hypot(target.x - rock.x, target.y - rock.y) - rock.radius - game.player.radius));
    checked.push({ id: target.id, kind: target.kind || target.type, x: target.x, y: target.y, minRockClearance: round(minRockClearance) });
  }
  const drone = game.salvage.sources.find(source => source.kind === 'drone'); let droneAccessPoints = 0, droneMinClearance = Infinity;
  for (const [index, from] of drone.path.entries()) {
    const to = drone.path[(index + 1) % drone.path.length];
    assert.ok(geometry.clear(from, to, drone.radius + 4), `Seed ${seed}: complete drone segment ${index} has swept-body clearance`);
    droneMinClearance = Math.min(droneMinClearance, ...game.obstacles.map(rock => Math.sqrt(pointSegmentSquared(rock, from, to)) - rock.radius - drone.radius));
    const subdivisions = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 16);
    for (let at = 0; at <= subdivisions; at++) {
      const p = { x: from.x + (to.x - from.x) * at / subdivisions, y: from.y + (to.y - from.y) * at / subdivisions };
      assert.notEqual(geometry.connect(p), null, `Seed ${seed}: player can reach drone path segment ${index} point ${at}`); droneAccessPoints++;
    }
  }
  const geometrySha256 = hash(JSON.stringify({ obstacles: game.obstacles, sources: game.salvage.sources, exits: game.salvage.exits, stations: game.stations, crates: game.crates }));
  return { seed, obstacles: game.obstacles.length, geometrySha256, reachedNodes: geometry.reached, totalNodes: geometry.nodes, targets: checked, droneAccessPoints, droneMinClearance: round(droneMinClearance) };
}
function walkLayout(seed) {
  const game = new Game({ mode: 'salvage', seed }); game.start(); game.salvage.pending = []; game.enemies = [];
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
  for (const target of targets(game)) {
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
  assert.equal(game.player.speed, initial.speed); assert.equal(game.player.damageMultiplier, initial.damage); assert.equal(game.salvage.carried, 0); assert.equal(game.salvage.alarm, 0);
  return { seed, initial, ending: { hp: game.player.hp, speed: game.player.speed, damage: game.player.damageMultiplier, phase: game.phase, status: game.salvage.status }, gameSeconds: round(game.elapsed), actualDroneDistance: round(actualDroneDistance), waitFrames, walked };
}

try {
  const seeds = new Set([0, 1, 2, 17, 731, 912, 65535, 65536, 2147483647, 2147483648, 4294967294, 4294967295]); let state = 0xC0FFEE;
  while (seeds.size < 256) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; seeds.add(state); }
  for (const seed of seeds) { try { report.seeds.push(audit(seed)); } catch (error) { report.failures.push({ seed, error: error.stack }); } }
  const narrowest = report.seeds.toSorted((a, b) => Math.min(...a.targets.map(target => target.minRockClearance), a.droneMinClearance) - Math.min(...b.targets.map(target => target.minRockClearance), b.droneMinClearance))[0];
  report.distinctGeometry = new Set(report.seeds.map(item => item.geometrySha256)).size;
  report.narrowest = narrowest?.seed;
  for (const seed of new Set([0, 4294967295, narrowest?.seed])) { try { report.ordinaryMovement.push(walkLayout(seed)); } catch (error) { report.failures.push({ seed, movement: true, error: error.stack }); } }
  assert.equal(report.seeds.length, 256); assert.deepEqual(report.failures, []);
  assert.equal(hash(fs.readFileSync(enginePath)), engineSha256, 'Frozen engine changed during layout audit');
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally { save(); }
console.log(JSON.stringify({ pass: !report.failure, seeds: report.seeds.length, distinctGeometry: report.distinctGeometry, movement: report.ordinaryMovement.length, failures: report.failures, output }));
