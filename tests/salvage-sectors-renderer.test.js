'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { Game } = require('../action-engine.js');
const sandbox = { window: { devicePixelRatio: 1 } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'action-renderer.js'), 'utf8'), sandbox);

function fixture(reducedMotion = true) {
  const calls = [], stack = [], state = { globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => { assert.ok(stack.length); Object.assign(state, stack.pop()); };
    if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...args) => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key + ': finite'); if (key === 'arc') assert.ok(args[2] >= 0); calls.push({ key, args, fill: ctx.fillStyle, stroke: ctx.strokeStyle, width: ctx.lineWidth }); };
  } });
  return Object.assign(Object.create(sandbox.window.ExpeditionRenderer.prototype), { ctx, calls, stack, reducedMotion, time: 0,
    mapId: 'salvage', salvageSectorId: 'scrapyard', scale: .65, width: 844, height: 390, dpr: 1, camera: { x: 1100, y: 1000 }, world: { width: 2600, height: 1900 },
    particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: [], hitFlashes: new Map(), shake: 0,
    recoil: 0, playerHit: 0, dashTrailTimer: 0, shakeX: 0, shakeY: 0,
    pointerHud: { blocks: [], right: 844, topBottom: 0, bottom: 355, safe: {} }, encounterLabelRects: [] });
}

function gameFixture() {
  const nodes = ['blast', 'ring', 'lane'].map((kind, i) => ({ id: 20 + i, type: 'salvage-node', kind, x: 800 + i * 500, y: 530 + i * 220, radius: 24,
    fieldRadius: kind === 'blast' ? 140 : kind === 'ring' ? 150 : 28, innerRadius: kind === 'ring' ? 70 : 0, angle: Math.PI / 3, length: 320, status: 'idle', remaining: 0, duration: 1.2 }));
  return { phase: 'playing', map: { id: 'salvage' }, world: { width: 2600, height: 1900 }, terrainRevision: 1,
    player: { x: 1100, y: 1000, hp: 100, maxHp: 100, angle: .5, weapon: 0 }, spawn: { x: 350, y: 1580 }, obstacles: [], stations: [], enemies: [
      { id: 30, x: 1850, y: 350, hp: 100, maxHp: 100, radius: 24, type: 'crawler', elite: true, salvageHunt: true, name: '巡逻精英', angle: .3 }
    ], salvage: { seed: 17, sectorId: 'scrapyard', status: 'exploring', nodes, round: { remaining: 0, duration: 4, modId: '' },
      hunt: { enemyId: 30, status: 'patrolling', path: [{ x: 1850, y: 350 }, { x: 2050, y: 600 }], drop: { id: 31, type: 'salvage-mod', kind: 'mod', x: 1850, y: 350, radius: 24, value: 3, modId: 'frost', status: 'locked' } },
      sources: [
        { id: 1, x: 630, y: 1430, kind: 'vault', name: '保险箱', radius: 26, hp: 90, maxHp: 90, status: 'locked', quietTimer: 0 },
        { id: 2, x: 1050, y: 1180, kind: 'drill', name: '采样井', radius: 28, status: 'idle', progress: 0, duration: 8, workRadius: 150 },
        { id: 3, x: 1800, y: 1040, kind: 'vault', name: '废场保险箱', radius: 26, hp: 90, maxHp: 90, status: 'locked', quietTimer: 0 },
        { id: 4, x: 1560, y: 470, kind: 'drill', name: '高地采样井', radius: 28, status: 'idle', progress: 0, duration: 8, workRadius: 150 },
        { id: 5, x: 2120, y: 770, kind: 'drone', name: '运输无人机', radius: 25, hp: 90, maxHp: 90, status: 'flying', path: [{ x: 2120, y: 770 }, { x: 2330, y: 550 }] }
      ], exits: [{ id: 6, x: 260, y: 1650, radius: 100, name: '西侧接应点', arrivalDuration: 10, coverLabel: '空旷快线' }, { id: 7, x: 2320, y: 1700, radius: 100, name: '东侧接应点', arrivalDuration: 16, coverLabel: '固定掩体' }],
      comms: { id: 8, type: 'salvage-comms', x: 1300, y: 350, radius: 26, status: 'idle', progress: 0, duration: 5, workRadius: 140 }, evac: null }
  };
}

