'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Game } = require('../action-engine.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);

function renderer(reducedMotion = true) {
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
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  return Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion,
    time: 0, mapId: 'salvage', scale: .65, width: 844, height: 390, camera: { x: 1050, y: 1180 }, world: { width: 2600, height: 1900 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0,
    pointerHud: { blocks: [], right: 844, topBottom: 0, bottom: 355, safe: {} }, encounterLabelRects: [] });
}
function salvage(seed = 31) {
  const game = new Game({ mode: 'salvage', seed }); game.start(); game.drainEvents(); return game;
}
const overlaps = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;

test('each communications state has a distinct static silhouette without persistent text or engine mutation', () => {
  const game = salvage(), station = game.salvage.comms, signatures = new Set();
  for (const status of ['idle', 'linking', 'armed', 'spent', 'expired']) {
    station.status = status; const a = renderer(), b = renderer(false); b.time = 100;
    const before = JSON.stringify(game); a.drawSalvageComms(station, game.player); b.drawSalvageComms(station, game.player);
    assert.ok(a.calls.some(call => call.key === 'translate' && call.args[0] === station.x && call.args[1] === station.y));
    assert.ok(a.calls.some(call => call.key === 'fill')); assert.ok(!a.calls.some(call => call.key === 'fillText'));
    assert.deepEqual(a.calls, b.calls, 'State feedback needs no motion or flashing');
    assert.equal(JSON.stringify(game), before); assert.equal(a.stack.length + b.stack.length, 0); signatures.add(JSON.stringify(a.calls));
  }
  assert.equal(signatures.size, 5);
});

test('communications work reuses real circle/progress drawing while preserving original drill radii and colors', () => {
  const game = salvage(), r = renderer(), station = game.salvage.comms, drill = game.salvage.sources.find(source => source.kind === 'drill');
  Object.assign(station, { status: 'linking', progress: 2.5 }); Object.assign(drill, { status: 'drilling', progress: 4 });
  Object.assign(game.player, { x: station.x, y: station.y }); r.visible = () => true;
  const before = JSON.stringify(game); r.drawSalvageFields(game);
  assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === 120));
  assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === 150));
  const progress = r.calls.filter(call => call.key === 'arc' && call.args[2] === 44 && Math.abs(call.args[4] - Math.PI / 2) < 1e-9);
  assert.equal(progress.length, 2); assert.ok(r.calls.some(call => call.key === 'stroke' && call.stroke === '#c6ffdf'));
  assert.ok(!r.calls.some(call => call.key === 'fillText')); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  r.calls.length = 0; station.status = 'armed'; r.drawSalvageFields(game);
  assert.ok(!r.calls.some(call => call.key === 'arc' && call.args[2] === 120), 'A completed station cannot keep a work-circle overlay');
});

test('leaving the actual work circle replaces transmission feedback with a pause glyph without advancing its timer', () => {
  const game = salvage(), station = game.salvage.comms, active = renderer(), paused = renderer();
  Object.assign(station, { status: 'linking', progress: 2 }); Object.assign(game.player, { x: station.x, y: station.y });
  active.drawSalvageComms(station, game.player); game.player.x = station.x + station.workRadius + .01;
  const before = JSON.stringify(game); paused.drawSalvageComms(station, game.player);
  assert.notDeepEqual(active.calls, paused.calls); assert.equal(JSON.stringify(game), before); assert.equal(station.progress, 2);
  assert.equal(paused.stack.length, 0);
});

test('near communications labels use the actual target and avoid both HUD ink and the player', () => {
  const game = salvage(), station = game.salvage.comms, r = renderer();
  Object.assign(game.player, { x: station.x, y: station.y }); Object.assign(r.camera, game.player);
  r.encounterPlayerPoint = { x: 422, y: 195 }; const hud = { left: 355, right: 489, top: 100, bottom: 168 }; r.pointerHud.blocks = [hud];
  r.interaction = { target: station, action: '架设通讯' }; r.drawSalvageComms(station, game.player);
  assert.equal(r.encounterLabelRects.length, 1); assert.ok(r.stormHazardLabels[0].text.includes('架设通讯'));
  assert.ok(r.stormHazardLabels[0].text.length <= 12); assert.equal(overlaps(r.encounterLabelRects[0], hud), false);
  const player = { left: 400, right: 444, top: 173, bottom: 217 }; assert.equal(overlaps(r.encounterLabelRects[0], player), false);
  for (const [target, distance] of [[station, 94.01], [{}, 0]]) {
    r.encounterLabelRects = []; r.stormHazardLabels = []; r.interaction.target = target; game.player.x = station.x + distance;
    r.drawSalvageComms(station, game.player); assert.equal(r.encounterLabelRects.length, 0);
  }
});

