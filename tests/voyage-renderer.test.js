'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['action-renderer.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);

function fixture(reducedMotion = false) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length); Object.assign(state, stack.pop()); };
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0);
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  const renderer = Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion,
    time: 0, mapId: 'voyage-cosmos', scale: .65, width: 844, height: 390, camera: { x: 850, y: 600 }, world: { width: 1700, height: 1200 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0,
    pointerHud: { right: 640, topBottom: 90, bottom: 270, blocks: [], safe: {} } });
  renderer.updatePointerHud = () => {};
  const game = { phase: 'playing', player: { x: 850, y: 600 }, enemies: [], voyage: { room: { id: 'voyage-1-calm', biome: 'cosmos', collectors: [], portals: [], exit: null }, effects: {} } };
  return { renderer, game };
}

test('harvest collectors outline the actual charging radius without an opaque area or duplicate enemy rendering', () => {
  const { renderer: r, game: g } = fixture();
  g.voyage.room.collectors = [{ id: 1, x: 850, y: 600, radius: 185, goal: 4, charge: 2, status: 'charging' }];
  const before = JSON.stringify(g); r.drawVoyageRoom(g);
  assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === 185));
  assert.ok(!r.calls.some(call => call.key === 'fill' && call.fill === '#7ad7bf77'));
  assert.equal(r.calls.filter(call => call.key === 'fill' && call.fill === '#cef7bc').length, 2, 'Two of four energy pips are charged');
  assert.ok(r.stormHazardLabels.some(label => label.text === '圈内击杀充能 · 2/4'));
  assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
});

test('the gate distinguishes locked and ready states and is omitted after the intermission starts', () => {
  const { renderer: r, game: g } = fixture(); g.player = { x: 700, y: 600 }; g.voyage.room.exit = { x: 850, y: 600, radius: 36, ready: false };
  r.drawVoyageRoom(g); assert.ok(r.stormHazardLabels.some(label => label.text === '跃迁门 · 完成目标后开启'));
  r.calls.length = 0; r.stormHazardLabels = []; g.voyage.room.exit.ready = true; r.drawVoyageRoom(g);
  assert.ok(r.calls.some(call => call.key === 'stroke' && call.stroke === '#b9fae1')); assert.ok(r.stormHazardLabels.some(label => label.text === '进入跃迁门'));
  g.phase = 'voyage-rest'; r.calls.length = 0; r.drawVoyageRoom(g); assert.equal(r.calls.length, 0);
});

test('tail fields retain engine endpoints and capsule bounds; wells and sentries remain in world positions when player moves', () => {
  const { renderer: r, game: g } = fixture(true); g.voyage.effects = {
    trails: [{ x: 700, y: 580, endX: 900, endY: 580, width: 24, remaining: 1.2, duration: 2 }],
    well: { x: 750, y: 700, radius: 125, remaining: 1.3, duration: 2.6 },
    sentry: { x: 920, y: 690, radius: 14, remaining: 1.5, duration: 3, shots: 1, maxShots: 2 }, mirrorTimer: 1, needleTimer: 1, batteryTimer: 1, batteryCharges: 2 };
  for (const [x, y] of [[850, 600], [1000, 700]]) {
    g.player = { x, y }; r.calls.length = 0; const before = JSON.stringify(g); r.drawVoyageFields(g);
    assert.ok(r.calls.some(call => call.key === 'roundRect' && JSON.stringify(call.args) === JSON.stringify([-12, -12, 224, 24, 12])));
    assert.ok(r.calls.some(call => call.key === 'lineTo' && call.args[0] === 200 && call.args[1] === 0));
    assert.ok(r.calls.some(call => call.key === 'translate' && call.args[0] === 750 && call.args[1] === 700));
    assert.ok(r.calls.some(call => call.key === 'translate' && call.args[0] === 920 && call.args[1] === 690));
    assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === 125));
    assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
  }
});

test('voyage art and device fields have three distinct boss silhouettes and stay static under reduced motion', () => {
  const signatures = [];
  for (const stage of [1, 2, 3]) {
    const first = fixture(true), second = fixture(true); second.renderer.time = 99;
    for (const { renderer: r, game: g } of [first, second]) {
      g.voyage.effects = { well: { x: 700, y: 600, radius: 125, remaining: 1, duration: 2.6 } };
      g.voyage.room.exit = { x: 950, y: 600, radius: 36, ready: true };
      const enemy = { id: 5, type: 'boss', variant: 'voyage', x: 850, y: 600, radius: 44, hp: 2400, maxHp: 4800, stage, windup: .6, attackKind: 'voyage-lattice' };
      const before = JSON.stringify(enemy); r.drawVoyageEnemy(enemy); r.drawVoyageFields(g); r.drawVoyageRoom(g);
      assert.equal(JSON.stringify(enemy), before); assert.equal(r.stack.length, 0);
    }
    assert.deepEqual(first.renderer.calls, second.renderer.calls); signatures.push(JSON.stringify(first.renderer.calls));
  }
  assert.equal(new Set(signatures).size, 3);
});