function prepareRender(r) {
  r.visible = () => true;
  for (const name of ['drawTerrain', 'drawObjectivePointers', 'drawVignette', 'updatePointerHud', 'updateEffects']) r[name] = () => {};
  let bakes = 0; r.makeTerrain = () => bakes++;
  return () => bakes;
}

test('same-size sector changes rebuild the correct terrain while live node, patrol and reward state never rebakes it', () => {
  const r = fixture(), game = gameFixture(), count = prepareRender(r), before = JSON.stringify(game);
  r.render(game, 0); assert.equal(count(), 1); assert.equal(JSON.stringify(game), before);
  for (const sectorId of ['frostport', 'stormcity', 'scrapyard']) { game.salvage.sectorId = sectorId; r.render(game, 0); assert.equal(r.salvageSectorId, sectorId); }
  assert.equal(count(), 4);
  game.salvage.nodes[0].status = 'friendly'; game.enemies[0].x += 50; game.salvage.hunt.drop.status = 'open';
  r.render(game, 0); assert.equal(count(), 4); assert.equal(r.stack.length, 0);
});

test('a mod case enters the real actor loop only after dropping and disappears on collection without rebaking terrain', () => {
  const r = fixture(), game = gameFixture(), count = prepareRender(r), seen = [], drop = game.salvage.hunt.drop;
  r.drawSalvageMod = item => seen.push([item.id, item.x, item.y]);
  r.render(game, 0); assert.equal(seen.length, 0);
  Object.assign(drop, { status: 'open', x: 1620, y: 1190 }); r.render(game, 0); assert.deepEqual(seen, [[drop.id, 1620, 1190]]);
  drop.status = 'collected'; r.render(game, 0); assert.equal(seen.length, 1); assert.equal(count(), 1); assert.equal(r.stack.length, 0);
});

test('three terrain motifs remain distinct, deterministic and free from dynamic actors or gameplay mutation', () => {
  const signatures = new Set();
  for (const sectorId of ['scrapyard', 'frostport', 'stormcity']) {
    const r = fixture(), second = fixture(), game = gameFixture(); game.salvage.sectorId = sectorId;
    const before = JSON.stringify(game); r.paintSalvageTerrain(game); second.paintSalvageTerrain(game);
    assert.deepEqual(r.calls, second.calls); assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
    assert.ok(!r.calls.some(call => call.key === 'fillText')); signatures.add(JSON.stringify(r.calls));
  }
  assert.equal(signatures.size, 3);
});

test('finite node states are readable without animation or persistent text and renderer never changes a timer', () => {
  const signatures = new Set(), game = gameFixture(), node = game.salvage.nodes[0];
  for (const status of ['idle', 'primed', 'friendly', 'spent']) {
    node.status = status; node.remaining = .6;
    const r = fixture(), second = fixture(); second.time = 100;
    const before = JSON.stringify(node); r.drawSalvageNode(node, game.player); second.drawSalvageNode(node, game.player);
    assert.deepEqual(r.calls, second.calls); assert.equal(JSON.stringify(node), before); assert.equal(r.stack.length, 0);
    assert.ok(!r.calls.some(call => call.key === 'fillText')); signatures.add(JSON.stringify(r.calls));
  }
  assert.equal(signatures.size, 4);
});

test('node warnings match actual circle, safe ring hole and capsule endpoint and show ownership beyond color', () => {
  for (const type of ['blast', 'ring', 'lane']) for (const friendly of [false, true]) {
    const r = fixture(), hazard = { salvageNodeId: 20, type, x: 900, y: 500, radius: type === 'lane' ? 28 : type === 'ring' ? 150 : 140, innerRadius: 70, angle: .75, length: 320, remaining: .6, duration: 1.2, friendly };
    const before = JSON.stringify(hazard); r.drawHazard(hazard);
    if (type === 'lane') {
      assert.ok(r.calls.some(call => call.key === 'roundRect' && JSON.stringify(call.args) === JSON.stringify([-28, -28, 376, 56, 28])));
      assert.ok(r.calls.some(call => call.key === 'rotate' && call.args[0] === .75));
      assert.ok(r.calls.some(call => call.key === 'lineTo' && call.args[0] === 160));
    } else {
      assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === hazard.radius));
      assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] > hazard.radius && Math.abs(call.args[4] - Math.PI / 2) < 1e-9));
      if (type === 'ring') assert.ok(r.calls.some(call => call.key === 'arc' && call.args[2] === 70 && call.args[5] === true));
    }
    assert.equal(r.calls.some(call => call.key === 'setLineDash' && call.args[0].length > 0), friendly);
    assert.ok(r.calls.some(call => call.key === 'stroke' && call.stroke === (friendly ? '#9affdd' : '#ffc187')));
    assert.ok(!r.calls.some(call => call.key === 'fillText')); assert.equal(JSON.stringify(hazard), before); assert.equal(r.stack.length, 0);
  }
});

