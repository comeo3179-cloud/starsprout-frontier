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
    time: 0, mapId: 'siege', dpr: 1, scale: .65, width: 844, height: 390, camera: { x: 1050, y: 1180 }, world: { width: 2600, height: 1900 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0,
    shakeX: 0, shakeY: 0, dashTrailTimer: 0, pointerHud: { blocks: [], right: 844, topBottom: 0, bottom: 355, safe: {} },
    encounterLabelRects: [], stormHazardLabels: [], nexusPointerRects: [] });
}
function siege() { const game = new Game({ mode: 'siege', seed: 31 }); game.start(); game.drainEvents(); return game; }
const overlaps = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
const textCalls = r => r.calls.filter(call => ['fillText', 'strokeText'].includes(call.key));
function breakPart(game, kind = 'cannon') {
  const part = game.siege.parts.find(item => item.siegePart === kind);
  // Damage fixture: use the real kill transition, without substituting a wreck or a victory.
  game._damageEnemy(part, part.hp + 1);
  return game.siege.wrecks.find(item => item.kind === kind);
}

test('the three real mounts have distinct silhouettes, visible durability and no permanent labels', () => {
  const game = siege(), before = JSON.stringify(game), traces = [];
  for (const part of game.siege.parts) {
    const r = renderer(); r.drawEnemy(part); assert.equal(textCalls(r).length, 0);
    assert.ok(r.calls.some(call => call.key === 'roundRect' && call.args[2] === 54 && call.args[3] === 3));
    traces.push(JSON.stringify(r.calls.filter(call => ['roundRect', 'arc', 'lineTo'].includes(call.key)).map(call => [call.key, call.args])));
    assert.equal(r.stack.length, 0);
  }
  assert.equal(new Set(traces).size, 3); assert.equal(JSON.stringify(game), before);
  const dead = game.siege.parts[0], r = renderer(); game._damageEnemy(dead, dead.hp + 1); r.drawEnemy(dead);
  assert.equal(r.calls.length, 0, 'A broken mount is not drawn over its newly created wreck before the next update');
});

test('armored, exposed and overloaded cores stay geometric and expose the ring gap only for the ring attack', () => {
  const game = siege(), boss = game.enemies.find(e => e.id === game.siege.bossId), r = renderer();
  for (const [stage, shielded, color, coreRadius] of [[1, true, '#ffab91', 30], [2, false, '#fff1b0', 43], [3, false, '#ff7d93', 43]]) {
    Object.assign(boss, { stage, shielded, windup: 1, attackKind: 'siege-collapse' }); r.calls.length = 0;
    const before = JSON.stringify(game); r.drawEnemy(boss);
    assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === coreRadius));
    assert.ok(r.calls.some(call => call.key === 'stroke' && call.stroke === color));
    assert.ok(!r.calls.some(call => call.key === 'arc' && call.args[2] === boss.radius + 43));
    assert.equal(textCalls(r).length, 0); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  }
  boss.attackKind = 'siege-ring'; boss.ringGapAngle = .4; r.calls.length = 0; r.drawEnemy(boss);
  const ring = r.calls.find(call => call.key === 'arc' && call.args[2] === boss.radius + 43);
  assert.ok(Math.abs(ring.args[3] - (.4 + Math.PI / 8)) < 1e-10);
  assert.ok(Math.abs(ring.args[4] - (.4 + Math.PI * 2 - Math.PI / 8)) < 1e-10);
});

test('EMP capture and actual turret fire change ammo glyphs and aim without mutating simulation state', () => {
  const game = siege(), wreck = breakPart(game), r = renderer(); Object.assign(game.player, { x: wreck.x, y: wreck.y });
  assert.ok(wreck); assert.equal(game.useSkill(), true); assert.equal(wreck.status, 'captured');
  r.siegeAim = { x: wreck.x, y: wreck.y + 150 }; r.drawSiegeWreck(wreck, game.player);
  assert.equal(r.calls.filter(call => call.key === 'fillRect' && call.args[2] === 8 && call.fill === '#9affdd').length, 3);
  assert.ok(r.calls.some(call => call.key === 'rotate' && Math.abs(call.args[0] - Math.PI / 2) < 1e-10));
  game.siege.aimTarget = r.siegeAim; assert.equal(game.interact(), true); assert.equal(wreck.ammo, 2); r.calls.length = 0;
  const before = JSON.stringify(game); r.drawSiegeWreck(wreck, game.player);
  assert.equal(r.calls.filter(call => call.key === 'fillRect' && call.args[2] === 8 && call.fill === '#9affdd').length, 2);
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0); assert.equal(textCalls(r).length, 0);
});

