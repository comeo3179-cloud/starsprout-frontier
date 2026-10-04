'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Game, WEAPONS } = require('../action-engine.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'action.js'), 'utf8').replace(/\r\n/g, '\n');
function implementation(name, next) {
  const start = source.indexOf('  function ' + name + '('), end = source.indexOf(next, start);
  assert.ok(start >= 0 && end > start, 'Find the actual ' + name + ' implementation');
  return source.slice(start, end);
}
const functions = [
  ['clearInput', '\n  function canPlay'], ['canPlay', '\n\n  function tone'],
  ['movement', '\n  function requestDash'], ['requestDash', '\n  function updateDashBuffer'],
  ['updateDashBuffer', '\n  function updateDashControl'], ['updateDashControl', "\n  FrontierTouch.bindTouchAction($('dash-button')"],
  ['updateCoach', '\n  function updateHUD'], ['updateReloadMeter', '\n  function updateCoach'], ['updateInteraction', '\n  function switchWeapon'],
  ['interact', '\n  function updateInteraction'], ['encounterStatus', '\n  function showRiftGuide'], ['showMap', '\n  function closeMap']
].map(([name, next]) => implementation(name, next)).join('\n');

function node() {
  const classes = new Set(), children = new Map();
  return {
    textContent: '', innerHTML: '', style: {}, attributes: {}, children: [],
    classList: { toggle(name, value) { const add = value === undefined ? !classes.has(name) : !!value; if (add) classes.add(name); else classes.delete(name); return add; }, contains: name => classes.has(name) },
    querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
    querySelectorAll: () => [], addEventListener() {},
    append(child) { this.children.push(child); },
    prepend(child) { this.children.unshift(child); },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

function ui(map = 'frontier') {
  const game = new Game({ random: () => .5 }); game.reset(map); game.start();
  game.obstacles = []; game.spawnTimer = 999; game.drainEvents();
  const elements = new Map(), created = [], saved = [], notifications = [];
  const element = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
  const state = {
    game, weapons: WEAPONS, paused: false, screen: '', activeRevelation: null, queuedDash: null, dashBufferWindow: .12,
    keys: new Set(), touch: { moveX: 0, moveY: 0, shoot: false }, pointer: {}, stickResets: [],
    coachDismissed: false, phaseCoachSeen: false, coachStep: 0, coachMoveDistance: 0,
    runStats: { shots: WEAPONS.map(() => 0), dashes: 0, perfectReloads: 0 },
    trackedContractId: null, trackedEncounterId: null, trackedRelayId: game.relays[0].id, mapReturn: '', coarse: false,
    $: element, setText: (id, value) => { element(id).textContent = String(value); },
    save: (...args) => saved.push(args), notify: message => notifications.push(message), act: action => action(),
    profiles: { recordCoach: () => saved.push(['coach', 'done']) },
    closeMap() {}, tone() {}, renderer: { drawMinimap() {} },
    document: { createElement: () => { const result = node(); created.push(result); return result; } }
  };
  state.window = { matchMedia: () => ({ matches: state.coarse }) };
  state.showScreen = (screen, html) => { state.screen = screen; element('screen-content').innerHTML = html; };
  const context = vm.createContext(state);
  vm.runInContext("'use strict';\n" + functions, context);
  return { game, context, element, created, saved, notifications, tick(dt) { game.update(dt); context.updateDashBuffer(dt); } };
}

test('dash executes immediately when ready, but only buffers the last 120 ms of cooldown', () => {
  const { game, context, tick } = ui();
  context.keys.add('KeyD');
  assert.equal(context.requestDash(), true);
  assert.equal(game.dashVector.x, 1); assert.ok(game.player.dashTimer > 0);
  assert.equal(context.requestDash(), false, 'Do not queue another dash during an active dash');
  game.player.dashTimer = 0; game.player.dashCooldown = .121;
  assert.equal(context.requestDash(), false);
  tick(.2);
  assert.equal(game.drainEvents().filter(event => event.type === 'dash').length, 1);
});

test('a buffered dash preserves its pressed direction, runs once, and cannot be replaced by another press', () => {
  const { game, context, tick } = ui();
  game.player.dashCooldown = .1; context.keys.add('KeyD');
  assert.equal(context.requestDash(), true);
  tick(.06);
  context.keys.clear(); context.keys.add('KeyA');
  assert.equal(context.requestDash(), false);
  tick(.05);
  assert.equal(context.queuedDash, null);
  assert.equal(game.dashVector.x, 1, 'Use the first press direction, not a later movement input');
  assert.ok(game.player.dashTimer > 0);
  for (let i = 0; i < 20; i++) tick(.2);
  assert.equal(game.drainEvents().filter(event => event.type === 'dash').length, 1);
});

test('hit-stop does not consume a buffered press and neutral movement snapshots the previous direction', () => {
  const { game, context, tick } = ui();
  game.moveVector = { x: -1, y: 0 }; game.player.dashCooldown = .04;
  assert.equal(context.requestDash(), true);
  game.moveVector = { x: 0, y: 1 };
  for (let i = 0; i < 30; i++) tick(0);
  assert.equal(context.queuedDash.remaining, .12);
  tick(.05);
  assert.equal(game.dashVector.x, -1); assert.equal(game.dashVector.y, 0);
});

test('clearing input or leaving play cancels buffered dashes before returning to the game', () => {
  for (const transition of ['clear', 'pause', 'menu', 'upgrade', 'relic', 'lost']) {
    const { game, context, tick } = ui();
    game.player.dashCooldown = .08; context.keys.add('KeyW'); context.requestDash();
    if (transition === 'clear') context.clearInput();
    else {
      if (transition === 'pause') context.paused = true;
      else if (transition === 'menu') context.screen = 'map';
      else game.phase = transition;
      context.updateDashBuffer(0);
    }
    assert.equal(context.queuedDash, null, transition);
    context.paused = false; context.screen = ''; game.phase = 'playing';
    tick(.12);
    assert.equal(game.drainEvents().filter(event => event.type === 'dash').length, 0, transition);
  }
});

test('the touch dash button opens during the buffer window without waiting for a full HUD refresh', () => {
  const { game, context, element } = ui();
  game.player.dashCooldown = .13; context.updateDashControl();
  assert.equal(element('dash-button').disabled, true);
  game.player.dashCooldown = .11; context.updateDashControl();
  assert.equal(element('dash-button').disabled, false);
  context.requestDash(); context.updateDashControl();
  assert.equal(element('dash-button').disabled, true);
  assert.equal(element('dash-label').textContent, '冲刺待发');
});

test('training stays visible across HUD refreshes when no rift is being tracked', () => {
  for (const map of ['frontier', 'foundry', 'frost', 'storm']) {
    const { game, context, element } = ui(map);
    for (const elapsed of [1, 9]) {
      game.elapsed = elapsed;
      for (let refresh = 0; refresh < 12; refresh++) {
        context.updateCoach();
        assert.equal(element('field-coach').classList.contains('hidden'), false, map + ' refresh ' + refresh);
      }
      assert.match(element('coach-text').textContent, /移动.*射击/);
    }
  }
});

test('locked escort segments do not dismiss training before a real objective is started', () => {
  for (const map of ['frontier', 'foundry', 'frost']) {
    const { game, context, saved } = ui(map);
    game.phase = 'ready'; context.screen = 'welcome'; context.updateCoach();
    assert.equal(context.coachDismissed, false, map); assert.equal(saved.length, 0, map);
    game.start(); context.screen = '';
    Object.assign(game.player, { x: game.relays[0].x, y: game.relays[0].y });
    assert.equal(game.interact(), true);
    context.updateCoach(); context.updateCoach();
    assert.equal(context.coachDismissed, true, map);
    assert.deepEqual(saved, [['coach', 'done']], 'Persist completion to the active profile only once');
  }
});

test('an active rift temporarily hides teaching without completing or skipping its current step', () => {
  const { game, context, element, saved } = ui();
  const encounter = game.encounters[0];
  context.trackedEncounterId = encounter.id;
  context.updateCoach();
  assert.match(element('coach-text').textContent, /移动.*射击/);
  for (const status of ['active', 'ready']) {
    encounter.status = status; context.updateCoach();
    assert.equal(element('field-coach').classList.contains('hidden'), true, status);
    assert.equal(context.coachDismissed, false);
  }
  encounter.status = 'complete'; context.updateCoach();
  assert.equal(element('field-coach').classList.contains('hidden'), false);
  assert.match(element('coach-text').textContent, /移动.*射击/);
  assert.deepEqual(saved, []);
});

test('teaching waits for each real action and ignores premature dash, ordinary reload and failed precision', () => {
  const { game, context, element, saved } = ui('frost');
  context.advanceCoach('dash'); context.advanceCoach('reload-perfect'); context.updateCoach();
  assert.equal(context.coachStep, 0);
  context.coachMoveDistance = 60; context.advanceCoach();
  assert.equal(context.coachStep, 0, 'Moving alone does not skip shooting');
  game.update(1 / 60, { aimX: 1, aimY: 0, shoot: true });
  assert.ok(game.drainEvents().some(event => event.type === 'shot' && event.owner === 'player'));
  context.runStats.shots[0]++;
  context.advanceCoach('shot'); context.updateCoach();
  assert.equal(context.coachStep, 1); assert.match(element('coach-text').textContent, /Shift.*冲刺/);
  context.advanceCoach('reload-perfect');
  assert.equal(context.coachStep, 1, 'Precision before the dash step does not complete teaching');
  assert.equal(game.dash({ x: 1, y: 0 }), true);
  context.advanceCoach('dash'); context.updateCoach();
  assert.equal(context.coachStep, 2); assert.match(element('coach-text').textContent, /绿色区.*精准装填/);
  context.advanceCoach('reload'); context.advanceCoach('reload-miss'); context.updateCoach();
  assert.equal(context.coachStep, 2); assert.equal(saved.length, 0);
  context.advanceCoach('reload-perfect'); context.updateCoach(); context.updateCoach();
  assert.equal(context.coachStep, 3); assert.equal(element('field-coach').classList.contains('hidden'), true);
  assert.deepEqual(saved, [['coach', 'done']], 'Record only the actual completion once');
});

test('teaching does not time out unfinished steps and respects an existing completion preference', () => {
  const { game, context, element, saved } = ui('frost');
  game.elapsed = 90; context.updateCoach();
  assert.equal(element('field-coach').classList.contains('hidden'), false);
  assert.equal(context.coachStep, 0); assert.equal(saved.length, 0);
  context.paused = true; context.updateCoach();
  assert.equal(element('field-coach').classList.contains('hidden'), true);
  context.paused = false; context.coachDismissed = true; context.updateCoach();
  assert.equal(element('field-coach').classList.contains('hidden'), true);
  context.coachMoveDistance = 60; context.runStats.shots[0] = 1; context.advanceCoach('dash');
  assert.equal(context.coachStep, 0, 'Existing completion stays unchanged');
  assert.equal(saved.length, 0);
});

test('module deployment cooldown explains missing effects without disabling normal actions', () => {
  const { game, context, element } = ui();
  game.tacticId = 'decoy-dash'; game.tactical.cooldown = 2.2;
  game.player.dashCooldown = 0; context.updateDashControl();
  assert.equal(element('dash-button').disabled, false);
  assert.match(element('dash-label').textContent, /冲刺.*诱饵3s/);
  assert.match(element('dash-button').attributes['aria-label'], /诱饵.*3/);
  game.player.dashCooldown = 1.2; context.updateDashControl();
  assert.equal(element('dash-label').textContent, '1.2s');
  game.player.dashCooldown = 0; game.tactical.cooldown = 0; context.updateDashControl();
  assert.equal(element('dash-label').textContent, '诱饵冲刺');
  game.tacticId = 'reload-mine'; game.tactical.cooldown = 2.2; context.updateReloadMeter();
  assert.match(element('active-reload-title').textContent, /布雷3s/);
  game.tactical.cooldown = 0; context.updateReloadMeter();
  assert.equal(element('active-reload-title').textContent, '精准装填 · 布雷');
});

test('interaction UI distinguishes actionable controls from a passive status and explains failed actions', () => {
  const { game, context, element, notifications } = ui();
  const medical = game.stations.find(station => station.kind === 'medical');
  Object.assign(game.player, { x: medical.x, y: medical.y, hp: game.player.maxHp, credits: 0 });
  context.updateInteraction();
  assert.equal(element('touch-interact').disabled, true);
  assert.equal(element('interaction-hint').querySelector('kbd').classList.contains('hidden'), true);
  assert.equal(element('interaction-hint').querySelector('span').textContent, game.interactionState().hint);
  game.player.hp = 40; context.interact();
  assert.equal(notifications.at(-1), game.interactionState().hint);
  game.player.credits = medical.cost; context.coarse = true; context.updateInteraction();
  assert.equal(element('touch-interact').disabled, false);
  assert.equal(element('touch-interact').textContent, game.interactionState().action);
  assert.equal(element('interaction-hint').querySelector('kbd').textContent, '点按');
  assert.equal(element('interaction-hint').querySelector('kbd').classList.contains('hidden'), false);
  context.screen = 'pause'; context.updateInteraction();
  assert.equal(element('touch-interact').disabled, true);
  assert.equal(element('interaction-hint').classList.contains('hidden'), true);
});

test('the tactical map measures the active contract target, then the reward terminal', () => {
  const { game, context, created } = ui();
  const contract = game.contracts[0];
  Object.assign(game.player, { x: contract.x, y: contract.y });
  assert.equal(game.interact(), true);
  Object.assign(game.player, { x: contract.nodes[0].x, y: contract.nodes[0].y });
  context.showMap();
  const card = created.find(element => element.className === 'contract-destinations');
  assert.match(card.innerHTML, /0\/3 · 下一目标 0 m/);
  context.screen = ''; contract.status = 'ready'; context.showMap();
  const rewardCard = created.filter(element => element.className === 'contract-destinations').at(-1);
  assert.match(rewardCard.innerHTML, /返回领取奖励 · 领奖终端 20 m/);
});

test('touch dash remains available for a legal ice pursuit while ordinary cooldown is active', () => {
  const { game, context, element, tick } = ui();
  const enemy = game.spawnEnemy('tank', { x: game.player.x + 70, y: game.player.y });
  enemy.hp = enemy.maxHp = 1000;
  game.player.slowTimer = 1;
  context.keys.add('KeyD');
  assert.equal(context.requestDash(), true);
  tick(.2);
  assert.ok(game.player.dashCooldown > .12);
  assert.equal(game.player.iceChaseReady, true);
  context.updateDashControl();
  assert.equal(element('dash-button').disabled, false);
  assert.equal(element('dash-label').textContent, '转向追击');
  context.keys.clear(); context.keys.add('KeyA');
  assert.equal(context.requestDash(), true);
  assert.equal(game.player.iceChaseReady, false);
  assert.ok(game.player.dashCooldown >= game.player.dashCooldownMax + .8);
});
