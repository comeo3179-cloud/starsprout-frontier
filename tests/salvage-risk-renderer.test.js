'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Game } = require('../action-engine.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);

function renderer() {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length); Object.assign(state, stack.pop()); };
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite coordinates');
      calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha });
    };
  } });
  return Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack,
    reducedMotion: true, time: 0, mapId: 'salvage', scale: .65, width: 844, height: 390, camera: { x: 1050, y: 1180 }, world: { width: 2600, height: 1900 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0,
    pointerHud: { blocks: [], right: 844, topBottom: 0, bottom: 355, safe: {} }, encounterLabelRects: [] });
}
function salvage() {
  const game = new Game({ mode: 'salvage', seed: 31 }); game.start(); game.drainEvents();
  assert.ok(game.salvage.hotCargo, 'Use the real recovery state, not renderer-invented cargo');
  return game;
}
const overlaps = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;

test('ground and dropped black boxes are visible without persistent text; settled and lost boxes disappear', () => {
  const game = salvage(), cargo = game.salvage.hotCargo, r = renderer();
  for (const status of ['ground', 'dropped']) {
    cargo.status = status; r.calls.length = 0; const before = JSON.stringify(game);
    r.drawSalvageCargo(cargo, game.player);
    assert.ok(r.calls.some(call => call.key === 'translate' && call.args[0] === cargo.x && call.args[1] === cargo.y));
    assert.ok(r.calls.some(call => call.key === 'fill'), 'The optional cargo must have a visible silhouette');
    assert.ok(!r.calls.some(call => call.key === 'fillText')); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  }
  for (const status of ['banked', 'lost']) {
    cargo.status = status; r.calls.length = 0; r.drawSalvageCargo(cargo, game.player); assert.equal(r.calls.length, 0);
    r.drawSalvageMinimap(r.ctx, game, .1, true);
    assert.ok(!r.calls.some(call => call.key === 'fillText' && call.args[0].includes('黑匣子')));
  }
});

test('a carried black box follows the actual player rather than its pickup coordinates on both maps', () => {
  const game = salvage(), cargo = game.salvage.hotCargo, r = renderer(); cargo.status = 'carried';
  game.player.x = 1300; game.player.y = 1500; assert.notEqual(cargo.x, game.player.x);
  const before = JSON.stringify(game); r.drawSalvageCargo(cargo, game.player);
  assert.ok(r.calls.some(call => call.key === 'translate' && call.args[0] === game.player.x && call.args[1] === game.player.y));
  for (const detailed of [false, true]) {
    r.calls.length = 0; r.drawSalvageMinimap(r.ctx, game, .1, detailed);
    assert.ok(r.calls.some(call => call.key === 'arc' && call.args[0] === 130 && call.args[1] === 150 && call.stroke === '#ffc18a'));
    assert.ok(!r.calls.some(call => call.key === 'arc' && call.args[0] === cargo.x * .1 && call.args[1] === cargo.y * .1 && call.stroke === '#ffc18a'));
    if (!detailed) assert.ok(!r.calls.some(call => call.key === 'fillText'));
  }
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});

test('cargo pickup hints require the nearby actual interaction target and avoid HUD/player ink', () => {
  const game = salvage(), cargo = game.salvage.hotCargo, r = renderer();
  Object.assign(game.player, { x: cargo.x, y: cargo.y }); Object.assign(r.camera, game.player);
  r.encounterPlayerPoint = { x: 422, y: 195 };
  r.pointerHud.blocks = [{ left: 355, right: 489, top: 105, bottom: 166 }];
  r.interaction = { target: cargo, action: '拾取黑匣子' }; r.drawSalvageCargo(cargo, game.player);
  assert.equal(r.encounterLabelRects.length, 1); assert.ok(r.stormHazardLabels[0].text.includes('拾取黑匣子'));
  assert.ok(r.stormHazardLabels[0].text.length <= 12, 'The risk rules belong in the map/HUD, not a long combat label');
  assert.ok(!overlaps(r.encounterLabelRects[0], r.pointerHud.blocks[0]));
  for (const [target, distance] of [[cargo, 95], [{}, 0]]) {
    r.encounterLabelRects = []; r.stormHazardLabels = []; r.interaction.target = target; game.player.x = cargo.x + distance;
    r.drawSalvageCargo(cargo, game.player); assert.equal(r.encounterLabelRects.length, 0);
  }
});

test('the tactical map shows both exit delays and cover choices before either is called', () => {
  const game = salvage(), r = renderer(); game.salvageTarget = () => null;
  const before = JSON.stringify(game); r.drawSalvageMinimap(r.ctx, game, .16, true);
  const ink = r.calls.filter(call => call.key === 'fillText');
  assert.ok(ink.some(call => call.args[0].includes('10s') && call.args[0].includes('空旷')));
  assert.ok(ink.some(call => call.args[0].includes('16s') && call.args[0].includes('掩体')));
  assert.ok(ink.some(call => call.args[0].includes('黑匣子') && call.args[0].includes('待拾取')));
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});

