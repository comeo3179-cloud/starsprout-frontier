'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function fixture({ state = 'running', available = true } = {}) {
  let now = 0, serial = 0, contextCount = 0;
  const timers = new Map(), contexts = [], pageEvents = new Map();
  const parameter = () => ({ value: 0, calls: [], setValueAtTime(...args) { this.calls.push(['value', ...args]); },
    exponentialRampToValueAtTime(...args) { this.calls.push(['ramp', ...args]); }, setTargetAtTime(...args) { this.calls.push(['target', ...args]); }, cancelScheduledValues(...args) { this.calls.push(['cancel', ...args]); } });
  class AudioContext {
    constructor() { contextCount++; contexts.push(this); this.currentTime = now / 1000; this.state = state; this.sampleRate = 100; this.destination = {}; this.nodes = []; this.events = new Map(); }
    addEventListener(type, callback) { this.events.set(type, callback); }
    setState(next) { this.state = next; this.events.get('statechange')?.(); }
    resume() { return Promise.resolve(); }
    node(extra = {}) { const n = { connect() {}, disconnect() { this.disconnected = true; }, ...extra }; this.nodes.push(n); return n; }
    createGain() { return this.node({ gain: parameter() }); }
    createDynamicsCompressor() { return this.node({ threshold: parameter(), ratio: parameter() }); }
    createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
    createOscillator() { return this.node({ frequency: parameter(), start(at) { this.started = at; }, stop(at) { this.ends = at; this.stops = (this.stops || 0) + 1; } }); }
    createBufferSource() { return this.node({ start() {}, stop(at) { this.ends = at; } }); }
    createBiquadFilter() { return this.node({ frequency: parameter() }); }
  }
  const page = { hidden: false, addEventListener(type, callback) { pageEvents.set(type, callback); } };
  const window = { document: page, setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; }, clearTimeout(id) { timers.delete(id); } };
  if (available) window.AudioContext = AudioContext;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'audio.js'), 'utf8'), { window });
  const audio = new window.FrontierAudio();
  function tick(ms, runTimers = true) {
    now += ms;
    for (const ctx of contexts) {
      ctx.currentTime = now / 1000;
      for (const node of ctx.nodes) if (!node.ended && node.ends <= ctx.currentTime) { node.ended = true; node.onended?.(); }
    }
    if (runTimers) for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  }
  return { audio, timers, page, tick, contexts, get contextCount() { return contextCount; }, hide(hidden) { page.hidden = hidden; pageEvents.get('visibilitychange')?.(); } };
}

test('music stays lazy until user audio unlock, and unavailable WebAudio is safe', () => {
  for (const available of [true, false]) {
    const f = fixture({ available });
    f.audio.setScene('combat', 'storm'); f.audio.setMusicEnabled(false); f.audio.setMusicEnabled(true); f.audio.setEnabled(false); f.audio.setEnabled(true);
    assert.equal(f.contextCount, 0); assert.equal(f.timers.size, 0);
    f.audio.play('click'); assert.equal(f.contextCount, available ? 1 : 0); assert.equal(f.timers.size, available ? 1 : 0);
  }
});

test('HUD scene calls are idempotent and switching scenes replaces rather than duplicates scheduling', () => {
  const f = fixture(); f.audio.setScene('explore', 'frontier'); f.audio.play('click');
  const first = [...f.timers.keys()][0], voices = f.audio.musicVoices.size;
  for (let i = 0; i < 120; i++) f.audio.setScene('explore', 'frontier');
  assert.deepEqual([...f.timers.keys()], [first]); assert.equal(f.audio.musicVoices.size, voices);
  f.audio.setScene('combat', 'frontier'); assert.equal(f.timers.size, 1); assert.ok(!f.timers.has(first));
  f.tick(100); assert.ok(f.audio.musicVoices.size <= 12);
});

test('pause cancels pending scheduling and every existing voice ends despite repeated silent HUD calls', () => {
  const f = fixture(); f.audio.setScene('boss', 'ruins'); f.audio.play('click'); f.tick(60);
  const playing = [...f.audio.musicVoices]; assert.ok(playing.length > 0);
  f.audio.setScene('silent'); assert.equal(f.timers.size, 0);
  for (let i = 0; i < 8; i++) { f.tick(16); f.audio.setScene('silent'); }
  assert.equal(f.audio.musicVoices.size, 0); assert.ok(playing.every(node => node.ended && node.disconnected));
  assert.ok(playing.every(node => node.stops === 2), 'One scheduled end plus one stop; repeated HUD calls never postpone the stop');
});