test('nearby wreck hints are short, unavailable cooldowns do not advertise firing, and labels avoid aim and HUD', () => {
  const game = siege(), wreck = breakPart(game), r = renderer(); Object.assign(game.player, { x: wreck.x, y: wreck.y });
  Object.assign(r.camera, game.player); r.encounterPlayerPoint = { x: 422, y: 195 };
  const block = { left: 355, right: 489, top: 100, bottom: 168 }; r.pointerHud.blocks = [block]; r.interaction = game.interactionState();
  r.touchControls = true; r.drawSiegeWreck(wreck, game.player); assert.equal(r.stormHazardLabels[0].text, 'EMP · 接管');
  assert.equal(overlaps(r.encounterLabelRects[0], block), false);
  assert.equal(overlaps(r.encounterLabelRects[0], { left: 397, right: 451, top: 168, bottom: 222 }), false);
  assert.equal(game.useSkill(), true); game.siege.aimTarget = { x: wreck.x + 100, y: wreck.y }; assert.equal(game.interact(), true);
  r.encounterLabelRects = []; r.stormHazardLabels = []; r.interaction = game.interactionState(); r.drawSiegeWreck(wreck, game.player);
  assert.match(r.stormHazardLabels[0].text, /^冷却 /); assert.ok(r.stormHazardLabels[0].text.length < 15);
  game.player.x += 94.01; r.encounterLabelRects = []; r.stormHazardLabels = []; r.drawSiegeWreck(wreck, game.player);
  assert.equal(r.stormHazardLabels.length, 0); assert.equal(r.stack.length, 0);
});

test('incoming and redirected heavy rounds have opposing directions and ownership colors, including mortar rounds', () => {
  for (const [owner, kind, vx, vy, color, angle] of [['enemy', 'siege', 0, 240, '#ffab91', Math.PI / 2], ['player', 'siege', -700, 0, '#9affdd', Math.PI], ['player', 'grenade', 540, 0, '#9affdd', 0]]) {
    const r = renderer(), bullet = { x: 30, y: 50, owner, kind, siegeHeavy: true, radius: 10, vx, vy }, before = JSON.stringify(bullet);
    r.drawBullet(bullet); assert.ok(r.calls.some(call => call.key === 'rotate' && call.args[0] === angle));
    assert.ok(r.calls.some(call => call.key === 'fill' && call.fill === color)); assert.equal(textCalls(r).length, 0);
    assert.equal(JSON.stringify(bullet), before); assert.equal(r.stack.length, 0);
  }
});

test('locked shot lanes use their fixed angle and growing fuse; the visible ring gap is not covered by a fake blast', () => {
  for (const type of ['lane', 'charge', 'blast']) {
    const r = renderer(), hazard = { siegeHazard: true, type, x: 80, y: 100, angle: .9, length: 720, radius: type === 'blast' ? 85 : 22, duration: 1.4, remaining: .7 };
    const before = JSON.stringify(hazard); r.drawHazard(hazard); assert.ok(r.calls.some(call => call.key === 'rotate' && call.args[0] === .9));
    assert.equal(textCalls(r).length, 0); assert.equal(JSON.stringify(hazard), before); assert.equal(r.stack.length, 0);
    if (type !== 'blast') assert.ok(r.calls.some(call => call.key === 'lineTo' && call.args[0] === 360));
  }
  const game = siege(), boss = game.enemies.find(e => e.id === game.siege.bossId), r = renderer(); boss.attackKind = 'siege-ring';
  r.drawHazard({ siegeHazard: true, visualOnly: true, type: 'blast', x: boss.x, y: boss.y, sourceId: boss.id, radius: 100 }, game);
  assert.equal(r.calls.length, 0);
});

test('compact and detailed siege maps keep mounts, captured ammo and core geometric with no duplicate boss or camp labels', () => {
  const game = siege(), wreck = breakPart(game); Object.assign(game.player, { x: wreck.x, y: wreck.y }); assert.equal(game.useSkill(), true);
  const before = JSON.stringify(game);
  for (const detailed of [false, true]) {
    const r = renderer(), canvas = { width: 0, height: 0, getContext: () => r.ctx, getBoundingClientRect: () => ({ width: 360, height: 260 }) };
    r.drawMinimap(canvas, game, { detailed }); assert.equal(textCalls(r).length, 0);
    assert.ok(r.calls.some(call => call.key === 'fill' && call.fill === '#ffab91'));
    assert.equal(r.calls.filter(call => call.key === 'fillRect' && call.args[2] === 2 && call.fill === '#9affdd').length, 3);
    assert.equal(r.stack.length, 0);
  }
  assert.equal(JSON.stringify(game), before);
});