test('narrow tactical-map labels retain both route choices without covering cargo, exits or each other', () => {
  const game = salvage(), r = renderer(), scale = .08; game.salvageTarget = () => null;
  r.drawSalvageMinimap(r.ctx, game, scale, true);
  const ink = r.calls.filter(call => call.key === 'fillText').map(call => ({ text: call.args[0], left: call.args[1] - call.args[0].length * 7 / 2 - 3, right: call.args[1] + call.args[0].length * 7 / 2 + 3, top: call.args[2] - 10, bottom: call.args[2] + 4 }));
  assert.ok(ink.some(label => label.text.includes('10s') && label.text.includes('空旷')));
  assert.ok(ink.some(label => label.text.includes('16s') && label.text.includes('掩体')), JSON.stringify(ink));
  const glyphs = [...game.salvage.sources, ...game.salvage.exits, game.salvage.hotCargo, ...game.stations, game.player]
    .map(point => ({ left: point.x * scale - 10, right: point.x * scale + 10, top: point.y * scale - 10, bottom: point.y * scale + 10 }));
  for (const [index, label] of ink.entries()) {
    assert.ok(label.left >= 0 && label.right <= 208 && label.top >= 0 && label.bottom <= 152);
    for (const block of [...glyphs, ...ink.slice(index + 1)]) assert.ok(!overlaps(label, block), label.text + ' avoids tactical glyphs and ink');
  }
});

test('cargo broadcasting has bounded non-text feedback and no camera shake or engine mutation', () => {
  const game = salvage(), r = renderer(), before = JSON.stringify(game);
  r.consume([{ type: 'salvage-cargo-pulse', x: game.player.x, y: game.player.y }]);
  assert.ok(r.rings.length > 0, 'A real broadcast must be visible even if the player is watching the battlefield');
  for (let i = 0; i < 300; i++) r.consume(['salvage-cargo-picked', 'salvage-cargo-dropped', 'salvage-cargo-pulse'].map(type => ({ type, x: game.player.x, y: game.player.y })));
  assert.ok(r.rings.length <= 20 && r.particles.length <= 420); assert.equal(r.numbers.length, 0); assert.equal(r.shake, 0);
  assert.ok(r.rings.every(ring => ring.life <= .7 && ring.radius <= 140 && !ring.fill)); assert.equal(JSON.stringify(game), before);
});

test('the real render loop follows pickup and drop without rebaking static terrain or reviving lost cargo', () => {
  const game = salvage(), cargo = game.salvage.hotCargo, r = renderer(), seen = []; let bakes = 0;
  Object.assign(r, { dpr: 1, dashTrailTimer: 0, shakeX: 0, shakeY: 0 }); r.visible = () => true;
  for (const name of Object.getOwnPropertyNames(sandbox.window.ExpeditionRenderer.prototype)) if (name.startsWith('draw') && name !== 'drawSalvageCargo') r[name] = () => {};
  r.makeTerrain = () => bakes++; r.updatePointerHud = r.updateEffects = () => {};
  const drawCargo = r.drawSalvageCargo.bind(r);
  r.drawSalvageCargo = (value, player) => { seen.push(value.status); drawCargo(value, player); };
  const draw = () => { const before = JSON.stringify(game); r.render(game, 0); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0); };
  draw(); Object.assign(game.player, { x: cargo.x, y: cargo.y }); assert.equal(game.interact(), true); draw();
  game.player.x += 70; assert.equal(game.dropSalvageCargo(), true); draw(); cargo.status = 'lost'; draw();
  assert.deepEqual(seen, ['ground', 'carried', 'dropped']); assert.equal(bakes, 1, 'Live cargo never invalidates static terrain');
});

test('left landscape cargo control does not move a right-side objective arrow to the opposite screen edge', () => {
  // Explicit DOM geometry fixture. Actual HUD measurement and pointer placement
  // run together; this does not simulate combat or certify a physical phone.
  const game = salvage(), r = renderer(), cargoRect = { left: 8, right: 158, top: 146, bottom: 191, width: 150, height: 45 };
  Object.assign(game.player, { x: 1100, y: 1180 }); Object.assign(r.camera, game.player);
  const north = game.salvage.sources.find(source => source.kind === 'drill' && source.y < 700);
  assert.equal(game.selectSalvageTarget(north.id), true); assert.ok(north.x > game.player.x && north.y < game.player.y);
  const panel = { getBoundingClientRect: () => ({ left: 650, right: 830, top: 10, bottom: 120, width: 180, height: 110 }) };
  const cargo = { getBoundingClientRect: () => cargoRect };
  const weapons = { getBoundingClientRect: () => ({ left: 0, right: 844, top: 254, bottom: 390, width: 844, height: 136 }) };
  const parent = { querySelectorAll(selector) {
    return [...(selector.includes('.map-hud') ? [panel] : []), ...(selector.includes('#cargo-control') ? [cargo] : []), ...(selector.includes('.weapons-hud') ? [weapons] : [])];
  } };
  r.canvas = { parentElement: parent, getBoundingClientRect: () => ({ left: 0, top: 0, width: 844, height: 390 }) };
  r.pointerHud = null; r.pointerHudTime = -1; r.encounterPlayerPoint = { x: 422, y: 195 };
  const before = JSON.stringify(game); r.drawObjectivePointers(game);
  assert.ok(r.pointerHud.blocks.some(rect => rect.left === cargoRect.left && rect.top === cargoRect.top), 'Cargo remains a real HUD obstacle');
  assert.equal(r.nexusPointerRects.length, 1);
  const arrow = r.nexusPointerRects[0], x = (arrow.left + arrow.right) / 2;
  assert.ok(x > r.width / 2, 'A target to the right keeps its arrow on the right; actual x=' + x);
  assert.equal(overlaps(arrow, cargoRect), false); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});
