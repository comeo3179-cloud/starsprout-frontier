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
function salvage(seed = 31, exitIndex = 0) {
  const game = new Game({ mode: 'salvage', seed }); game.start(); game.drainEvents();
  const exit = game.salvage.exits[exitIndex]; Object.assign(game.player, { x: exit.x, y: exit.y });
  assert.equal(game.interact(), true); assert.ok(game.salvage.lastChance, 'The real evacuation call creates the cache');
  return game;
}
const overlaps = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;

test('a real optional cache has a stable gold silhouette and shrinking timer without flashing or permanent text', () => {
  const game = salvage(), cache = game.salvage.lastChance, a = renderer(), b = renderer(false); b.time = 100;
  const before = JSON.stringify(game); a.drawSalvageLastChance(cache, game.player); b.drawSalvageLastChance(cache, game.player);
  assert.ok(a.calls.some(call => call.key === 'fill' && call.fill === '#ffe08b'));
  assert.deepEqual(a.calls, b.calls, 'The countdown does not pulse or depend on animation time');
  assert.ok(!a.calls.some(call => call.key === 'fillText')); assert.equal(JSON.stringify(game), before);
  a.calls.length = 0; cache.remaining = 9; a.drawSalvageLastChance(cache, game.player);
  const timer = a.calls.filter(call => call.key === 'arc' && call.args[2] === cache.radius + 11).at(-1);
  assert.ok(Math.abs(timer.args[4] - Math.PI / 2) < 1e-9); assert.equal(cache.remaining, 9); assert.equal(a.stack.length + b.stack.length, 0);
});

test('actual nearby pickup labels remain short and avoid both HUD panels and the player', () => {
  const game = salvage(), cache = game.salvage.lastChance, r = renderer();
  Object.assign(game.player, { x: cache.x, y: cache.y }); Object.assign(r.camera, game.player);
  r.encounterPlayerPoint = { x: 422, y: 195 }; const hud = { left: 355, right: 489, top: 100, bottom: 168 }; r.pointerHud.blocks = [hud];
  r.interaction = game.interactionState(); assert.equal(r.interaction.target, cache); r.drawSalvageLastChance(cache, game.player);
  assert.equal(r.encounterLabelRects.length, 1); assert.ok(r.stormHazardLabels[0].text.includes('+4'));
  assert.ok(r.stormHazardLabels[0].text.length <= 14); assert.equal(overlaps(r.encounterLabelRects[0], hud), false);
  assert.equal(overlaps(r.encounterLabelRects[0], { left: 400, right: 444, top: 173, bottom: 217 }), false);
  for (const [target, distance] of [[cache, 94.01], [{}, 0]]) {
    r.encounterLabelRects = []; r.stormHazardLabels = []; r.interaction.target = target; game.player.x = cache.x + distance;
    r.drawSalvageLastChance(cache, game.player); assert.equal(r.encounterLabelRects.length, 0);
  }
});

test('compact maps keep the cache geometric; detailed maps show its real time and reward without stealing exit tracking', () => {
  const game = salvage(), cache = game.salvage.lastChance, r = renderer(), selected = game.salvageTarget().id;
  assert.equal(selected, game.salvage.exits[0].id);
  const before = JSON.stringify(game); r.drawSalvageMinimap(r.ctx, game, .16, false);
  assert.ok(r.calls.some(call => call.key === 'arc' && call.args[0] === cache.x * .16 && call.args[1] === cache.y * .16 && call.stroke === '#ffe08b'));
  assert.ok(!r.calls.some(call => call.key === 'fillText')); r.calls.length = 0; r.drawSalvageMinimap(r.ctx, game, .16, true);
  const ink = r.calls.filter(call => call.key === 'fillText').map(call => call.args[0]);
  assert.ok(ink.some(text => text.includes('18s/+4'))); assert.ok(ink.some(text => text.includes('10s') && text.includes('空旷')));
  assert.ok(ink.some(text => text.includes('16s') && text.includes('掩体'))); assert.equal(game.salvageTarget().id, selected);
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});

