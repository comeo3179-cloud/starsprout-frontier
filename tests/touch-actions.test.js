'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bindTouchAction } = require('../touch-actions.js');
const { Game } = require('../action-engine.js');

function button() {
  const listeners = new Map();
  return {
    disabled: false, attributes: {},
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    send(type, properties = {}) {
      const event = { type, pointerId: 2, pointerType: 'touch', isPrimary: false,
        detail: type === 'click' ? 1 : 0, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...properties };
      for (const callback of listeners.get(type) || []) callback(event);
      return event;
    }
  };
}

test('a secondary touch triggers on down without waiting for a synthetic click', () => {
  const target = button(), calls = [];
  bindTouchAction(target, event => calls.push(event.type));
  assert.equal(target.send('pointerdown').defaultPrevented, true);
  assert.deepEqual(calls, ['pointerdown']);
  target.send('pointerup');
  assert.deepEqual(calls, ['pointerdown']);
  target.send('pointerdown', { pointerId: 3 });
  assert.equal(calls.length, 2, 'A later secondary finger is not left locked out');
});

test('primary and secondary touch compatibility clicks cannot double-trigger an action', () => {
  for (const isPrimary of [true, false]) {
    const target = button(); let calls = 0;
    bindTouchAction(target, () => calls++);
    target.send('pointerdown', { isPrimary });
    target.send('pointerup', { isPrimary });
    for (const properties of [
      { pointerType: 'touch' },
      { pointerType: undefined, sourceCapabilities: { firesTouchEvents: true } },
      { pointerType: undefined }
    ]) assert.equal(target.send('click', properties).defaultPrevented, true);
    assert.equal(calls, 1);
  }
});

test('weapon touch actions allow native horizontal pan while preserving secondary presses and click deduplication', () => {
  const target = button(), calls = [];
  bindTouchAction(target, event => calls.push(event.type), true);
  assert.equal(target.send('pointerdown').defaultPrevented, false, 'The browser may begin native pan on a weapon slot');
  target.send('pointercancel');
  assert.equal(target.send('click').defaultPrevented, true, 'Canceled scroll must not repeat the initial selection');
  assert.deepEqual(calls, ['pointerdown']);
  target.send('pointerdown', { pointerId: 3 }); target.send('pointerup', { pointerId: 3 });
  assert.equal(target.send('click', { pointerType: 'touch' }).defaultPrevented, true);
  assert.deepEqual(calls, ['pointerdown', 'pointerdown']);
  target.send('click', { pointerType: '', detail: 0 });
  assert.equal(calls.length, 3, 'Keyboard activation still works after a pan');
});

test('keyboard and real mouse/pen clicks remain available immediately after touch', () => {
  const target = button(); let calls = 0;
  bindTouchAction(target, () => calls++);
  target.send('pointerdown');
  target.send('pointerup');
  target.send('click', { pointerType: '', detail: 0 });
  assert.equal(calls, 2, 'Keyboard/assistive click is never consumed by touch deduplication');
  for (const pointerType of ['mouse', 'pen']) {
    assert.equal(target.send('pointerdown', { pointerType }).defaultPrevented, false);
    assert.equal(calls, pointerType === 'mouse' ? 2 : 3, 'Mouse/pen down waits for click');
    target.send('click', { pointerType: undefined });
  }
  assert.equal(calls, 4);
});

test('native disabled and aria-disabled controls cannot run; enabling before ghost click does not run either', () => {
  const target = button(); let calls = 0;
  bindTouchAction(target, () => calls++);
  target.disabled = true;
  target.send('pointerdown');
  target.send('click', { detail: 0 });
  target.disabled = false;
  target.send('click');
  assert.equal(calls, 0);
  target.attributes['aria-disabled'] = 'true';
  target.send('pointerdown');
  target.send('click', { pointerType: 'mouse' });
  assert.equal(calls, 0);
  target.attributes['aria-disabled'] = 'false';
  target.send('pointerdown', { pointerId: 4 });
  assert.equal(calls, 1);
});

test('cancel and lost capture do not repeat or block actions and binding can be removed', () => {
  const target = button(); let calls = 0;
  const unbind = bindTouchAction(target, () => calls++);
  target.send('pointerdown');
  target.send('pointercancel');
  target.send('lostpointercapture');
  target.send('pointerup');
  assert.equal(calls, 1);
  target.send('pointerdown', { pointerId: 4 });
  assert.equal(calls, 2);
  unbind(); unbind();
  target.send('pointerdown'); target.send('click', { pointerType: 'mouse' });
  assert.equal(calls, 2);
});

