'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'action.js'), 'utf8');
function functionSource(name, nextMarker) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf(nextMarker, start);
  assert.ok(start >= 0 && end > start, 'Find the actual ' + name + ' implementation');
  return source.slice(start, end);
}

function controls() {
  const touch = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, shoot: false };
  const pointer = { down: false, shotQueued: false };
  const keys = new Set();
  const sticks = {};
  for (const [id, left] of [['move-stick', 0], ['aim-stick', 200]]) {
    const listeners = {}, captures = new Set(), knob = { style: { transform: '' } };
    const stick = sticks[id] = {
      knob, captures, released: [],
      getBoundingClientRect: () => ({ left, top: 0, width: 92, height: 92 }),
      querySelector: () => knob,
      addEventListener: (name, callback) => { listeners[name] = callback; },
      setPointerCapture: pointerId => { captures.add(pointerId); },
      hasPointerCapture: pointerId => captures.has(pointerId),
      releasePointerCapture(pointerId) {
        assert.ok(captures.has(pointerId), 'Only release an owned pointer capture');
        captures.delete(pointerId); this.released.push(pointerId);
        // A reset must also tolerate the resulting lost-capture event.
        listeners.lostpointercapture?.({ pointerId });
      },
      send(type, pointerId, dx = 32, dy = 0) {
        if (type === 'lostpointercapture') captures.delete(pointerId);
        listeners[type]({ pointerId, clientX: left + 46 + dx, clientY: 46 + dy, preventDefault() {} });
        // Touch capture is implicitly released when its contact ends.
        if (['pointerup', 'pointercancel'].includes(type) && captures.has(pointerId)) this.releasePointerCapture(pointerId);
      }
    };
  }
  const context = vm.createContext({
    touch, pointer, keys, stickResets: [], canPlay: () => true,
    $: id => sticks[id],
    document: { querySelectorAll: () => Object.values(sticks).map(stick => stick.knob) }
  });
  vm.runInContext(functionSource('clearInput', '\n  function canPlay') + '\n' +
    functionSource('bindStick', '\n  bindStick(') +
    '\nbindStick("move-stick", false); bindStick("aim-stick", true);', context);
  return { touch, pointer, keys, move: sticks['move-stick'], aim: sticks['aim-stick'], clear: () => context.clearInput() };
}

test('a second finger cannot steal a stick or stop its owner', () => {
  const { move, touch } = controls();
  move.send('pointerdown', 11);
  assert.equal(touch.moveX, 1);
  move.send('pointerdown', 12, -32);
  move.send('pointermove', 12, -32);
  assert.equal(touch.moveX, 1);
  assert.equal(move.captures.has(12), false);
  move.send('pointerup', 12, -32);
  assert.equal(touch.moveX, 1);
  move.send('pointermove', 11, -32);
  assert.equal(touch.moveX, -1);
  move.send('pointerup', 11, -32);
  assert.equal(touch.moveX, 0);
  assert.equal(move.knob.style.transform, '');
});

test('movement and aiming sticks accept separate fingers simultaneously', () => {
  const { move, aim, touch } = controls();
  move.send('pointerdown', 21);
  aim.send('pointerdown', 22, 0, -32);
  assert.equal(touch.moveX, 1);
  assert.equal(touch.aimY, -1);
  assert.equal(touch.shoot, true);
  move.send('pointerup', 21);
  assert.equal(touch.moveX, 0);
  assert.equal(touch.shoot, true);
  aim.send('pointerup', 22);
  assert.equal(touch.shoot, false);
});

test('clearing input releases both captures and permits fresh fingers immediately', () => {
  const { move, aim, touch, pointer, keys, clear } = controls();
  move.send('pointerdown', 31);
  aim.send('pointerdown', 32);
  pointer.down = pointer.shotQueued = true; keys.add('KeyW');
  clear();
  assert.equal(touch.moveX, 0); assert.equal(touch.moveY, 0); assert.equal(touch.shoot, false);
  assert.equal(pointer.down, false); assert.equal(pointer.shotQueued, false); assert.equal(keys.size, 0);
  assert.deepEqual(move.released, [31]); assert.deepEqual(aim.released, [32]);
  assert.equal(move.knob.style.transform, ''); assert.equal(aim.knob.style.transform, '');
  move.send('pointerdown', 33, -32); aim.send('pointerdown', 34);
  assert.equal(touch.moveX, -1); assert.equal(touch.shoot, true);
  // Late events from the cleared contacts must not cancel the new contacts.
  move.send('pointerup', 31); aim.send('lostpointercapture', 32);
  assert.equal(touch.moveX, -1); assert.equal(touch.shoot, true);
  clear(); clear();
  assert.equal(move.captures.size, 0); assert.equal(aim.captures.size, 0);
});

for (const eventType of ['pointercancel', 'lostpointercapture']) {
  test(eventType + ' clears the owner and allows the next touch', () => {
    const { move, aim, touch } = controls();
    move.send('pointerdown', 41); aim.send('pointerdown', 42);
    move.send(eventType, 41); aim.send(eventType, 42);
    assert.equal(touch.moveX, 0); assert.equal(touch.moveY, 0); assert.equal(touch.shoot, false);
    assert.equal(move.knob.style.transform, ''); assert.equal(aim.knob.style.transform, '');
    move.send('pointerdown', 43); aim.send('pointerdown', 44);
    assert.equal(touch.moveX, 1); assert.equal(touch.shoot, true);
  });
}
