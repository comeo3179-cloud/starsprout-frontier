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
  ['interact', '\n  function updateInteraction'], ['encounterStatus', '\n  function showRiftGuide'], ['showMap', '\n  function closeMap'],
  ['bindMenuChoice', '\n  function showMap']
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
    closeMap() {}, tone() {}, renderer: { drawMinimap() {} }, FrontierTouch: require('../touch-actions.js'),
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

function menuCard(dataset, disabled = false) {
  const listeners = new Map();
  return { dataset, disabled, addEventListener(type, callback) {
    if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback);
  }, send(type, values = {}) {
    const event = { type, pointerId: 3, pointerType: 'touch', isPrimary: false, clientX: 50, clientY: 50,
      detail: type === 'click' ? 1 : 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const listener of listeners.get(type) || []) listener(event);
    return event;
  } };
}

function upgradeUi() {
  const game = new Game({ mode: 'salvage', seed: 731 }); game.start();
  game.player.xp = game.player.xpNeeded; game._levelUp(); game.drainEvents();
  let buttons = [], now = 1000;
  const calls = [], touch = { moveX: 1, moveY: 0, shoot: true }, pointer = { down: true, shotQueued: true };
  const context = vm.createContext({ game, weapons: WEAPONS, touch, pointer, keys: new Set(['KeyD']), queuedDash: { remaining: .1 },
    stickResets: [], paused: false, screen: '', activeRevelation: null, lastPhase: 'upgrade', Date: { now: () => now },
    $: () => ({ querySelectorAll: () => buttons }), tone() {}, processEvents() {}, notify() {},
    showScreen(type, html) { context.screen = type; buttons = [...html.matchAll(/data-upgrade="([^"]+)"/g)].map(match => menuCard({ upgrade: match[1] })); },
    closeScreen() { context.screen = ''; context.clearInput(); }
  });
  vm.runInContext([
    implementation('clearInput', '\n  function canPlay'), implementation('canPlay', '\n\n  function tone'),
    implementation('bindMenuChoice', '\n  function showMap'),
    implementation('showUpgrade', '\n  function selectUpgrade'), implementation('selectUpgrade', '\n  function showRelics')
  ].join('\n'), context);
  const select = context.selectUpgrade;
  context.selectUpgrade = id => { calls.push(id); return select(id); };
  context.showUpgrade();
  return { game, context, touch, pointer, calls, card: () => buttons[0], advanceClock(ms) { now += ms; } };
}

test('a third finger can select an upgrade on release while cleared old stick input stays stopped', () => {
  const f = upgradeUi(), button = f.card(), elapsed = f.game.elapsed;
  f.game.update(.25, f.touch); assert.equal(f.game.elapsed, elapsed, 'Upgrade freezes the real simulation');
  assert.equal(button.send('pointerdown').defaultPrevented, false, 'Down permits native card scrolling and never selects');
  assert.deepEqual(f.calls, []); assert.equal(f.game.phase, 'upgrade');
  button.send('pointerup', { clientX: 52, clientY: 53 });
  assert.deepEqual(f.calls, [button.dataset.upgrade]); assert.equal(f.game.phase, 'playing'); assert.equal(f.context.screen, '');
  const start = { x: f.game.player.x, y: f.game.player.y }, ammo = f.game.player.ammo;
  f.game.update(.1, f.touch);
  assert.equal(f.game.player.x, start.x); assert.equal(f.game.player.y, start.y); assert.equal(f.game.player.ammo, ammo);
  assert.equal(f.pointer.down, false); assert.equal(f.pointer.shotQueued, false); assert.equal(f.context.queuedDash, null);
});

test('secondary upgrade scrolls and cancellations cannot choose, including a compatibility click after release', () => {
  for (const cancellation of ['move', 'return', 'cancel', 'release-distance', 'wrong-pointer']) {
    const f = upgradeUi(), button = f.card(); button.send('pointerdown');
    if (cancellation === 'move' || cancellation === 'return') button.send('pointermove', { clientY: 82 });
    if (cancellation === 'return') button.send('pointermove');
    if (cancellation === 'cancel') { f.advanceClock(5000); button.send('pointercancel'); }
    button.send('pointerup', cancellation === 'release-distance' ? { clientX: 75 } : cancellation === 'wrong-pointer' ? { pointerId: 9 } : {});
    button.send('click', { pointerType: 'touch' });
    assert.deepEqual(f.calls, [], cancellation); assert.equal(f.game.phase, 'upgrade');
  }
});

test('upgrade touch release deduplicates modern and legacy clicks while keyboard and fresh primary taps remain usable', () => {
  const f = upgradeUi(), button = f.card(); button.send('pointerdown'); f.advanceClock(5000); button.send('pointerup');
  for (const values of [{ pointerType: 'touch' }, { pointerType: undefined, sourceCapabilities: { firesTouchEvents: true } }, { pointerType: undefined }]) {
    assert.equal(button.send('click', values).defaultPrevented, true);
  }
  assert.equal(f.calls.length, 1);
  for (const input of ['keyboard', 'primary', 'mouse', 'pen']) {
    const next = upgradeUi(), target = next.card();
    target.send('pointerdown'); target.send('pointercancel');
    if (input === 'keyboard') target.send('click', { detail: 0, pointerType: '' });
    else {
      target.send('pointerdown', { pointerType: input === 'primary' ? 'touch' : input, isPrimary: true });
      target.send('pointerup', { pointerType: input === 'primary' ? 'touch' : input, isPrimary: true });
      target.send('click', { pointerType: input === 'primary' ? 'touch' : input });
    }
    assert.equal(next.calls.length, 1, input); assert.equal(next.game.phase, 'playing', input);
  }
});

function mapChoiceUi(kind, map = 'frontier') {
  const game = new Game({ mode: kind === 'salvageTarget' ? 'salvage' : 'standard', seed: 2 });
  if (!game.salvage) game.reset(map); game.start();
  const all = [], elements = new Map(), touch = { moveX: 1, moveY: 0, shoot: true }; let closes = 0;
  function container() {
    const element = node(); let html = '', cards = [];
    Object.defineProperty(element, 'innerHTML', { get: () => html, set(value) {
      html = value; cards = [...value.matchAll(/<button\b([^>]*)>/g)].map(match => {
        const dataset = {};
        for (const attr of match[1].matchAll(/data-([a-z-]+)="([^"]+)"/g)) dataset[attr[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = attr[2];
        const card = menuCard(dataset, /\bdisabled\b/.test(match[1])); all.push(card); return card;
      });
    } });
    element.querySelectorAll = selector => cards.filter(card => card.dataset[selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] !== undefined);
    return element;
  }
  const context = vm.createContext({ game, screen: '', paused: false, mapReturn: '', activeRevelation: null,
    trackedRelayId: game.relays[1]?.id ?? null, trackedContractId: null, trackedEncounterId: null,
    touch, pointer: { down: true, shotQueued: true }, keys: new Set(['KeyD']), queuedDash: { remaining: .1 }, stickResets: [],
    renderer: { drawMinimap() {} }, FrontierTouch: require('../touch-actions.js'),
    $: id => { if (!elements.has(id)) elements.set(id, container()); return elements.get(id); }, document: { createElement: container },
    showScreen(type, html) { context.screen = type; context.clearInput(); context.$('screen-content').innerHTML = html; },
    closeMap() { closes++; context.screen = ''; context.paused = false; context.clearInput(); }, tone() {}, notify() {}
  });
  vm.runInContext(functions + '\n' + implementation('salvageStateText', '\n  function showSalvageResult'), context); context.showMap();
  return { game, context, touch, card: all.find(card => card.dataset[kind] !== undefined && !card.disabled), disabled: all.find(card => card.disabled),
    closes: () => closes, selected: () => kind === 'salvageTarget' ? game.salvage.selectedId : context[{ target: 'trackedRelayId', contract: 'trackedContractId', encounter: 'trackedEncounterId' }[kind]] };
}

test('all four map destinations accept a secondary tap once and clear held input on return', () => {
  for (const kind of ['target', 'contract', 'encounter', 'salvageTarget']) {
    const f = mapChoiceUi(kind), button = f.card, before = f.selected();
    assert.equal(f.context.canPlay(), false); assert.notEqual(before, Number(button.dataset[kind]));
    button.send('pointerdown'); assert.equal(f.closes(), 0);
    button.send('pointerup'); assert.equal(f.selected(), Number(button.dataset[kind])); assert.equal(f.closes(), 1);
    button.send('click', { pointerType: 'touch' }); button.send('click', { pointerType: undefined }); assert.equal(f.closes(), 1);
    assert.equal(f.context.canPlay(), true); assert.equal(f.context.queuedDash, null); assert.equal(f.context.pointer.down, false);
    const beforePlayer = { x: f.game.player.x, y: f.game.player.y, ammo: f.game.player.ammo }; f.game.update(.1, f.touch);
    assert.deepEqual({ x: f.game.player.x, y: f.game.player.y, ammo: f.game.player.ammo }, beforePlayer);
  }
});

test('map scrolling, cancellation and disabled targets never choose, while ordinary and keyboard clicks still work', () => {
  for (const kind of ['target', 'contract', 'encounter', 'salvageTarget']) for (const cancellation of ['scroll', 'cancel']) {
    const f = mapChoiceUi(kind), button = f.card, before = f.selected(); button.send('pointerdown');
    button.send(cancellation === 'scroll' ? 'pointermove' : 'pointercancel', { clientY: 95 }); button.send('pointerup'); button.send('click', { pointerType: 'touch' });
    assert.equal(f.selected(), before); assert.equal(f.closes(), 0); assert.equal(f.context.canPlay(), false);
    button.send('click', { pointerType: 'mouse' }); assert.equal(f.closes(), 1);
    const keyboard = mapChoiceUi(kind); keyboard.card.send('click', { detail: 0, pointerType: '' }); assert.equal(keyboard.closes(), 1);
  }
  const locked = mapChoiceUi('target', 'frost'); assert.ok(locked.disabled);
  locked.disabled.send('pointerdown'); locked.disabled.send('pointerup'); locked.disabled.send('click', { detail: 0 }); assert.equal(locked.closes(), 0);
  const changing = mapChoiceUi('salvageTarget'); changing.card.send('pointerdown'); changing.card.disabled = true; changing.card.send('pointerup'); assert.equal(changing.closes(), 0);
});

function rewardUi(kind) {
  const game = new Game({ seed: 2 }); game.start();
  const terminal = (kind === 'relic' ? game.contracts : game.encounters)[0]; terminal.status = 'ready';
  game.player.x = terminal.x; game.player.y = terminal.y;
  assert.equal(game.interact(), true); assert.equal(game.phase, kind); game.drainEvents();
  let buttons = []; const calls = [], touch = { moveX: 1, moveY: 0, shoot: true };
  const context = vm.createContext({ game, touch, weapons: WEAPONS, Expedition: require('../action-engine.js'),
    pointer: { down: true, shotQueued: true }, keys: new Set(['KeyD']), queuedDash: { remaining: .1 }, stickResets: [], paused: false,
    screen: '', activeRevelation: null, lastPhase: kind, Date: { now: () => 1000 }, tone() {}, processEvents() {},
    $: () => ({ querySelectorAll: () => buttons }), showScreen(type, html) {
      context.screen = type; context.clearInput(); buttons = [...html.matchAll(new RegExp('data-' + kind + '="([^" ]+)"', 'g'))].map(match => menuCard({ [kind]: match[1] }));
    }, closeScreen() { context.screen = ''; context.clearInput(); }
  });
  vm.runInContext([
    implementation('clearInput', '\n  function canPlay'), implementation('canPlay', '\n\n  function tone'), implementation('bindMenuChoice', '\n  function showMap'),
    implementation('showRelics', '\n  function selectRelic'), implementation('selectRelic', '\n  function showResult'),
    implementation('showTactics', '\n  function selectTactic'), implementation('selectTactic', '\n  function addTacticSummary')
  ].join('\n'), context);
  const method = kind === 'relic' ? 'selectRelic' : 'selectTactic', select = context[method]; context[method] = id => { calls.push(id); return select(id); };
  context[kind === 'relic' ? 'showRelics' : 'showTactics']();
  return { game, context, touch, calls, card: buttons[0], acquired: () => kind === 'relic' ? game.relics.includes(buttons[0].dataset[kind]) : game.tacticId === buttons[0].dataset[kind] };
}

test('legal terminal relic and tactic rewards accept secondary release once and resume without old input', () => {
  for (const kind of ['relic', 'tactic']) {
    const f = rewardUi(kind), elapsed = f.game.elapsed; f.game.update(.25, f.touch); assert.equal(f.game.elapsed, elapsed);
    f.card.send('pointerdown'); assert.equal(f.acquired(), false); assert.equal(f.game.phase, kind);
    f.card.send('pointerup'); assert.equal(f.acquired(), true); assert.equal(f.game.phase, 'playing'); assert.equal(f.context.screen, '');
    f.card.send('click', { pointerType: 'touch' }); f.card.send('click', { pointerType: undefined }); assert.equal(f.calls.length, 1);
    const before = { x: f.game.player.x, y: f.game.player.y, ammo: f.game.player.ammo }; f.game.update(.1, f.touch);
    assert.deepEqual({ x: f.game.player.x, y: f.game.player.y, ammo: f.game.player.ammo }, before); assert.equal(f.context.queuedDash, null);
  }
});

test('reward card drags and cancellations preserve the pending legal reward and keyboard selection', () => {
  for (const kind of ['relic', 'tactic']) for (const cancellation of ['pointermove', 'pointercancel']) {
    const f = rewardUi(kind); f.card.send('pointerdown'); f.card.send(cancellation, { clientY: 85 }); f.card.send('pointerup'); f.card.send('click', { pointerType: 'touch' });
    assert.equal(f.acquired(), false); assert.equal(f.game.phase, kind); assert.equal(f.context.canPlay(), false); assert.equal(f.calls.length, 0);
    f.card.send('click', { detail: 0, pointerType: '' }); assert.equal(f.acquired(), true); assert.equal(f.game.phase, 'playing'); assert.equal(f.calls.length, 1);
  }
});

test('cargo drop control follows a real pickup and is disabled while the map or pause owns input', () => {
  const { game, context, element } = ui();
  game.reset('frontier', { mode: 'salvage', seed: 731 }); game.start();
  const cargo = game.salvage.hotCargo;
  context.updateInteraction(); assert.equal(element('cargo-control').classList.contains('hidden'), true);
  Object.assign(game.player, { x: cargo.x, y: cargo.y });
  assert.equal(game.interact(), true); assert.equal(cargo.status, 'carried');
  context.updateInteraction(); assert.equal(element('cargo-control').classList.contains('hidden'), false);
  assert.equal(element('cargo-drop').disabled, false); assert.match(element('cargo-status').textContent, /480.*12s/);
  context.screen = 'map'; context.updateInteraction(); assert.equal(element('cargo-drop').disabled, true);
  context.screen = ''; context.paused = true; context.updateInteraction(); assert.equal(element('cargo-drop').disabled, true);
  context.paused = false; context.updateInteraction(); assert.equal(element('cargo-drop').disabled, false);
  context.dropCargo(); context.updateInteraction();
  assert.equal(cargo.status, 'dropped'); assert.equal(element('cargo-control').classList.contains('hidden'), true);
});

test('dropping cargo preserves held movement, aim and ammunition instead of clearing combat input', () => {
  const { game, context } = ui();
  game.reset('frontier', { mode: 'salvage', seed: 731 }); game.start();
  const cargo = game.salvage.hotCargo; Object.assign(game.player, { x: cargo.x, y: cargo.y });
  assert.equal(game.interact(), true);
  context.touch.moveX = .8; context.touch.moveY = -.3; context.touch.shoot = true;
  context.keys.add('KeyW'); context.pointer.down = true;
  const before = { ...context.movement(), ammo: game.player.ammo };
  context.dropCargo();
  assert.equal(cargo.status, 'dropped');
  assert.deepEqual({ ...context.movement(), ammo: game.player.ammo }, before);
  assert.equal(context.touch.shoot, true); assert.equal(context.pointer.down, true);
});
