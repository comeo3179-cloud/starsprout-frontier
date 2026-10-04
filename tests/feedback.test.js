'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  return sandbox.window;
}

test('rock hits and relic triggers produce bounded feedback and obey reduced motion', () => {
  const Renderer = load('action-renderer.js').ExpeditionRenderer;
  const fixture = reducedMotion => Object.assign(Object.create(Renderer.prototype), {
    reducedMotion, particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: []
  });
  const normal = fixture(false), calm = fixture(true);
  const events = [{ type: 'spark', x: 50, y: 80 }, { type: 'relic-trigger', x: 60, y: 90, message: '相位补弹' }];
  normal.consume(events); calm.consume(events);
  assert.ok(normal.particles.length > 0);
  assert.ok(calm.particles.length > 0 && calm.particles.length < normal.particles.length);
  assert.equal(normal.numbers[0].text, '相位补弹');
  assert.equal(normal.rings.length, 1);
  for (let i = 0; i < 500; i++) normal.consume(events);
  assert.ok(normal.particles.length <= 420 && normal.rings.length <= 20 && normal.numbers.length <= 50);
});

test('relic sound is throttled, can play again, and respects mute', () => {
  const Audio = load('audio.js').FrontierAudio;
  const audio = new Audio(), notes = [];
  audio.context = { currentTime: 1, state: 'running' };
  audio.note = (...args) => notes.push(args);
  audio.play('relic-trigger');
  assert.equal(notes.length, 2);
  audio.context.currentTime = 1.1; audio.play('relic-trigger');
  assert.equal(notes.length, 2);
  audio.context.currentTime = 1.3; audio.play('relic-trigger');
  assert.equal(notes.length, 4);
  audio.enabled = false; audio.context.currentTime = 2; audio.play('relic-trigger');
  assert.equal(notes.length, 4);
});

test('evolution audio distinguishes actions, throttles simultaneous bursts and stays silent when muted', () => {
  const Audio = load('audio.js').FrontierAudio, audio = new Audio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' };
  audio.note = (...args) => sounds.push(['note', ...args]);
  audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const stage of ['primed', 'breach', 'ricochet', 'echo', 'twin']) {
    audio.context.currentTime += 1; sounds.length = 0;
    audio.play('evolution-trigger', stage);
    assert.ok(sounds.length > 0);
    signatures.add(JSON.stringify(sounds));
    const count = sounds.length;
    audio.play('evolution-trigger', stage);
    assert.equal(sounds.length, count, 'Same-frame effects share a sound budget');
  }
  assert.equal(signatures.size, 5);
  sounds.length = 0; audio.play('weapon-evolved'); assert.equal(sounds.length, 4);
  audio.enabled = false; sounds.length = 0; audio.context.currentTime += 1;
  audio.play('weapon-evolved'); audio.play('evolution-trigger', 'echo');
  assert.equal(sounds.length, 0);
});

const secretIds = ['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break'];

function secretRenderer(reducedMotion = false) {
  const Renderer = load('action-renderer.js').ExpeditionRenderer;
  return Object.assign(Object.create(Renderer.prototype), {
    reducedMotion, shake: 0, particles: [], rings: [], numbers: [], ghosts: [], muzzles: [], arcs: [], scars: [], hazardEchoes: []
  });
}

test('all six secret triggers have finite distinct feedback without extra labels or shake', () => {
  const signatures = new Set();
  for (const secretId of secretIds) {
    const normal = secretRenderer(), calm = secretRenderer(true);
    const event = { type: 'secret-trigger', secretId, x: 50, y: 80, angle: Math.PI / 2 };
    normal.consume([event]); calm.consume([event]);
    assert.ok(normal.particles.length > 0 && normal.particles.length <= 14, secretId);
    assert.ok(calm.particles.length > 0 && calm.particles.length < normal.particles.length, secretId);
    assert.ok(normal.rings.length <= 2 && normal.arcs.length <= 1, secretId);
    assert.equal(normal.numbers.length, 0); assert.equal(calm.numbers.length, 0);
    assert.equal(normal.shake, 0); assert.equal(calm.shake, 0);
    for (const particle of normal.particles) for (const key of ['x', 'y', 'vx', 'vy', 'life', 'size']) assert.ok(Number.isFinite(particle[key]), secretId + '.' + key);
    signatures.add(normal.particles[0].color);
  }
  assert.equal(signatures.size, 6);
});

