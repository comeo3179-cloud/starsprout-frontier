'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const sandbox = { window: {} };
for (const file of ['action-renderer.js', 'audio.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);

function fixture(reducedMotion = true) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length); Object.assign(state, stack.pop()); };
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      if (key === 'arc') assert.ok(args[2] >= 0);
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha, lineWidth: ctx.lineWidth });
    };
  } });
  return Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion,
    time: 0, mapId: 'salvage', scale: .65, width: 844, height: 390, camera: { x: 1050, y: 1180 }, world: { width: 2600, height: 1900 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0,
    pointerHud: { blocks: [], right: 844, topBottom: 0, bottom: 355, safe: {} }, encounterLabelRects: [] });
}
function gameFixture() {
  return { phase: 'playing', map: { id: 'salvage' }, world: { width: 2600, height: 1900 }, terrainRevision: 1,
    player: { x: 1050, y: 1180, hp: 120, maxHp: 120 }, spawn: { x: 350, y: 1580 }, obstacles: [], enemies: [],
    salvage: { seed: 17, status: 'exploring', sources: [
      { id: 1, x: 630, y: 1430, kind: 'vault', name: '保险箱', radius: 26, hp: 90, maxHp: 90, status: 'locked', quietTimer: 0 },
      { id: 2, x: 1050, y: 1180, kind: 'drill', name: '采样井', radius: 28, status: 'idle', progress: 0, duration: 8, workRadius: 150 },
      { id: 3, x: 1860, y: 380, kind: 'drone', name: '运输机', radius: 25, hp: 90, maxHp: 90, status: 'flying', angle: 0,
        path: [{ x: 1860, y: 380 }, { x: 2310, y: 380 }, { x: 2310, y: 720 }, { x: 1860, y: 720 }] }
    ], exits: [{ id: 4, x: 260, y: 1650, radius: 100, name: '西接应点' }, { id: 5, x: 2320, y: 1700, radius: 100, name: '东接应点' }], evac: null }
  };
}

test('recovery sources have three distinct silhouettes without persistent text or gameplay mutation', () => {
  const game = gameFixture(), signatures = new Set();
  for (const source of game.salvage.sources) {
    const r = fixture(), second = fixture(); second.time = 100;
    const before = JSON.stringify(source); r.drawSalvageSource(source); second.drawSalvageSource(source);
    assert.deepEqual(r.calls, second.calls, 'Reduced motion leaves each silhouette static');
    assert.equal(JSON.stringify(source), before); assert.equal(r.stack.length, 0); assert.ok(!r.calls.some(c => c.key === 'fillText'));
    signatures.add(JSON.stringify(r.calls));
  }
  assert.equal(signatures.size, 3);
});

test('silent vault opening uses its real remaining window and never marks a broken lock silent', () => {
  const source = gameFixture().salvage.sources[0], r = fixture();
  Object.assign(source, { status: 'locked', quietTimer: 2 }); r.drawSalvageSource(source);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 34 && Math.abs(c.args[4] - Math.PI / 2) < 1e-9));
  assert.ok(r.calls.some(c => c.key === 'fill' && c.fill === '#e3f6cc'), 'Quiet open vault has recoverable cargo');
  r.calls.length = 0; Object.assign(source, { status: 'open', hp: 0, quietTimer: 0 }); r.drawSalvageSource(source);
  assert.ok(!r.calls.some(c => c.key === 'arc' && c.args[2] === 34));
  r.calls.length = 0; source.status = 'collected'; r.interaction = { target: source }; r.drawSalvageSource(source);
  assert.ok(!r.calls.some(c => c.key === 'fill' && c.fill === '#e3f6cc')); assert.equal(r.stack.length, 0);
  assert.ok(!r.calls.some(c => c.key === 'fillText'), 'Collected sources lose their action label');
});

test('drill work zones and ship boarding use real radii and cumulative progress without a fake arrival', () => {
  const game = gameFixture(), r = fixture(), drill = game.salvage.sources[1];
  drill.status = 'drilling'; drill.progress = 4; game.salvage.evac = { exitId: 4, remaining: 5, duration: 10, progress: 1.5, boardingDuration: 3 }; game.salvage.status = 'approaching';
  r.visible = () => true; const before = JSON.stringify(game); r.drawSalvageFields(game);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 150)); assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 44 && Math.abs(c.args[4] - Math.PI / 2) < 1e-9));
  assert.equal(r.calls.filter(c => c.key === 'arc' && c.args[2] === 100).length, 2);
  assert.equal(r.calls.filter(c => c.key === 'arc' && c.args[2] === 105).length, 1, 'Only the called exit gets a progress ring');
  assert.ok(!r.calls.some(c => c.key === 'fill' && c.fill === '#293d43'), 'No ship before real arrival'); assert.equal(JSON.stringify(game), before);
  r.calls.length = 0; game.salvage.status = 'boarding'; r.drawSalvageFields(game);
  assert.equal(r.calls.filter(c => c.key === 'fill' && c.fill === '#293d43').length, 1);
  assert.ok(r.calls.some(c => c.key === 'arc' && c.args[2] === 105 && Math.abs(c.args[4] - Math.PI / 2) < 1e-9));
  assert.ok(!r.calls.some(c => c.key === 'fillText')); assert.equal(r.stack.length, 0);
});