test('teleport markers are informational and older visual-only charging lanes retain their actual geometry', () => {
  const { renderer: r } = fixture(true);
  r.drawHazard({ x: 900, y: 620, radius: 44, remaining: .5, duration: 1, visualOnly: true, voyageTeleport: true, type: 'blast' });
  assert.ok(r.stormHazardLabels.some(label => label.text === '折跃落点')); assert.ok(!r.calls.some(call => call.key === 'fill'));
  r.calls.length = 0; r.drawHazard({ x: 800, y: 610, radius: 22, length: 280, remaining: .4, duration: .72, visualOnly: true, type: 'charge' });
  assert.ok(r.calls.some(call => call.key === 'strokeRect' && JSON.stringify(call.args) === '[0,-22,280,44]'));
  assert.equal(r.stack.length, 0);
});

test('boss ring preview omits exactly the locked safe gap and uses the engine count and attack offset', () => {
  const { renderer: r } = fixture(true), enemy = { id: 5, x: 850, y: 600, radius: 44, hp: 3000, maxHp: 4800, stage: 1,
    windup: .7, attackKind: 'voyage-ring', ringGapAngle: 0, ringGapWidth: Math.PI / 6, ringStartAngle: 0, ringCount: 12 };
  const before = JSON.stringify(enemy); r.drawVoyageEnemy(enemy);
  const bullets = r.calls.filter(call => call.key === 'arc' && call.args[2] === 3);
  assert.equal(bullets.length, 11); assert.ok(bullets.every(call => Math.acos(Math.cos(Math.atan2(call.args[1], call.args[0]))) > Math.PI / 12));
  assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === 139 && call.args[3] === -Math.PI / 12 && call.args[4] === Math.PI / 12));
  assert.ok(r.stormHazardLabels.some(label => label.text === '弹环蓄势 · 穿过安全缺口'));
  enemy.ringStartAngle = .22; enemy.ringCount = 16; r.calls.length = 0; r.drawVoyageEnemy(enemy);
  const shifted = r.calls.filter(call => call.key === 'arc' && call.args[2] === 3);
  assert.ok(shifted.some(call => Math.abs(Math.atan2(call.args[1], call.args[0]) - (.22 + Math.PI / 8)) < 1e-9));
  enemy.ringStartAngle = 0; enemy.ringCount = 12; assert.equal(JSON.stringify(enemy), before); assert.equal(r.stack.length, 0);
});

test('one voyage pointer takes precedence over stale targets and avoids actual HUD blocks even with a living boss', () => {
  const { renderer: r, game: g } = fixture();
  r.pointerHud.blocks = [{ left: 600, right: 844, top: 0, bottom: 220 }, { left: 0, right: 844, top: 280, bottom: 390 }];
  r.targetRelay = { x: 30, y: 80, name: 'stale relay' }; r.targetContract = { x: 50, y: 90, name: 'stale contract' };
  g.enemies = [{ id: 9, type: 'boss', variant: 'voyage', hp: 100, x: 100, y: 20 }];
  g.voyageTarget = () => ({ x: 1680, y: 100, label: '跃迁门', kind: 'exit' });
  const before = JSON.stringify(g); r.drawObjectivePointers(g);
  assert.equal(r.calls.filter(call => call.key === 'arc' && call.args[2] === 12).length, 1);
  assert.ok(!r.calls.some(call => call.key === 'fillText' && String(call.args[0]).includes('stale')));
  for (const rect of r.nexusPointerRects) assert.ok(!r.pointerHud.blocks.some(block => rect.left < block.right && rect.right > block.left && rect.top < block.bottom && rect.bottom > block.top));
  assert.equal(JSON.stringify(g), before); assert.equal(r.stack.length, 0);
});

test('repeated voyage feedback remains bounded without extra shake, full-area flashes or trigger labels', () => {
  const { renderer: r } = fixture(true);
  for (let i = 0; i < 200; i++) r.consume(['voyage-device', 'voyage-resonance', 'voyage-objective', 'voyage-room', 'voyage-complete'].map(type => ({ type, x: 850, y: 600, endX: 1100, endY: 600, deviceId: 'afterimage', radius: 250 })));
  assert.ok(r.particles.length <= 420 && r.rings.length <= 20 && r.arcs.length <= 20); assert.equal(r.shake, 0); assert.equal(r.numbers.length, 0); assert.ok(r.rings.every(ring => !ring.fill));
});

test('voyage device and resonance cues are distinct, quiet, throttled and silent when muted', () => {
  const audio = new sandbox.window.FrontierAudio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' }; audio.note = (...args) => sounds.push(['note', ...args]); audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const deviceId of ['afterimage', 'needles', 'mirror', 'sentry', 'well', 'battery']) {
    sounds.length = 0; audio.context.currentTime += 1; audio.play('voyage-device', deviceId); assert.ok(sounds.length); signatures.add(JSON.stringify(sounds));
    assert.ok(sounds.every(sound => sound[4] <= .035)); const count = sounds.length; audio.play('voyage-device', deviceId); assert.equal(sounds.length, count);
  }
  assert.equal(signatures.size, 6); signatures.clear();
  for (const id of ['tail-collapse', 'cross-mirror', 'tidal-collapse']) { sounds.length = 0; audio.context.currentTime += 1; audio.play('voyage-resonance', id); assert.equal(sounds.length, 3); signatures.add(JSON.stringify(sounds)); }
  assert.equal(signatures.size, 3); audio.enabled = false; sounds.length = 0; audio.context.currentTime += 1; audio.play('voyage-device', 'well'); audio.play('voyage-complete'); assert.equal(sounds.length, 0);
});