test('directional secrets follow the actual angle and ice produces shards', () => {
  for (const secretId of ['rebound', 'blade-relay', 'rail-resonance']) {
    const renderer = secretRenderer();
    renderer.consume([{ type: 'secret-trigger', secretId, x: 50, y: 80, angle: Math.PI / 2 }]);
    assert.ok(renderer.particles.every(particle => particle.vy > 0));
    const tip = renderer.arcs[0].points.at(-1);
    assert.ok(Math.abs(tip[0] - 50) < 1e-8); assert.ok(tip[1] > 80);
  }
  const ice = secretRenderer(); ice.consume([{ type: 'secret-trigger', secretId: 'ice-break', x: 50, y: 80, radius: 110 }]);
  assert.equal(ice.rings[0].radius, 110);
  assert.ok(ice.particles.every(particle => particle.ice));
});

test('repeated secret feedback stays within the existing particle, ring and arc budgets', () => {
  for (const reduced of [false, true]) {
    const renderer = secretRenderer(reduced);
    const events = secretIds.map(secretId => ({ type: 'secret-trigger', secretId, x: 50, y: 80 }));
    events.push({ type: 'secret-discovered', x: 50, y: 80 });
    for (let i = 0; i < 500; i++) renderer.consume(events);
    assert.ok(renderer.particles.length <= 420 && renderer.rings.length <= 20 && renderer.arcs.length <= 20);
    assert.equal(renderer.numbers.length, 0); assert.equal(renderer.shake, 0);
  }
});

test('blade feedback follows actual rebound and relay flags, not return flight alone', () => {
  function draw(properties) {
    const renderer = secretRenderer(true), colors = [];
    const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, arc() {},
      fill() { colors.push(this.fillStyle); }, stroke() { colors.push(this.strokeStyle); } };
    renderer.ctx = ctx;
    renderer.drawBullet({ owner: 'player', kind: 'boomerang', x: 20, y: 30, vx: 300, vy: 0, returning: true, ...properties });
    return colors;
  }
  assert.ok(!draw({}).includes('#ffd28e') && !draw({}).includes('#b4ffdc'));
  assert.ok(draw({ rockRebounded: true }).includes('#ffd28e'));
  assert.ok(draw({ relayCount: 1 }).includes('#b4ffdc'));
  assert.ok(!draw({ owner: 'enemy', rockRebounded: true, relayCount: 1 }).includes('#ffd28e'));
});

test('secret audio distinguishes triggers, throttles bursts globally, and respects mute', () => {
  const Audio = load('audio.js').FrontierAudio, audio = new Audio(), sounds = [], signatures = new Set();
  audio.context = { currentTime: 1, state: 'running' };
  audio.note = (...args) => sounds.push(['note', ...args]);
  audio.noiseBurst = (...args) => sounds.push(['noise', ...args]);
  for (const secretId of secretIds) {
    const before = sounds.length;
    audio.play('secret-trigger', secretId); assert.equal(sounds.length - before, 2);
    signatures.add(JSON.stringify(sounds.slice(before)));
    audio.play('secret-trigger', 'blade-relay'); assert.equal(sounds.length - before, 2);
    audio.context.currentTime += .2;
  }
  assert.equal(signatures.size, 6);
  const beforeDiscovery = sounds.length;
  audio.play('secret-discovered'); assert.equal(sounds.length - beforeDiscovery, 3);
  audio.context.currentTime += .2; audio.play('secret-discovered'); assert.equal(sounds.length - beforeDiscovery, 3);
  audio.context.currentTime += .7; audio.play('secret-discovered'); assert.equal(sounds.length - beforeDiscovery, 6);
  audio.enabled = false; audio.context.currentTime += 1;
  const beforeMute = sounds.length;
  audio.play('secret-trigger', 'ice-break'); audio.play('secret-discovered'); assert.equal(sounds.length, beforeMute);
});

test('automatic secret events never create or resume an unauthorised audio context', () => {
  const Audio = load('audio.js').FrontierAudio;
  for (const state of [null, 'suspended', 'closed']) {
    const audio = new Audio(); let attempts = 0;
    audio.init = () => attempts++;
    audio.note = () => attempts++;
    audio.noiseBurst = () => attempts++;
    if (state) audio.context = { state, currentTime: 1, resume() { attempts++; } };
    for (const id of secretIds) audio.play('secret-trigger', id);
    audio.play('secret-discovered'); assert.equal(attempts, 0, String(state));
  }
});