test('long presses deduplicate the release click without blocking later legacy clicks forever', () => {
  let now = 1000;
  const context = vm.createContext({ Date: { now: () => now } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../touch-actions.js'), 'utf8'), context);
  const target = button(); let calls = 0;
  context.FrontierTouch.bindTouchAction(target, () => calls++);
  target.send('pointerdown'); now += 5000; target.send('pointerup');
  target.send('click', { pointerType: undefined });
  assert.equal(calls, 1);
  now += 1000;
  target.send('click', { pointerType: undefined });
  assert.equal(calls, 2);
});

function heldStick() {
  const source = fs.readFileSync(path.join(__dirname, '../action.js'), 'utf8');
  const start = source.indexOf('  function bindStick('), end = source.indexOf('\n  bindStick(', start);
  assert.ok(start >= 0 && end > start, 'Use the real movement stick implementation');
  const stick = button(), captures = new Set();
  Object.assign(stick, {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 92, height: 92 }),
    querySelector: () => ({ style: {} }),
    setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => captures.delete(id)
  });
  const touch = { moveX: 0, moveY: 0, shoot: false };
  const context = vm.createContext({ $: () => stick, touch, canPlay: () => true, stickResets: [] });
  vm.runInContext(source.slice(start, end) + '\nbindStick("move-stick", false);', context);
  stick.send('pointerdown', { pointerId: 1, isPrimary: true, clientX: 78, clientY: 46 });
  return { stick, touch, captures };
}

test('holding the actual movement stick while a second finger reloads and switches preserves movement and background reload', () => {
  const { stick, touch, captures } = heldStick();
  const game = new Game({ random: () => .5 }); game.start();
  game.obstacles = []; game.enemies = []; game.spawnTimer = 999;
  const reload = button(), weapon = button();
  bindTouchAction(reload, () => game.reload());
  bindTouchAction(weapon, () => game.switchWeapon(1));
  game.ammoByWeapon[0] -= 3; game._syncWeapon();
  const startX = game.player.x;
  game.update(.1, touch);
  reload.send('pointerdown', { pointerId: 2 }); reload.send('pointerup', { pointerId: 2 });
  reload.send('click'); reload.send('click', { pointerType: undefined });
  const reloadTime = game.reloadByWeapon[0];
  assert.ok(reloadTime > 0);
  game.update(.1, touch);
  assert.ok(game.player.x > startX, 'Reload must not freeze movement');
  weapon.send('pointerdown', { pointerId: 3 }); weapon.send('pointerup', { pointerId: 3 });
  assert.equal(game.player.weapon, 1);
  assert.equal(touch.moveX, 1);
  assert.deepEqual([...captures], [1], 'Button events must not release or steal the held stick');
  const switchedX = game.player.x;
  game.update(.1, touch);
  assert.ok(game.player.x > switchedX, 'Switching must not freeze movement');
  assert.ok(game.reloadByWeapon[0] < reloadTime, 'The previous weapon keeps reloading while moving');
  assert.equal(game.reloadAttemptedByWeapon[0], false, 'No phantom second reload misses the active-reload window');
  stick.send('pointerup', { pointerId: 1 });
  assert.equal(touch.moveX, 0);
});

test('a deliberate second finger tap can complete precision reload while the movement finger stays held', () => {
  const { touch, captures } = heldStick();
  const game = new Game({ random: () => .5 }); game.start();
  game.obstacles = []; game.enemies = []; game.spawnTimer = 999;
  const reload = button(); bindTouchAction(reload, () => game.reload());
  game.ammoByWeapon[0] -= 5; game._syncWeapon(); game.drainEvents();
  reload.send('pointerdown'); reload.send('pointerup'); reload.send('click');
  const windowTime = game.reloadDurationByWeapon[0] * .6;
  let remaining = windowTime;
  while (remaining > 1e-9) { const step = Math.min(.1, remaining); game.update(step, touch); remaining -= step; }
  assert.equal(game.reloadAttemptedByWeapon[0], false);
  const startX = game.player.x;
  reload.send('pointerdown', { pointerId: 3 }); reload.send('pointerup', { pointerId: 3 }); reload.send('click');
  assert.equal(game.player.reloadResult, 'perfect');
  assert.equal(game.player.ammo, game.player.magSize);
  assert.equal(game.drainEvents().filter(event => event.type === 'reload-perfect').length, 1);
  game.update(.1, touch);
  assert.ok(game.player.x > startX);
  assert.deepEqual([...captures], [1]);
});
