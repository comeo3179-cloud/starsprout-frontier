'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['action-renderer.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
const Renderer = sandbox.window.ExpeditionRenderer;

function renderer(reducedMotion = false) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length > 0); Object.assign(state, stack.pop()); };
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0, 'Nonnegative radius');
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  return Object.assign(Object.create(Renderer.prototype), { ctx, calls, stack, reducedMotion, time: .2, mapId: 'nexus', scale: .65, width: 667, height: 375,
    camera: { x: 900, y: 700 }, world: { width: 1800, height: 1400 }, particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0 });
}

test('nexus anchor geometry matches its collision radius and shield links require a living owner', () => {
  const r = renderer(), boss = { id: 8, type: 'boss', variant: 'nexus', x: 900, y: 500, radius: 52, hp: 2000, maxHp: 3000, shielded: true };
  const anchor = { id: 9, type: 'anchor', anchorBossId: 8, x: 650, y: 600, radius: 28, hp: 360, maxHp: 360 };
  const game = { enemies: [boss, anchor] }, before = JSON.stringify(game);
  r.drawNexusEnemy(anchor);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 28));
  assert.ok(!r.calls.some(c => c.key === 'fillText'), 'Anchor text is deferred until after actors');
  r.calls.length = 0; r.drawNexusLinks(game);
  assert.equal(r.calls.filter(c => c.key === 'lineTo').length, 1);
  assert.ok(r.calls.filter(c => c.key === 'stroke').every(c => c.alpha <= .35));
  assert.equal(JSON.stringify(game), before);
  for (const change of [{ hp: 0 }, { shielded: false }]) {
    const g = { enemies: [{ ...boss, ...change }, anchor] }; r.calls.length = 0; r.drawNexusLinks(g);
    assert.equal(r.calls.filter(c => c.key === 'lineTo').length, 0);
  }
  r.calls.length = 0; r.drawNexusLinks({ enemies: [boss, { ...anchor, hp: 0 }] });
  assert.equal(r.calls.filter(c => c.key === 'lineTo').length, 0); assert.equal(r.stack.length, 0);
});

test('nexus telegraphs retain circle, annulus and capsule boundaries with low-opacity fills', () => {
  for (const hazard of [
    { type: 'blast', radius: 100 },
    { type: 'ring', radius: 280, innerRadius: 145 },
    { type: 'lane', radius: 36, length: 340, angle: 1.2 }
  ]) {
    const r = renderer(), h = { x: 900, y: 650, duration: 1.4, remaining: .2, owner: 'enemy', ...hazard }, before = JSON.stringify(h);
    r.drawHazard(h);
    assert.equal(JSON.stringify(h), before); assert.equal(r.stack.length, 0);
    assert.ok(r.calls.filter(c => c.key === 'fill').every(c => c.alpha <= .11));
    assert.ok(!r.calls.some(c => c.key === 'fillText'), 'No pre-actor warning text');
    if (hazard.type === 'lane') assert.ok(r.calls.some(c => c.key === 'roundRect' && c.args[0] === -36 && c.args[2] === 412 && c.args[3] === 72));
    else assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === hazard.radius));
    if (hazard.type === 'ring') {
      assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 145));
      assert.ok(r.calls.some(c => c.key === 'fill' && c.args[0] === 'evenodd'));
      assert.ok(r.stormHazardLabels.some(label => label.text === '内圈安全'));
    }
  }
});