test('siege target pointers avoid actual HUD and player rectangles and never add a duplicate boss pointer', () => {
  const game = siege(), r = renderer(); Object.assign(r.camera, { x: 2300, y: 1800 }); r.updatePointerHud = () => {};
  r.pointerHud.blocks = [{ left: 620, right: 844, top: 0, bottom: 140 }, { left: 0, right: 844, top: 300, bottom: 390 }];
  r.encounterPlayerPoint = { x: 422, y: 195 }; const before = JSON.stringify(game); r.drawObjectivePointers(game);
  assert.equal(r.nexusPointerRects.length, 1);
  for (const block of [...r.pointerHud.blocks, { left: 397, right: 451, top: 168, bottom: 222 }]) assert.equal(overlaps(r.nexusPointerRects[0], block), false);
  assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
});

test('siege events stay bounded and non-textual, with reduced motion producing fewer particles', () => {
  const a = renderer(), b = renderer(false), events = ['siege-start', 'siege-part-break', 'siege-capture', 'siege-turret-shot', 'siege-redirect', 'siege-armor-break', 'siege-overload', 'siege-complete'].map(type => ({ type, x: 30, y: 50, kind: 'cannon' }));
  a.consume(events); b.consume(events); assert.ok(a.particles.length < b.particles.length);
  for (let index = 0; index < 300; index++) a.consume(events);
  assert.ok(a.rings.length > 0 && a.rings.length <= 20); assert.ok(a.particles.length <= 420); assert.equal(a.numbers.length, 0); assert.equal(a.shake, 0);
});

test('real moving mounts and their fixed wreck stay outside the terrain cache, while touch cameras follow all world corners', () => {
  const game = siege(), r = renderer(), seen = []; let paints = 0;
  const keep = ['drawTerrain', 'drawEnemy', 'drawSiegeEnemy', 'drawSiegeModule', 'drawSiegeWreck'];
  for (const name of Object.getOwnPropertyNames(sandbox.window.ExpeditionRenderer.prototype)) if (name.startsWith('draw') && !keep.includes(name)) r[name] = () => {};
  r.makeTerrain = () => {}; r.updatePointerHud = r.updateEffects = () => {}; r.touchControls = true;
  const paint = r.paintSiegeTerrain.bind(r), enemy = r.drawEnemy.bind(r), wreck = r.drawSiegeWreck.bind(r);
  r.paintSiegeTerrain = value => { paints++; paint(value); };
  r.drawEnemy = value => { seen.push({ id: value.id, x: value.x, y: value.y }); enemy(value); };
  r.drawSiegeWreck = (value, player) => { seen.push({ id: value.id, x: value.x, y: value.y }); wreck(value, player); };
  sandbox.document = { createElement: () => ({ getContext: () => r.ctx }) };
  const part = game.siege.parts[0], start = { x: part.x, y: part.y }; r.render(game, 0);
  game.update(.05, {}); assert.notDeepEqual({ x: part.x, y: part.y }, start);
  const actualWreck = breakPart(game), fixed = { x: actualWreck.x, y: actualWreck.y }; game.update(.05, {});
  Object.assign(game.player, fixed);
  const before = JSON.stringify(game); r.render(game, 0); assert.equal(JSON.stringify(game), before);
  assert.equal(paints, 1); assert.deepEqual({ x: actualWreck.x, y: actualWreck.y }, fixed);
  assert.ok(seen.some(value => value.id === actualWreck.id && value.x === fixed.x && value.y === fixed.y));
  for (const [x, y] of [[0, 0], [0, game.world.height], [game.world.width, 0], [game.world.width, game.world.height]]) {
    // Camera geometry fixture; this does not advance combat or claim a played traversal.
    Object.assign(game.player, { x, y }); r.lastPlayer = null; r.render(game, 0);
    assert.equal(r.camera.x, x); assert.equal(r.camera.y, y);
  }
  assert.equal(r.stack.length, 0); assert.equal(textCalls(r).length, 0);
});