test('moving drone and current source state render outside the immutable terrain cache', () => {
  const r = fixture(), game = gameFixture(), drone = game.salvage.sources[2];
  r.visible = () => true; Object.assign(r, { lastPlayer: game.player, lastPosition: { ...game.player }, dpr: 1, dashTrailTimer: 0, shakeX: 0, shakeY: 0 });
  for (const name of ['drawTerrain', 'drawPlayer', 'drawObjectivePointers', 'drawVignette', 'updatePointerHud', 'updateEffects']) r[name] = () => {};
  let bakes = 0; const positions = []; r.makeTerrain = () => bakes++; r.drawSalvageSource = source => positions.push([source.id, source.x, source.y, source.status]);
  r.render(game, 0); drone.x += 40; drone.status = 'open'; r.render(game, 0);
  assert.equal(bakes, 1); assert.deepEqual(positions.filter(p => p[0] === drone.id), [[3, 1860, 380, 'flying'], [3, 1900, 380, 'open']]);
  game.terrainRevision++; r.render(game, 0); assert.equal(bakes, 2); assert.equal(r.stack.length, 0);
});

test('a real out-of-circle drill stops its visual head and shows a pause glyph even with reduced motion', () => {
  const source = gameFixture().salvage.sources[1]; source.status = 'drilling'; source.progress = 4;
  const before = JSON.stringify(source), active = fixture(false), paused = fixture(false), reduced = fixture(true);
  active.time = paused.time = reduced.time = 11; active.lastPlayer = { x: source.x, y: source.y };
  paused.lastPlayer = reduced.lastPlayer = { x: source.x + source.workRadius + 1, y: source.y };
  for (const r of [active, paused, reduced]) r.drawSalvageSource(source);
  assert.ok(active.calls.some(c => c.key === 'rotate' && c.args[0] === 33)); assert.ok(!paused.calls.some(c => c.key === 'rotate' && c.args[0] === 33));
  assert.ok(!active.calls.some(c => c.key === 'fillRect' && c.fill === '#dbefcd')); assert.equal(paused.calls.filter(c => c.key === 'fillRect' && c.fill === '#dbefcd').length, 2);
  assert.deepEqual(paused.calls, reduced.calls, 'Paused state is readable without animation'); assert.equal(JSON.stringify(source), before);
});

test('compact map has geometric source states and follows real moving cargo; detail map alone adds names', () => {
  const r = fixture(), game = gameFixture(), drone = game.salvage.sources[2]; game.salvageTarget = () => ({ ...drone });
  const before = JSON.stringify(game); r.drawSalvageMinimap(r.ctx, game, .1, false);
  assert.ok(!r.calls.some(c => c.key === 'fillText')); assert.ok(r.calls.some(c => c.key === 'arc' && c.args[0] === 186 && c.args[1] === 38 && c.args[2] === 9));
  assert.equal(JSON.stringify(game), before); r.calls.length = 0; drone.x = 2000; drone.y = 650; drone.status = 'open'; r.drawSalvageMinimap(r.ctx, game, .1, true);
  assert.ok(r.calls.some(c => c.key === 'fillText' && c.args[0] === '运输机 · 货物')); assert.ok(r.calls.some(c => c.key === 'arc' && c.args[0] === 200 && c.args[1] === 65 && c.args[2] === 12)); assert.equal(r.stack.length, 0);
});

test('one recovery objective pointer uses the engine target and avoids the legacy objective list', () => {
  const r = fixture(), game = gameFixture(), labels = [];
  r.targetRelay = { id: 7, x: 100, y: 100, name: '旧信标' }; r.targetContract = { x: 100, y: 100, name: '旧支线' };
  r.updatePointerHud = () => {}; r.drawEncounterLabel = (...args) => labels.push(args); r.nexusPointerPosition = (x, y) => ({ x, y });
  game.salvageTarget = () => ({ id: 3, kind: 'drone', x: 2000, y: 650, label: '移动货物' });
  r.drawObjectivePointers(game); assert.equal(labels.length, 1); assert.ok(labels[0][0].startsWith('移动货物')); assert.equal(r.nexusPointerRects.length, 1);
  labels.length = 0; game.salvageTarget = () => null; r.drawObjectivePointers(game); assert.equal(labels.length, 0, 'A terminal target cannot fall back to stale legacy objectives');
});