test('nexus art and doctrine badges do not mutate game state or add motion in reduced-motion mode', () => {
  const first = renderer(true), second = renderer(true); second.time = 91;
  const game = { spawn: { x: 900, y: 1150 } };
  const enemies = [
    { type: 'boss', variant: 'nexus', id: 8, x: 900, y: 620, radius: 52, hp: 2000, maxHp: 3000, shielded: true, windup: .5 },
    { type: 'boss', variant: 'nexus', id: 8, x: 900, y: 620, radius: 52, hp: 2000, maxHp: 3000, shielded: false, recoveryTimer: 1 },
    { type: 'anchor', id: 9, x: 650, y: 600, radius: 28, hp: 180, maxHp: 360 }
  ];
  const before = JSON.stringify({ game, enemies });
  for (const r of [first, second]) {
    r.paintNexusTerrain(game); r.drawRock({ x: 1200, y: 750, radius: 32 });
    for (const enemy of enemies) r.drawEnemy(enemy);
    assert.equal(r.stack.length, 0);
  }
  assert.deepEqual(first.calls, second.calls); assert.equal(JSON.stringify({ game, enemies }), before);
  const p = { x: 900, y: 700, hp: 120, maxHp: 120, angle: 0, weapon: 0, dashTimer: 0 }, original = JSON.stringify(p);
  for (const [doctrineId, color] of Object.entries({ skirmisher: '#8cf5d3', marksman: '#ffd18c', conductor: '#c9b3ff' })) {
    const r = renderer(); r.recoil = 0; r.doctrineId = doctrineId; r.drawPlayer(p);
    assert.ok(r.calls.some(c => c.key === 'fillRect' && c.fill === color));
    assert.ok(r.calls.some(c => c.key === 'stroke' && c.stroke === color));
    assert.equal(JSON.stringify(p), original); assert.equal(r.stack.length, 0);
  }
});

test('nexus bullet-ring telegraph previews the real spoke count and attack offset', () => {
  for (const stage of [1, 2]) {
    const r = renderer(true), count = stage === 2 ? 20 : 16;
    r.drawEnemy({ type: 'boss', variant: 'nexus', id: 8, x: 900, y: 620, radius: 52, hp: 2000, maxHp: 3000, shielded: false,
      stage, windup: .8, attackKind: 'nexus-ring', attackCount: 3 });
    const points = r.calls.filter(c => c.key === 'arc' && c.args[2] === 2.5);
    assert.equal(points.length, count);
    for (let i = 0; i < count; i++) {
      assert.ok(Math.abs(points[i].args[0] - Math.cos(i * Math.PI * 2 / count + .54) * 66) < 1e-9);
      assert.ok(Math.abs(points[i].args[1] - Math.sin(i * Math.PI * 2 / count + .54) * 66) < 1e-9);
    }
  }
});

test('nexus labels render above actors and avoid HUD panels, the player and other labels', () => {
  const r = renderer(true), player = { x: 900, y: 700, hp: 120, maxHp: 120, dashTimer: 0 };
  const game = { map: { id: 'nexus' }, world: r.world, campaign: { doctrineId: 'conductor' }, player,
    hazards: [{ x: 850, y: 620, radius: 200, innerRadius: 90, remaining: .7, duration: 1.35, type: 'ring' }], obstacles: [],
    enemies: [{ id: 8, type: 'boss', variant: 'nexus', x: 960, y: 650, radius: 52, hp: 2000, maxHp: 3000, shielded: true, windup: .8, attackKind: 'nexus-ring', attackCount: 3 },
      { id: 9, type: 'anchor', anchorBossId: 8, x: 750, y: 675, radius: 28, hp: 300, maxHp: 360 }] };
  Object.assign(r, { terrainKey: 'nexus:1800:1400', lastPlayer: player, lastPosition: { ...player }, dpr: 1, shakeX: 0, shakeY: 0, dashTrailTimer: 0,
    pointerHud: { blocks: [{ left: 410, right: 667, top: 0, bottom: 130 }] } });
  for (const method of ['drawTerrain', 'updatePointerHud', 'updateEffects', 'drawVignette', 'drawObjectivePointers']) r[method] = () => {};
  r.drawPlayer = () => { r.ctx.fillStyle = '#player'; r.ctx.fillRect(890, 690, 20, 20); };
  const before = JSON.stringify(game); r.render(game, 0);
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  const actor = r.calls.findIndex(c => c.key === 'fillRect' && c.fill === '#player');
  const texts = r.calls.map((c, i) => c.key === 'fillText' ? i : -1).filter(i => i >= 0);
  assert.ok(texts.length > 0 && texts.every(i => i > actor));
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const point = r.encounterPlayerPoint, blocks = [...r.pointerHud.blocks, ...r.nexusLabelBlocks, { left: point.x - 25, right: point.x + 29, top: point.y - 27, bottom: point.y + 27 }];
  r.encounterLabelRects.forEach((label, i) => {
    assert.ok(blocks.every(block => !overlaps(label, block)));
    assert.ok(r.encounterLabelRects.slice(i + 1).every(other => !overlaps(label, other)));
  });
});

