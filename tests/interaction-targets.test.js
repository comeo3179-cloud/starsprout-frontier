'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../action-engine.js');

function arena(mapId = 'frontier') {
  const game = new Game({ mapId, random: () => 0.5 });
  game.start();
  game.spawnTimer = Infinity;
  game.obstacles = [];
  return game;
}

function at(game, target, dx = 0) {
  game.player.x = target.x + dx;
  game.player.y = target.y;
}

function selected(game, target, action) {
  const state = game.interactionState();
  assert.equal(state.target, target);
  assert.equal(state.action, action);
  assert.equal(game._nearestInteractable(), target);
  assert.equal(game.interactionHint(), state.hint);
  return state;
}

function passingSalvageDrone() {
  const game = new Game({ mode: 'salvage', seed: 731 }); game.start();
  const drone = game.salvage.sources.find(source => source.kind === 'drone');
  const crate = game.crates.find(item => item.x === 1850 && item.y === 830);
  // Position fixture at the real patrol's southwest corner and the real supply crate.
  Object.assign(drone, drone.path[3], { pathIndex: 0 });
  Object.assign(game.player, { x: crate.x, y: crate.y - 50 });
  return { game, drone, crate };
}

test('a passing locked salvage drone cannot disable an available supply crate', () => {
  const { game, drone, crate } = passingSalvageDrone();
  assert.ok(Math.hypot(drone.x - game.player.x, drone.y - game.player.y) < 94);
  assert.equal(drone.status, 'flying');
  selected(game, crate, '开启');
  assert.equal(game.interact(), true);
  assert.equal(crate.opened, true); assert.equal(game.player.credits, 14);
  assert.equal(drone.status, 'flying'); assert.equal(drone.hp, 90); assert.equal(game.salvage.alarm, 0);
  assert.match(selected(game, drone, '').hint, /先射击截停/);
});

test('an executable salvage recovery keeps its priority and returns to the supply after collection', () => {
  const { game, drone, crate } = passingSalvageDrone();
  game._damageSalvageSource(drone, 90);
  selected(game, drone, '回收'); assert.equal(game.interact(), true);
  assert.equal(game.salvage.carried, 3); assert.equal(game.salvage.alarm, 12); assert.equal(crate.opened, false);
  selected(game, crate, '开启'); assert.equal(game.interact(), true);
  assert.equal(game.player.credits, 14); assert.equal(game.salvage.carried, 3);
});

test('salvage interaction fallback never enables supply actions during a paused choice or terminal phase', () => {
  const { game, drone, crate } = passingSalvageDrone();
  for (const phase of ['upgrade', 'relic', 'ready', 'won', 'lost']) {
    game.phase = phase; selected(game, drone, ''); assert.equal(game.interact(), false);
    assert.equal(crate.opened, false); assert.equal(game.player.credits, 0);
  }
});

test('a busy foundry contract no longer hides the nearby supply crate', () => {
  const game = arena('foundry');
  const hunt = game.contracts.find(contract => contract.kind === 'hunt');
  at(game, hunt);
  assert.equal(game.interact(), true);
  Object.assign(game.player, { x: 2280, y: 1200 });
  const crate = game.crates.find(item => item.x === 2280 && item.y === 1130);
  assert.ok(Math.hypot(game.player.x - hunt.x, game.player.y - hunt.y) < Math.hypot(game.player.x - crate.x, game.player.y - crate.y));
  assert.match(selected(game, crate, '开启').hint, /打开补给箱/);
  assert.equal(game.interact(), true);
  assert.equal(crate.opened, true);
  assert.equal(game.player.credits, 14);
  assert.equal(hunt.status, 'active');
  assert.match(selected(game, hunt, '').hint, /0\/2/);
  assert.equal(game.interact(), false);
});

test('when several actions are available the nearest one remains selected', () => {
  const game = arena();
  const station = game.stations[0], crate = game.crates[0];
  Object.assign(crate, { x: station.x + 60, y: station.y });
  game.player.hp = 50;
  game.player.credits = station.cost;
  at(game, station, 10);
  selected(game, station, '治疗');
  at(game, station, 40);
  selected(game, crate, '开启');
});

test('interaction range includes 94 pixels but not a point beyond it', () => {
  const game = arena(), crate = game.crates[0];
  at(game, crate, 94.001);
  assert.equal(game.interactionState().target, null);
  assert.equal(game.interactionState().action, '');
  assert.equal(game.interact(), false);
  at(game, crate, 94);
  selected(game, crate, '开启');
  assert.equal(game.interact(), true);
  assert.equal(crate.opened, true);
  assert.equal(game.interactionState().target, null);
});

test('medical stations explain missing credits, accept the exact cost, and reject full health', () => {
  const game = arena(), station = game.stations[0];
  at(game, station);
  game.player.hp = 50;
  game.player.credits = station.cost - 1;
  assert.match(selected(game, station, '').hint, /芯片不足/);
  assert.equal(game.interact(), false);
  assert.equal(game.player.hp, 50);
  assert.equal(station.uses, 0);
  game.player.credits = station.cost;
  selected(game, station, '治疗');
  assert.equal(game.interact(), true);
  assert.equal(game.player.hp, 100);
  assert.equal(game.player.credits, 0);
  game.player.hp = game.player.maxHp;
  game.player.credits = 100;
  assert.equal(selected(game, station, '').hint, '生命已满');
  assert.equal(game.interact(), false);
  assert.equal(game.player.credits, 100);
});

