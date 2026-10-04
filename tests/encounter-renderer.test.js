'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: { devicePixelRatio: 1 } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);
const Renderer = sandbox.window.ExpeditionRenderer;

function drawing() {
  const calls = [], state = { globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000' }, stack = [];
  const ctx = new Proxy(state, { get(target, name) {
    if (name in target) return target[name];
    if (name === 'measureText') return text => ({ width: String(text).length * 7 });
    if (name === 'save') return () => stack.push({ ...state });
    if (name === 'restore') return () => Object.assign(state, stack.pop());
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), name + ' has a non-finite argument');
      if (name === 'arc') assert.ok(args[2] >= 0, 'Arc radius must remain non-negative');
      calls.push({ name, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  return { ctx, calls, stack };
}
function renderer(reducedMotion = false) {
  const audit = drawing();
  return Object.assign(Object.create(Renderer.prototype), { ...audit, reducedMotion, time: .5, scale: .7, width: 844, height: 390,
    camera: { x: 500, y: 500 }, world: { width: 3200, height: 2400 }, particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], shake: 0 });
}
function encounter(kind, status = 'active') {
  return { id: kind, kind, type: 'encounter', name: '测试' + kind, x: 500, y: 500, radius: 30,
    status, progress: 1, goal: kind === 'rings' ? 12 : 3, remaining: 26.4, duration: 45, activeNode: 1,
    nodes: kind === 'hunt' ? [] : [0, 1, 2].slice(0, kind === 'rings' ? 2 : 3).map(i => ({ x: 390 + i * 130, y: 570, radius: kind === 'rings' ? 85 : 36, collected: i === 0 && kind === 'race' })) };
}

test('encounter silhouettes remain distinct and all states draw finite coordinates without mutating gameplay', () => {
  const silhouettes = new Set();
  for (const kind of ['race', 'rings', 'hunt']) for (const status of ['idle', 'active', 'ready', 'complete', 'failed']) {
    const r = renderer(), e = encounter(kind, status), before = JSON.stringify(e);
    if (status === 'ready') r.interaction = { target: e, action: '领取' };
    r.drawEncounter(e, { x: 500, y: 500 }); r.drawEncounterFields(e, { x: 500, y: 500 });
    assert.equal(JSON.stringify(e), before); assert.equal(r.stack.length, 0);
    if (status === 'idle') silhouettes.add(JSON.stringify(r.calls.filter(call => call.name !== 'fillText')));
    if (status === 'failed') assert.ok(r.calls.some(call => call.alpha === .55), 'Failed device must visibly dim');
    if (status === 'ready') assert.ok(r.calls.some(call => call.name === 'fillText' && call.args[0].includes('回收奖励')));
  }
  assert.equal(silhouettes.size, 3);
});

test('active fields show numbered targets but detailed timers stay near the player and vanish after failure', () => {
  for (const kind of ['race', 'rings']) {
    const e = encounter(kind), near = renderer(), far = renderer(), failed = renderer();
    near.drawEncounterFields(e, { x: 520, y: 570 }); far.drawEncounterFields(e, { x: 2200, y: 2200 });
    assert.ok(near.calls.some(c => c.name === 'fillText' && String(c.args[0]).includes(kind === 'rings' ? '换环 4.0s' : '27s')));
    assert.ok(!far.calls.some(c => c.name === 'fillText' && String(c.args[0]).includes('s')));
    assert.ok(far.calls.some(c => c.name === 'fillText' && c.args[0] === '2'), 'Current node remains numbered');
    failed.drawEncounterFields({ ...e, status: 'failed' }, { x: 520, y: 570 }); assert.equal(failed.calls.length, 0);
    const fieldFill = near.calls.filter(c => c.name === 'fill' && /^#[0-9a-f]{6}13$/i.test(c.fill));
    assert.ok(fieldFill.length > 0, 'Active rings use a low-opacity fill');
  }
});

test('encounter labels avoid the player, HUD and one another without querying layout for each label', () => {
  const r = renderer(); let queries = 0;
  r.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }), parentElement: { querySelectorAll() { queries++; return []; } } };
  r.updatePointerHud(); const reads = queries;
  r.pointerHud.blocks = [{ left: 360, right: 480, top: 110, bottom: 150 }];
  r.encounterPlayerPoint = { x: 422, y: 195 };
  r.drawEncounterLabel('逐光回收', 500, 500, '#82efd0');
  r.drawEncounterLabel('回收奖励', 500, 500, '#82efd0');
  assert.equal(queries, reads);
  assert.equal(r.encounterLabelRects.length, 2);
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const rect of r.encounterLabelRects) {
    assert.ok(!overlap(rect, { left: 397, right: 451, top: 168, bottom: 222 }));
    assert.ok(!overlap(rect, r.pointerHud.blocks[0]));
  }
  assert.ok(!overlap(...r.encounterLabelRects));
});