test('campaign effects remain bounded and new sounds are distinguishable, throttled and muteable', () => {
  const r = renderer(true);
  for (let i = 0; i < 200; i++) r.consume([{ type: 'anchor-break', x: 750, y: 600 }, { type: 'nexus-shield-break', x: 900, y: 500 }]);
  assert.ok(r.particles.length <= 420 && r.rings.length <= 20); assert.equal(r.shake, 0); assert.ok(r.rings.every(ring => !ring.fill));
  const audio = new sandbox.window.FrontierAudio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' };
  audio.note = (...args) => sounds.push(['note', ...args]); audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const type of ['campaign-rest', 'campaign-stage', 'campaign-complete', 'anchor-break', 'nexus-shield-break']) {
    sounds.length = 0; audio.context.currentTime += 1; audio.play(type); assert.ok(sounds.length > 0);
    signatures.add(JSON.stringify(sounds));
    assert.ok(sounds.every(sound => sound[0] === 'note' ? sound[4] <= .07 : sound[3] <= .07));
    const count = sounds.length; audio.play(type); assert.equal(sounds.length, count);
    audio.enabled = false; audio.context.currentTime += 1; audio.play(type); assert.equal(sounds.length, count); audio.enabled = true;
  }
  assert.equal(signatures.size, 5);
});

test('nexus objective arrows move to a clear screen edge and respect safe areas as a whole circle', () => {
  const r = renderer(); r.width = 844; r.height = 390;
  r.pointerHud = { safe: { left: 44, right: 44, top: 0, bottom: 21 }, blocks: [
    { left: 52, right: 202, top: 8, bottom: 116 },
    { left: 214, right: 610, top: 62, bottom: 118 },
    { left: 620, right: 792, top: 8, bottom: 90 },
    { left: 56, right: 145, top: 281, bottom: 369 },
    { left: 145, right: 792, top: 299, bottom: 369 }
  ] };
  r.encounterPlayerPoint = { x: 422, y: 195 };
  const before = JSON.stringify(r.pointerHud), point = r.nexusPointerPosition(343, 92);
  assert.ok(point && (point.x === 64 || point.x === 780 || point.y === 20 || point.y === 349));
  assert.ok((point.x - 422) * (343 - 422) + (point.y - 195) * (92 - 195) >= 0, 'A clear edge toward the target is preferred over the opposite side');
  assert.ok(point.x - 14 >= 44 && point.x + 14 <= 800 && point.y - 14 >= 0 && point.y + 14 <= 369);
  assert.ok(r.pointerHud.blocks.every(b => point.x - 14 >= b.right + 4 || point.x + 14 <= b.left - 4 || point.y - 14 >= b.bottom + 4 || point.y + 14 <= b.top - 4));
  assert.equal(JSON.stringify(r.pointerHud), before);
  r.pointerHud.blocks = [{ left: 0, right: 844, top: 0, bottom: 390 }];
  assert.equal(r.nexusPointerPosition(343, 92), null);
});

test('sector transition effect reset invalidates the previous HUD geometry before its first render', () => {
  const r = renderer(); r.pointerHudTime = r.time;
  r.pointerHud = { blocks: [{ left: 200, right: 500, top: 20, bottom: 40 }] };
  r.resetEffects();
  assert.equal(r.pointerHudTime, -1, 'The first render must remeasure the new boss panel and arrival notice');
});