test('workshops preserve their exact credit cost and four-use cap', () => {
  const game = arena(), station = game.stations.find(item => item.kind === 'armory');
  at(game, station);
  station.uses = 3;
  game.player.credits = station.cost - 1;
  assert.match(selected(game, station, '').hint, /芯片不足/);
  assert.equal(game.interact(), false);
  game.player.credits = station.cost;
  selected(game, station, '强化');
  assert.equal(game.interact(), true);
  assert.equal(station.uses, 4);
  assert.equal(game.player.credits, 0);
  assert.ok(Math.abs(game.player.damageMultiplier - 1.08) < 1e-9);
  game.player.credits = 100;
  assert.equal(selected(game, station, '').hint, '工坊强化已达上限');
  assert.equal(game.interact(), false);
  assert.equal(game.player.credits, 100);
});

test('full medical stations and capped workshops cannot hide another usable target', () => {
  for (const kind of ['medical', 'armory']) {
    const game = arena(), station = game.stations.find(item => item.kind === kind), crate = game.crates[0];
    station.uses = kind === 'armory' ? 4 : 0;
    game.player.credits = 100;
    Object.assign(crate, { x: station.x + 50, y: station.y });
    at(game, station);
    selected(game, crate, '开启');
    assert.equal(game.interact(), true);
    assert.equal(crate.opened, true);
    assert.equal(station.uses, kind === 'armory' ? 4 : 0);
  }
});

test('relay actions respect the map mode, current objective, and locked escort segments', () => {
  for (const [mapId, action] of [['frontier', '启动'], ['foundry', '暴露'], ['frost', '启动']]) {
    const game = arena(mapId), first = game.relays[0], next = game.relays[1];
    at(game, first);
    selected(game, first, action);
    assert.equal(game.interact(), true);
    assert.equal(first.status, 'charging');
    at(game, next);
    if (mapId === 'frost') {
      assert.equal(game.interactionState().target, null);
      assert.equal(next.status, 'locked');
    } else assert.equal(selected(game, next, '').hint, '先完成当前主目标');
    assert.equal(game.interact(), false);
  }
});

test('contract states allow one active mission and keep its reward claim executable', () => {
  const game = arena(), contract = game.contracts[0], other = game.contracts[1];
  at(game, contract);
  selected(game, contract, '接取');
  assert.equal(game.interact(), true);
  assert.equal(contract.status, 'active');
  selected(game, contract, '');
  assert.equal(game.interact(), false);
  at(game, other);
  assert.match(selected(game, other, '').hint, /先完成当前支线/);
  assert.equal(game.interact(), false);
  assert.equal(other.status, 'idle');
  for (const core of contract.nodes) { at(game, core); assert.equal(game.interact(), true); }
  assert.equal(contract.status, 'ready');
  at(game, other);
  selected(game, other, '');
  assert.equal(game.interact(), false);
  at(game, contract);
  selected(game, contract, '领取');
  assert.equal(game.interact(), true);
  assert.equal(contract.status, 'complete');
  assert.equal(game.phase, 'relic');
  assert.equal(game.player.credits, 30);
});

test('salvage cores are selectable only during their active contract and only once', () => {
  const game = arena(), contract = game.contracts[0], core = contract.nodes[2];
  at(game, core);
  assert.equal(game.interactionState().target, null);
  assert.equal(game.interact(), false);
  at(game, contract);
  game.interact();
  at(game, core);
  selected(game, core, '回收');
  assert.equal(game.interact(), true);
  assert.equal(contract.progress, 1);
  assert.equal(game.interactionState().target, null);
  assert.equal(game.interact(), false);
  assert.equal(contract.progress, 1);
});

test('paused, welcome, and terminal phases expose no executable interaction', () => {
  const game = arena(), crate = game.crates[0];
  at(game, crate);
  for (const phase of ['ready', 'upgrade', 'relic', 'won', 'lost']) {
    game.phase = phase;
    selected(game, crate, '');
    assert.equal(game.interact(), false);
    assert.equal(crate.opened, false);
    assert.equal(game.player.credits, 0);
  }
  game.phase = 'playing';
  selected(game, crate, '开启');
  assert.equal(game.interact(), true);
});

test('away from nearby facilities the current map objective still supplies its return hint', () => {
  for (const [mapId, text] of [['frontier', '返回信标光圈'], ['foundry', '射击反应堆核心'], ['frost', '返回运输机光圈']]) {
    const game = arena(mapId);
    game.relays[0].status = 'charging';
    Object.assign(game.player, { x: 3000, y: 2300 });
    const state = game.interactionState();
    assert.equal(state.target, null);
    assert.equal(state.action, '');
    assert.ok(state.hint.includes(text));
  }
});