test('small detailed recovery maps prioritize one short status and keep label ink separate from glyphs and labels', () => {
  const r = fixture(), game = gameFixture(), scale = .08;
  game.salvage.sources[1].name = '荒坡采样井';
  game.salvage.sources.push({ ...game.salvage.sources[0], id: 6, x: 1800, y: 1040, name: '废场保险箱' }, { ...game.salvage.sources[1], id: 7, x: 1560, y: 470, name: '高地采样井' });
  game.stations = [{ x: 710, y: 1650 }, { x: 1320, y: 960 }, { x: 2170, y: 1470 }];
  game.salvageTarget = () => ({ ...game.salvage.sources[1] }); r.drawSalvageMinimap(r.ctx, game, scale, true);
  const glyphs = [...game.salvage.sources, ...game.salvage.exits, ...game.stations, game.player].map(p => ({ left: p.x * scale - 10, right: p.x * scale + 10, top: p.y * scale - 10, bottom: p.y * scale + 10 }));
  const ink = r.calls.filter(c => c.key === 'fillText').map(c => ({ text: c.args[0], left: c.args[1] - c.args[0].length * 7 / 2 - 3, right: c.args[1] + c.args[0].length * 7 / 2 + 3, top: c.args[2] - 10, bottom: c.args[2] + 4 }));
  assert.ok(ink.length >= 4); assert.ok(ink[0].text.startsWith('荒坡井'), 'Selected objective gets first placement');
  for (const [i, a] of ink.entries()) {
    assert.ok(a.left >= 0 && a.right <= 208 && a.top >= 0 && a.bottom <= 152);
    for (const b of [...glyphs, ...ink.slice(i + 1)]) assert.ok(!(a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2), a.text + ' must not overlap map ink');
  }
});

test('touch recovery cameras keep the real player centered at all four world corners while legacy modes retain bounds', () => {
  for (const [width, height] of [[390, 844], [844, 390], [667, 375], [1440, 1000]]) for (const [x, y] of [[36, 36], [2564, 36], [36, 1864], [2564, 1864]]) {
    const r = fixture(), game = gameFixture(); Object.assign(game.player, { x, y });
    Object.assign(r, { width, height, touchControls: true, dpr: 1, lastPosition: { x, y }, dashTrailTimer: 0, shakeX: 0, shakeY: 0 });
    for (const name of ['makeTerrain', 'drawTerrain', 'drawPlayer', 'drawObjectivePointers', 'drawVignette', 'updatePointerHud', 'updateEffects']) r[name] = () => {};
    const before = JSON.stringify(game); r.render(game, .016);
    assert.equal(r.camera.x, x); assert.equal(r.camera.y, y); assert.equal(JSON.stringify(game), before);
    assert.equal((game.player.x - r.camera.x) * r.scale + r.width / 2, width / 2); assert.equal((game.player.y - r.camera.y) * r.scale + r.height / 2, height / 2);
    game.salvage = null; r.render(game, .016); assert.ok(r.camera.x >= width / r.scale / 2 && r.camera.x <= game.world.width - width / r.scale / 2);
    assert.ok(r.camera.y >= height / r.scale / 2 && r.camera.y <= game.world.height - height / r.scale / 2); assert.equal(r.stack.length, 0);
  }
});

test('recovery event feedback shares existing effect caps and never adds floating combat text', () => {
  const r = fixture();
  for (let i = 0; i < 300; i++) r.consume(['salvage-vault-unlock', 'salvage-collected', 'salvage-source-start', 'salvage-source-open', 'salvage-call', 'salvage-arrive'].map(type => ({ type, x: 1050, y: 1180 })));
  assert.equal(r.numbers.length, 0); assert.ok(r.rings.length <= 20 && r.particles.length <= 420); assert.ok(r.rings.every(ring => !ring.fill)); assert.equal(r.shake, 0);
});

test('recovery audio distinguishes opening, call, arrival and real alarm levels, then respects throttling and mute', () => {
  const audio = new sandbox.window.FrontierAudio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' }; audio.note = (...args) => sounds.push(['note', ...args]); audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const kind of ['salvage-start', 'salvage-source-start', 'salvage-source-open', 'salvage-vault-unlock', 'salvage-collected', 'salvage-call', 'salvage-arrive', 'salvage-complete', 'salvage-withdraw', 'salvage-failed']) {
    sounds.length = 0; audio.play(kind, 'vault'); assert.ok(sounds.length); signatures.add(JSON.stringify(sounds)); const count = sounds.length; audio.play(kind, 'vault'); assert.equal(sounds.length, count); audio.context.currentTime += 1;
  }
  assert.equal(signatures.size, 10);
  const alarms = new Set();
  for (const level of [2, 3, 4]) { sounds.length = 0; audio.play('salvage-alert', level); alarms.add(JSON.stringify(sounds)); assert.equal(sounds.length, level - 1); audio.context.currentTime += 1; }
  assert.equal(alarms.size, 3); audio.setEnabled(false); sounds.length = 0; audio.play('salvage-arrive'); assert.equal(sounds.length, 0);
});