test('music switch leaves effects audible; master mute, hidden page and suspended context stop music', async () => {
  const f = fixture(); f.audio.setScene('combat'); f.audio.play('click');
  f.audio.setMusicEnabled(false); assert.equal(f.timers.size, 0); f.tick(100);
  const before = f.audio.context.nodes.length; f.audio.play('shot', 0); assert.ok(f.audio.context.nodes.length > before);
  f.audio.setMusicEnabled(true); assert.equal(f.timers.size, 1);
  f.audio.setEnabled(false); assert.equal(f.timers.size, 0); f.tick(100);
  f.audio.setEnabled(true); assert.equal(f.timers.size, 1);
  f.hide(true); assert.equal(f.timers.size, 0); f.tick(100); f.audio.setScene('boss'); assert.equal(f.timers.size, 0);
  f.hide(false); assert.equal(f.timers.size, 1);
  f.audio.context.setState('suspended'); assert.equal(f.timers.size, 0); f.tick(100); f.audio.play('click'); await Promise.resolve(); assert.equal(f.timers.size, 0);
  f.audio.context.setState('running'); assert.equal(f.timers.size, 1);
});

test('a suspended browser does not start music before a successful resume', async () => {
  const f = fixture({ state: 'suspended' }); f.audio.setScene('explore'); f.audio.play('click'); await Promise.resolve();
  assert.equal(f.contextCount, 1); assert.equal(f.timers.size, 0); assert.equal(f.audio.musicVoices.size, 0);
  f.audio.context.setState('running'); assert.equal(f.timers.size, 1); assert.ok(f.audio.musicVoices.size > 0);
});

test('all scenes contain pitched harmony and melody with distinct tempos and bounded voice use', () => {
  const signatures = [];
  for (const scene of ['explore', 'combat', 'boss']) {
    const f = fixture(); f.audio.setScene(scene); f.audio.play('click');
    for (let i = 0; i < 250; i++) { f.tick(60); assert.equal(f.timers.size, 1); assert.ok(f.audio.musicVoices.size <= 12); assert.ok(f.audio.voices <= 48); }
    const notes = f.audio.context.nodes.filter(node => node.frequency && node.started !== undefined && node.started > .01);
    const pitches = new Set(notes.map(node => node.frequency.calls[0][1].toFixed(1)));
    assert.ok(pitches.size >= 10, 'A musical phrase has multiple pitched harmony and melody tones');
    signatures.push(notes.slice(0, 25).map(node => [node.started, node.frequency.calls[0][1]]));
  }
  assert.notDeepEqual(signatures[0], signatures[1]); assert.notDeepEqual(signatures[1], signatures[2]);
});

test('late timer wakeups skip the backlog and do not create a long burst of queued notes', () => {
  const f = fixture(); f.audio.setScene('combat'); f.audio.play('click'); f.tick(60000, false);
  const before = f.audio.context.nodes.length; f.tick(0);
  assert.ok(f.audio.context.nodes.length - before <= 12, 'A late wakeup schedules at most one musical step and its small chord');
  const active = [...f.audio.musicVoices]; assert.ok(active.length > 0); assert.ok(active.every(node => node.started >= 60)); assert.equal(f.timers.size, 1);
});

test('actual voyage map IDs have distinct musical phrases while keeping one bounded scheduler', () => {
  for (const scene of ['explore', 'combat', 'boss']) {
    const signatures = new Set();
    for (const mapId of ['voyage-cosmos', 'voyage-forge', 'voyage-tide']) {
      const f = fixture(); f.audio.setScene(scene, mapId); f.audio.play('click');
      for (let i = 0; i < 150; i++) { f.tick(60); f.audio.setScene(scene, mapId); assert.equal(f.timers.size, 1); assert.ok(f.audio.musicVoices.size <= 12); assert.ok(f.audio.voices <= 48); }
      const notes = f.audio.context.nodes.filter(node => node.frequency && node.started !== undefined && node.started > .01);
      signatures.add(JSON.stringify(notes.slice(0, 40).map(node => [node.type, node.started, node.frequency.calls[0][1]])));
      f.audio.setScene('silent'); f.tick(100); assert.equal(f.timers.size, 0); assert.equal(f.audio.musicVoices.size, 0);
    }
    assert.equal(signatures.size, 3);
  }
});