test('all tactical labels avoid cache, source and exit glyphs across both exits, narrow scales and boundary seeds', () => {
  for (const seed of [0, 1, 2, 17, 731, 912, 2147483647, 4294967295]) for (const exit of [0, 1]) for (const scale of [.08, .16]) {
    const game = salvage(seed, exit), r = renderer(), cache = game.salvage.lastChance;
    assert.equal(game.selectSalvageTarget(cache.id), true); r.drawSalvageMinimap(r.ctx, game, scale, true);
    const ink = r.calls.filter(call => call.key === 'fillText').map(call => ({ text: call.args[0], left: call.args[1] - call.args[0].length * 7 / 2 - 3, right: call.args[1] + call.args[0].length * 7 / 2 + 3, top: call.args[2] - 10, bottom: call.args[2] + 4 }));
    assert.ok(ink.some(label => label.text.includes('货箱') && label.text.includes('+4')), 'Selected cache stays named: ' + seed);
    const glyphs = [...game.salvage.sources, ...game.salvage.exits, game.salvage.hotCargo, game.salvage.comms, cache, ...game.stations, game.player]
      .map(point => ({ left: point.x * scale - 10, right: point.x * scale + 10, top: point.y * scale - 10, bottom: point.y * scale + 10 }));
    for (const [index, label] of ink.entries()) {
      assert.ok(label.left >= 0 && label.right <= 2600 * scale && label.top >= 0 && label.bottom <= 1900 * scale);
      for (const block of [...glyphs, ...ink.slice(index + 1)]) assert.equal(overlaps(label, block), false, seed + ': ' + label.text);
    }
  }
});

test('actual pickup and expiry remove the cache from the render loop and both maps without rebaking terrain', () => {
  for (const collected of [true, false]) {
    const game = salvage(), cache = game.salvage.lastChance, r = renderer(), seen = []; let bakes = 0;
    Object.assign(r, { dpr: 1, dashTrailTimer: 0, shakeX: 0, shakeY: 0 }); r.visible = () => true;
    for (const name of Object.getOwnPropertyNames(sandbox.window.ExpeditionRenderer.prototype)) if (name.startsWith('draw') && name !== 'drawSalvageLastChance') r[name] = () => {};
    r.makeTerrain = () => bakes++; r.updatePointerHud = r.updateEffects = () => {};
    const draw = r.drawSalvageLastChance.bind(r); r.drawSalvageLastChance = (value, player) => { seen.push(value.status); draw(value, player); };
    r.render(game, 0); Object.assign(game.player, { x: cache.x, y: cache.y });
    if (collected) assert.equal(game.interact(), true);
    else {
      // Timing fixture: disable combat spawning while exercising the real game clock away from the boarding circle.
      game.enemies = []; game.hazards = []; game.salvage.pending = []; game.salvage.spawnTimer = 100; game.salvage.hazardTimer = 100;
      for (let elapsed = 0; elapsed < 18; elapsed += .05) game.update(.05, {});
    }
    assert.equal(cache.status, collected ? 'collected' : 'expired'); const before = JSON.stringify(game);
    r.render(game, 0); assert.deepEqual(seen, ['available']); assert.equal(bakes, 1); assert.equal(JSON.stringify(game), before);
    const map = renderer(); map.drawSalvageLastChance(cache, game.player); assert.equal(map.calls.length, 0);
    map.drawSalvageMinimap(map.ctx, game, .16, true); assert.ok(!map.calls.some(call => call.key === 'fillText' && call.args[0].includes('货箱')));
    assert.equal(r.stack.length + map.stack.length, 0);
  }
});

test('the selected cache pointer uses gold and stays outside actual HUD and player rectangles', () => {
  const game = salvage(), cache = game.salvage.lastChance, r = renderer(); assert.equal(game.selectSalvageTarget(cache.id), true);
  Object.assign(r.camera, { x: 1400, y: 900 }); r.updatePointerHud = () => {};
  r.pointerHud.blocks = [{ left: 620, right: 844, top: 0, bottom: 140 }, { left: 0, right: 844, top: 300, bottom: 390 }];
  r.encounterPlayerPoint = { x: 422, y: 195 }; const before = JSON.stringify(game); r.drawObjectivePointers(game);
  assert.equal(r.nexusPointerRects.length, 1); assert.ok(r.calls.some(call => call.key === 'stroke' && call.stroke === '#ffe08b'));
  for (const block of [...r.pointerHud.blocks, { left: 394, right: 450, top: 167, bottom: 223 }]) assert.equal(overlaps(r.nexusPointerRects[0], block), false);
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});

test('cache events stay bounded and non-textual, and legacy salvage states remain supported', () => {
  const game = salvage(), cache = game.salvage.lastChance, r = renderer(), before = JSON.stringify(game);
  for (let index = 0; index < 300; index++) r.consume(['salvage-lastchance-appear', 'salvage-lastchance-collected', 'salvage-lastchance-expired'].map(type => ({ type, x: cache.x, y: cache.y })));
  assert.ok(r.rings.length > 0 && r.rings.length <= 20); assert.ok(r.particles.length <= 420);
  assert.equal(r.numbers.length, 0); assert.equal(r.shake, 0); assert.equal(JSON.stringify(game), before);
  delete game.salvage.lastChance; const legacy = renderer(); legacy.visible = () => true;
  legacy.drawSalvageFields(game); legacy.drawSalvageMinimap(legacy.ctx, game, .08, true); assert.equal(legacy.stack.length, 0);
});