test('next-shot charge is a real gun arc, follows remaining time and disappears at expiry without renderer consumption', () => {
  const r = fixture(), game = gameFixture(); r.salvageRound = game.salvage.round;
  for (const remaining of [4, 2, 0]) {
    r.calls.length = 0; game.salvage.round.remaining = remaining; game.salvage.round.modId = 'frost';
    const before = JSON.stringify(game); r.drawPlayer(game.player);
    const arcs = r.calls.filter(call => call.key === 'arc' && call.args[0] === 31 && call.args[1] === 7 && call.args[2] === 18 && call.args[4] !== Math.PI * 2);
    assert.equal(arcs.length, remaining ? 1 : 0); if (remaining) assert.ok(Math.abs(arcs[0].args[4] - (-Math.PI / 2 + Math.PI * 2 * remaining / 4)) < 1e-9);
    assert.equal(JSON.stringify(game), before); assert.equal(r.stack.length, 0);
  }
  r.calls.length = 0; game.salvage.round.remaining = 2; r.drawPlayer(game.player, true);
  assert.ok(!r.calls.some(call => call.key === 'arc' && call.args[0] === 31 && call.args[1] === 7));
});

test('compact maps keep new nodes, far real patrol and dropped mod geometric while detailed labels avoid all glyphs', () => {
  for (const scale of [.08, .12, .2]) {
    const r = fixture(), game = gameFixture(); game.salvageTarget = () => ({ id: 30, kind: 'hunt', x: game.enemies[0].x, y: game.enemies[0].y });
    r.drawSalvageMinimap(r.ctx, game, scale, false); assert.ok(!r.calls.some(call => call.key === 'fillText'));
    assert.ok(r.calls.some(call => call.key === 'moveTo' && Math.abs(call.args[0] - (game.enemies[0].x * scale + Math.cos(Math.PI / 6) * 5)) < 1e-9));
    r.calls.length = 0; game.salvage.hunt.drop.status = 'open'; game.enemies[0].hp = 0; game.salvageTarget = () => ({ ...game.salvage.hunt.drop });
    const before = JSON.stringify(game); r.drawSalvageMinimap(r.ctx, game, scale, true); assert.equal(JSON.stringify(game), before);
    const glyphs = [...game.salvage.nodes, ...game.salvage.sources, ...game.salvage.exits, game.salvage.hunt.drop, game.salvage.comms, game.player].map(point => ({ left: point.x * scale - 10, right: point.x * scale + 10, top: point.y * scale - 10, bottom: point.y * scale + 10 }));
    const ink = r.calls.filter(call => call.key === 'fillText').map(call => ({ text: call.args[0], left: call.args[1] - call.args[0].length * 7 / 2 - 3, right: call.args[1] + call.args[0].length * 7 / 2 + 3, top: call.args[2] - 10, bottom: call.args[2] + 4 }));
    assert.ok(ink.length >= 5); assert.ok(ink[0].text.startsWith('改装'));
    for (const [i, rect] of ink.entries()) {
      assert.ok(rect.left >= 0 && rect.right <= 2600 * scale && rect.top >= 0 && rect.bottom <= 1900 * scale);
      for (const other of [...glyphs, ...ink.slice(i + 1)]) assert.ok(!(rect.left < other.right + 2 && rect.right > other.left - 2 && rect.top < other.bottom + 2 && rect.bottom > other.top - 2), rect.text);
    }
    assert.equal(r.stack.length, 0);
  }
});