test('the recovery map has its own phrase and evacuation changes tempo through the same bounded scheduler', () => {
  const signatures = new Set();
  for (const scene of ['explore', 'combat', 'evac']) {
    const f = fixture(); f.audio.setScene(scene, 'salvage'); assert.equal(f.contextCount, 0); f.audio.play('click');
    const timer = [...f.timers.keys()][0]; f.audio.setScene(scene, 'salvage'); assert.ok(f.timers.has(timer));
    for (let i = 0; i < 250; i++) { f.tick(60); assert.equal(f.timers.size, 1); assert.ok(f.audio.musicVoices.size <= 12 && f.audio.voices <= 48); }
    const notes = f.audio.context.nodes.filter(node => node.frequency && node.started !== undefined && node.started > .01);
    signatures.add(JSON.stringify(notes.slice(0, 35).map(node => [node.type, node.started, node.frequency.calls[0][1]])));
    f.audio.setScene('evac', 'salvage'); assert.equal(f.timers.size, 1);
    f.hide(true); f.tick(100); assert.equal(f.timers.size, 0); assert.equal(f.audio.musicVoices.size, 0);
    f.hide(false); assert.equal(f.timers.size, 1); f.audio.setMusicEnabled(false); f.tick(100); assert.equal(f.audio.musicVoices.size, 0);
    f.audio.setMusicEnabled(true); assert.equal(f.timers.size, 1); f.audio.setScene('silent'); f.tick(100);
    assert.equal(f.timers.size, 0); assert.equal(f.audio.musicVoices.size, 0);
  }
  assert.equal(signatures.size, 3);
  const unavailable = fixture({ available: false }); unavailable.audio.setScene('evac', 'salvage'); unavailable.audio.play('salvage-call'); assert.equal(unavailable.timers.size, 0);
  const suspended = fixture({ state: 'suspended' }); suspended.audio.setScene('evac', 'salvage'); suspended.audio.play('click'); assert.equal(suspended.timers.size, 0);
});

test('evacuation, alarm and EMP field chains share the existing voice cap and clean up after mute', () => {
  const f = fixture(); f.audio.setScene('evac', 'salvage'); f.audio.play('click');
  for (let i = 0; i < 20; i++) {
    for (const [kind, arg] of [['salvage-alert', 4], ['salvage-source-open', 'drone'], ['salvage-vault-unlock', 'vault'], ['salvage-collected', 'drill'], ['salvage-arrive', 0], ['field-capture', 'friendly'], ['field-arm', 'friendly'], ['field-burst', 'friendly'], ['skill', 0], ['shield-open', 0]]) f.audio.play(kind, arg);
    assert.ok(f.audio.voices <= 48 && f.audio.musicVoices.size <= 12); assert.equal(f.timers.size, 1); f.tick(60);
  }
  f.audio.setEnabled(false); f.tick(1000); assert.equal(f.timers.size, 0); assert.equal(f.audio.musicVoices.size, 0); assert.equal(f.audio.voices, 0);
});

test('siege effects sound individually and keep one bounded music scheduler', () => {
  const f = fixture(); f.audio.setScene('boss', 'siege'); f.audio.play('click');
  for (const kind of ['siege-start', 'siege-part-break', 'siege-capture', 'siege-turret-shot', 'siege-redirect', 'siege-armor-break']) {
    f.tick(400);
    const before = f.audio.context.nodes.length; f.audio.play(kind);
    assert.ok(f.audio.context.nodes.length > before, kind);
    assert.equal(f.timers.size, 1); assert.ok(f.audio.voices <= 48 && f.audio.musicVoices.size <= 12);
  }
  f.audio.setEnabled(false); f.tick(1000); assert.equal(f.audio.voices, 0); assert.equal(f.timers.size, 0);
});

test('three salvage sectors sound distinct and changing sectors does not accumulate music schedulers', () => {
  const signatures = new Set(), f = fixture();
  for (const sectorId of ['scrapyard', 'frostport', 'stormcity']) {
    const before = f.audio.context?.nodes.length || 0;
    f.audio.setScene('explore', sectorId); f.audio.play('click');
    for (let i = 0; i < 160; i++) { f.tick(60); f.audio.setScene('explore', sectorId); assert.equal(f.timers.size, 1); assert.ok(f.audio.musicVoices.size <= 12 && f.audio.voices <= 48); }
    const notes = f.audio.context.nodes.slice(before).filter(node => node.frequency && node.started !== undefined);
    signatures.add(JSON.stringify(notes.slice(0, 35).map(node => [node.type, node.frequency.calls[0][1]])));
    f.audio.setScene('silent'); f.tick(1000); assert.equal(f.timers.size, 0); assert.equal(f.audio.musicVoices.size, 0);
  }
  assert.equal(signatures.size, 3);
});

test('node reversal and refit chains remain bounded and respect master mute', () => {
  const f = fixture(); f.audio.setScene('combat', 'stormcity'); f.audio.play('click');
  for (let i = 0; i < 20; i++) {
    for (const [kind, arg] of [['salvage-node-arm', 'lane'], ['salvage-node-reverse', 'lane'], ['salvage-hunt-alert', 'arc'], ['salvage-hunt-defeated', 'arc'], ['salvage-mod-equipped', 'arc'], ['salvage-refit-hit', 'arc'], ['salvage-refit-hit', 'frost']]) f.audio.play(kind, arg);
    assert.equal(f.timers.size, 1); assert.ok(f.audio.voices <= 48 && f.audio.musicVoices.size <= 12); f.tick(60);
  }
  f.audio.setEnabled(false); f.tick(1000); assert.equal(f.audio.voices, 0); assert.equal(f.timers.size, 0);
  const before = f.audio.context.nodes.length; f.audio.play('salvage-node-reverse'); assert.equal(f.audio.context.nodes.length, before);
});