test('compact maps keep communications geometric while detailed maps show concise cost, work or consumed state', () => {
  const game = salvage(), station = game.salvage.comms, r = renderer(); assert.equal(game.selectSalvageTarget(station.id), true);
  for (const status of ['idle', 'linking', 'armed', 'spent', 'expired']) {
    station.status = status; station.progress = 2.5; game.salvageTarget = () => ({ id: station.id });
    const before = JSON.stringify(game); r.calls.length = 0; r.drawSalvageMinimap(r.ctx, game, .16, false);
    assert.ok(r.calls.some(call => call.key === 'moveTo' && Math.abs(call.args[0] - station.x * .16) < 12));
    assert.ok(!r.calls.some(call => call.key === 'fillText')); r.calls.length = 0; r.drawSalvageMinimap(r.ctx, game, .16, true);
    const ink = r.calls.filter(call => call.key === 'fillText').map(call => call.args[0]); assert.ok(ink.some(text => text.includes('通讯')));
    if (status === 'idle') assert.ok(ink.some(text => text.includes('EMP') && text.includes('5s')));
    if (status === 'linking') assert.ok(ink.some(text => text.includes('50%')));
    if (status === 'spent') assert.ok(ink.some(text => text.includes('已拦截')));
    if (status === 'expired') assert.ok(ink.some(text => text.includes('已过期')));
    assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  }
});

test('all map labels avoid communications and existing glyphs at narrow and ordinary scales across boundary seeds', () => {
  for (const seed of [0, 1, 2, 17, 731, 912, 2147483647, 4294967295]) for (const scale of [.08, .16]) {
    const game = salvage(seed), r = renderer(), station = game.salvage.comms; assert.equal(game.selectSalvageTarget(station.id), true);
    r.drawSalvageMinimap(r.ctx, game, scale, true);
    const ink = r.calls.filter(call => call.key === 'fillText').map(call => ({ text: call.args[0], left: call.args[1] - call.args[0].length * 7 / 2 - 3, right: call.args[1] + call.args[0].length * 7 / 2 + 3, top: call.args[2] - 10, bottom: call.args[2] + 4 }));
    assert.ok(ink.some(label => label.text.includes('通讯')), 'Selected station stays named at seed ' + seed);
    const glyphs = [...game.salvage.sources, ...game.salvage.exits, game.salvage.hotCargo, station, ...game.stations, game.player]
      .map(point => ({ left: point.x * scale - 10, right: point.x * scale + 10, top: point.y * scale - 10, bottom: point.y * scale + 10 }));
    for (const [index, label] of ink.entries()) {
      assert.ok(label.left >= 0 && label.right <= 2600 * scale && label.top >= 0 && label.bottom <= 1900 * scale);
      for (const block of [...glyphs, ...ink.slice(index + 1)]) assert.equal(overlaps(label, block), false, seed + ': ' + label.text + ' avoids map glyphs and ink');
    }
  }
});

test('the actual actor render loop reflects communications state without rebaking terrain or changing game state', () => {
  const game = salvage(), station = game.salvage.comms, r = renderer(), seen = []; let bakes = 0;
  Object.assign(r, { dpr: 1, dashTrailTimer: 0, shakeX: 0, shakeY: 0 }); r.visible = () => true;
  for (const name of Object.getOwnPropertyNames(sandbox.window.ExpeditionRenderer.prototype)) if (name.startsWith('draw') && name !== 'drawSalvageComms') r[name] = () => {};
  r.makeTerrain = () => bakes++; r.updatePointerHud = r.updateEffects = () => {};
  const drawComms = r.drawSalvageComms.bind(r); r.drawSalvageComms = (value, player) => { seen.push(value.status); drawComms(value, player); };
  for (const status of ['idle', 'linking', 'armed', 'spent', 'expired']) {
    station.status = status; const before = JSON.stringify(game); r.render(game, 0); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  }
  assert.deepEqual(seen, ['idle', 'linking', 'armed', 'spent', 'expired']); assert.equal(bakes, 1);
});

test('legacy salvage render fixtures without communications remain supported', () => {
  const game = salvage(), r = renderer(); delete game.salvage.comms; game.salvageTarget = () => null; r.visible = () => true;
  const before = JSON.stringify(game); r.drawSalvageFields(game); r.drawSalvageMinimap(r.ctx, game, .08, true);
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});

test('communications events share bounded visual feedback without floating text, camera shake or mutation', () => {
  const game = salvage(), station = game.salvage.comms, r = renderer(), before = JSON.stringify(game);
  for (let index = 0; index < 300; index++) r.consume(['salvage-comms-start', 'salvage-comms-ready', 'salvage-comms-block', 'salvage-comms-expired'].map(type => ({ type, x: station.x, y: station.y })));
  assert.ok(r.rings.length > 0 && r.rings.length <= 20); assert.ok(r.particles.length <= 420);
  assert.equal(r.numbers.length, 0); assert.equal(r.shake, 0); assert.equal(JSON.stringify(game), before);
});