test('patrol labels are local or selected and open mod labels require the actual interaction target', () => {
  const r = fixture(), game = gameFixture(), enemy = game.enemies[0], labels = [];
  r.drawEncounterLabel = (...args) => labels.push(args); r.lastPlayer = game.player;
  r.drawEnemy(enemy); assert.equal(labels.length, 0); assert.ok(!r.calls.some(call => call.key === 'fillText'));
  r.salvageSelectedId = enemy.id; r.drawEnemy(enemy); assert.equal(labels.length, 1);
  r.salvageSelectedId = null; r.lastPlayer = { x: enemy.x + 50, y: enemy.y }; r.drawEnemy(enemy); assert.equal(labels.length, 2);
  const drop = game.salvage.hunt.drop; labels.length = 0; r.drawSalvageMod(drop); assert.equal(labels.length, 0);
  r.interaction = { target: drop, action: '装备改装' }; r.drawSalvageMod(drop); assert.equal(labels.length, 1); assert.ok(labels[0][0].includes('样本 +3'));
  assert.equal(r.stack.length, 0);
});

test('a nearby supply action keeps priority instead of stacking a node instruction on the same world object', () => {
  const r = fixture(), game = gameFixture(), node = game.salvage.nodes[0], labels = [], crate = { ...node, opened: false };
  r.interaction = { target: crate, action: '开启补给' }; r.salvageSelectedId = node.id; r.nearSalvageNode = node;
  r.drawEncounterLabel = (...args) => labels.push(args); Object.assign(game.player, { x: node.x, y: node.y + 60 });
  r.drawSalvageNode(node, game.player); r.drawCrate(crate, game.player);
  assert.equal(labels.length, 0); assert.ok(r.calls.some(call => call.key === 'fillText' && call.args[0].includes('开启补给'))); assert.equal(r.stack.length, 0);
});

test('salvage station hints show only the current usable action and avoid the player before later elite labels', () => {
  for (const kind of ['armory', 'medical']) {
    const r = fixture(), player = { x: 1100, y: 1000 }, station = { x: 1140, y: 1020, kind }, action = kind === 'armory' ? '强化' : '治疗';
    r.encounterPlayerPoint = { x: 422, y: 195 };
    r.interaction = { target: {}, action: '装备改装' }; r.drawStation(station, player); assert.equal(r.encounterLabelRects.length, 0); assert.ok(!r.calls.some(call => call.key === 'fillText'));
    r.interaction = { target: station, action: '' }; r.drawStation(station, player); assert.equal(r.encounterLabelRects.length, 0);
    r.interaction.action = action; r.drawStation(station, player); assert.equal(r.encounterLabelRects.length, 1); assert.ok(r.stormHazardLabels[0].text.includes(action));
    const a = r.encounterLabelRects[0], overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    assert.ok(!overlap(a, { left: 397, right: 451, top: 168, bottom: 222 }));
    r.lastPlayer = player; r.drawSalvageHuntMarker({ id: 30, x: station.x + 25, y: station.y + 15, radius: 22, name: '巡逻精英' });
    assert.equal(r.encounterLabelRects.length, 2); assert.ok(!overlap(a, r.encounterLabelRects[1]));
    r.calls.length = 0; r.mapId = 'frontier'; r.interaction = { target: {}, action: '' }; r.drawStation(station, player);
    assert.ok(r.calls.some(call => call.key === 'fillText' && call.args[0] === (kind === 'armory' ? '武器工坊' : '医疗站'))); assert.equal(r.stack.length, 0);
  }
});

test('salvage mortar silhouette stays visible without a permanent name while other modes retain the name', () => {
  const r = fixture(), enemy = { id: 40, type: 'mortar', x: 1120, y: 1020, radius: 20, hp: 100, maxHp: 100, angle: .2 };
  r.drawEnemy(enemy); assert.ok(r.calls.some(call => call.key === 'ellipse')); assert.ok(!r.calls.some(call => call.key === 'fillText'));
  r.calls.length = 0; r.mapId = 'frontier'; r.drawEnemy(enemy);
  assert.ok(r.calls.some(call => call.key === 'fillText' && call.args[0] === '炮击虫')); assert.equal(r.stack.length, 0);
});