test('a selected encounter target hidden under HUD still gets a direction pointer', () => {
  const r = renderer(); r.pointerHud = { right: 700, topBottom: 100, bottom: 260, blocks: [{ left: 200, right: 260, top: 300, bottom: 370 }] }; r.pointerHudTime = r.time;
  r.targetEncounter = { x: 500 + (230 - 422) / .7, y: 500 + (335 - 195) / .7, name: '遭遇目标', color: '#82efd0' };
  r.drawObjectivePointers({ player: { x: 500, y: 500 }, enemies: [] });
  assert.ok(r.calls.some(c => c.name === 'fillText' && c.args[0].startsWith('遭遇目标')));
  const unselected = renderer(); unselected.pointerHud = r.pointerHud; unselected.pointerHudTime = unselected.time;
  unselected.targetContract = r.targetEncounter; unselected.drawObjectivePointers({ player: { x: 500, y: 500 }, enemies: [] });
  assert.equal(unselected.calls.filter(c => c.name === 'fillText').length, 0, 'Unrelated target behavior stays unchanged');
});

test('the active ring warns about a switch 0.15 seconds away without mutating encounter time', () => {
  const r = renderer(true), e = encounter('rings'); e.elapsed = 3.85;
  r.drawEncounterFields(e, { x: 520, y: 570 });
  assert.ok(r.calls.some(c => c.name === 'fillText' && c.args[0].includes('换环 0.2s')));
  assert.equal(e.elapsed, 3.85);
});

test('reduced-motion encounter and tactical shapes stay static when only renderer time advances', () => {
  const first = renderer(true), second = renderer(true); second.time = 98;
  const game = { tactical: { decoy: { x: 510, y: 510, radius: 320, remaining: 1 }, mine: { x: 570, y: 530, radius: 70, remaining: 2.5 } } };
  for (const r of [first, second]) { r.drawEncounter(encounter('race', 'ready'), { x: 500, y: 500 }); r.drawTactics(game); assert.equal(r.stack.length, 0); }
  assert.deepEqual(first.calls, second.calls);
});

test('encounter and tactic event bursts obey existing budgets and reduced-motion particle counts', () => {
  const events = [
    ...['start', 'ready', 'failed', 'reward'].map(type => ({ type: 'encounter-' + type, kind: 'race', x: 10, y: 10 })),
    ...['decoy-dash', 'reload-mine', 'gravity-pulse'].map(tacticId => ({ type: 'tactic-trigger', tacticId, x: 10, y: 10, angle: 1, radius: 235,
      targets: [{ fromX: 100, fromY: 100, x: 50, y: 50 }] }))
  ];
  const normal = renderer(), calm = renderer(true); normal.consume(events); calm.consume(events);
  assert.ok(normal.particles.length > calm.particles.length); assert.equal(normal.numbers.length, 0); assert.equal(normal.shake, 0);
  assert.ok(normal.arcs.some(arc => arc.points[0][0] === 100 && arc.points.at(-1)[0] === 50), 'Gravity trail follows actual target displacement');
  for (let i = 0; i < 200; i++) normal.consume(events);
  assert.ok(normal.particles.length <= 420 && normal.rings.length <= 20 && normal.arcs.length <= 20);
  for (const arc of normal.arcs) for (const point of arc.points) assert.ok(point.every(Number.isFinite));
});

test('detailed minimap renders encounter status and current nodes; compact map omits detailed labels', () => {
  const game = { world: { width: 3200, height: 2400 }, player: { x: 500, y: 500 }, enemies: [], encounters: [encounter('race'), encounter('rings', 'ready'), encounter('hunt', 'failed')] };
  for (const detailed of [false, true]) {
    const r = renderer(), canvas = { width: 500, height: 340, getBoundingClientRect: () => ({ width: 500, height: 340 }), getContext: () => r.ctx };
    r.trackedEncounterId = 'race'; const before = JSON.stringify(game); r.drawMinimap(canvas, game, { detailed });
    assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
    const labels = r.calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
    if (detailed) { assert.ok(labels.includes('回收奖励')); assert.ok(labels.includes('挑战结束')); assert.ok(labels.includes('1/3 · 27s')); }
    else assert.equal(labels.length, 0);
  }
});

test('encounter guidance takes priority over contract and relay while keeping the existing HUD avoidance path', () => {
  const r = renderer(); r.pointerHud = { right: 660, topBottom: 110, bottom: 260 }; r.pointerHudTime = r.time;
  r.targetEncounter = { x: 2500, y: 500, name: '遭遇目标', color: '#82efd0' };
  r.targetContract = { x: 2500, y: 500, name: '旧支线' }; r.targetRelay = { x: 2500, y: 500, name: '主线' };
  r.drawObjectivePointers({ player: { x: 500, y: 500 }, enemies: [] });
  const labels = r.calls.filter(call => call.name === 'fillText').map(call => call.args[0]);
  assert.equal(labels.length, 1); assert.match(labels[0], /^遭遇目标/); assert.equal(r.stack.length, 0);
});