test('new target pointers use one engine selection and terminal states never revive another objective', () => {
  const r = fixture(), game = gameFixture(), labels = [];
  r.updatePointerHud = () => {}; r.drawEncounterLabel = (...args) => labels.push(args); r.nexusPointerPosition = (x, y) => ({ x, y });
  for (const kind of ['node', 'hunt', 'mod']) {
    labels.length = 0; game.salvageTarget = () => ({ id: 20, kind, x: 2400, y: 1800, label: kind });
    r.drawObjectivePointers(game); assert.equal(labels.length, 1); assert.ok(labels[0][0].startsWith(kind)); assert.equal(r.nexusPointerRects.length, 1);
  }
  labels.length = 0; game.salvageTarget = () => null; r.drawObjectivePointers(game); assert.equal(labels.length, 0);
});

test('new event feedback is capped, non-textual and uses one shaped echo per node pulse without shake', () => {
  const r = fixture(), event = { x: 800, y: 500, nodeId: 20, salvageNodeId: 20, hazardType: 'ring', radius: 150, innerRadius: 70, modId: 'frost', friendly: true };
  r.consume([{ ...event, type: 'hazard-burst' }]); assert.equal(r.hazardEchoes.length, 1); assert.equal(r.hazardEchoes[0].salvageNodeId, 20);
  for (let i = 0; i < 300; i++) r.consume(['salvage-node-arm', 'salvage-node-reverse', 'hazard-burst', 'salvage-hunt-alert', 'salvage-hunt-defeated', 'salvage-mod-equipped', 'salvage-round-ready', 'salvage-round-shot', 'salvage-refit-hit'].map(type => ({ ...event, type })));
  assert.equal(r.numbers.length, 0); assert.equal(r.shake, 0); assert.ok(r.particles.length <= 420 && r.rings.length <= 20 && r.hazardEchoes.length <= 12 && r.arcs.length <= 20);
  assert.ok(r.rings.every(ring => !ring.fill));
});

test('real three-sector games draw actual node and patrol coordinates across boundary seeds without mutation', () => {
  for (const sectorId of ['scrapyard', 'frostport', 'stormcity']) for (const seed of [0, 1, 4294967295]) {
    const game = new Game({ mode: 'salvage', sectorId, seed }); game.start(); game.drainEvents();
    const r = fixture(), count = prepareRender(r), before = JSON.stringify(game); r.render(game, 0);
    assert.equal(JSON.stringify(game), before); assert.equal(count(), 1); assert.equal(r.salvageSectorId, sectorId);
    for (const node of game.salvage.nodes) assert.ok(r.calls.some(call => call.key === 'translate' && call.args[0] === node.x && call.args[1] === node.y));
    const enemy = game.enemies.find(item => item.id === game.salvage.hunt.enemyId); assert.ok(enemy);
    assert.ok(r.calls.some(call => call.key === 'translate' && call.args[0] === enemy.x && call.args[1] === enemy.y));
    r.calls.length = 0; r.drawSalvageMinimap(r.ctx, game, .08, false); assert.ok(!r.calls.some(call => call.key === 'fillText')); assert.equal(r.stack.length, 0);
  }
});

test('real node arm, friendly conversion and single burst retain the true countdown and footprint', () => {
  for (const sectorId of ['scrapyard', 'frostport', 'stormcity']) {
    const game = new Game({ mode: 'salvage', sectorId, seed: 31 }); game.start(); game.drainEvents();
    const node = game.salvage.nodes[0], r = fixture();
    game._armSalvageNode(node); game.update(.2, {}); game._armSalvageNode(node, true, 'pulse');
    const hazard = game.hazards.find(item => item.salvageNodeId === node.id), before = JSON.stringify(game);
    assert.ok(hazard.friendly && hazard.remaining < 1.2 && hazard.remaining > .9); r.drawHazard(hazard, game); r.drawSalvageNode(node, game.player);
    assert.equal(JSON.stringify(game), before); assert.ok(r.calls.some(call => call.key === 'stroke' && call.stroke === '#9affdd'));
    game.drainEvents(); for (let i = 0; i < 70; i++) game.update(1 / 60, {});
    const burst = game.drainEvents().filter(event => event.type === 'hazard-burst' && event.salvageNodeId === node.id);
    assert.equal(burst.length, 1); r.consume(burst); assert.equal(r.hazardEchoes.length, 1); assert.equal(r.hazardEchoes[0].type, node.kind); assert.equal(node.status, 'spent');
    r.drawEffects(); assert.equal(r.stack.length, 0);
  }
});
