'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Store, SECRET_IDS, normalizeSnapshot, mergeSnapshots, GUEST_KEY, accountKey } = require('../profile-store.js');

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.denied = false; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.denied) throw new Error('Storage denied'); this.values.set(key, value); }
}
const copy = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function cloud() {
  const profiles = new Map(), receipts = new Map(), claims = new Map(), calls = [];
  const get = uid => profiles.get(uid) || normalizeSnapshot();
  return {
    profiles, receipts, claims, calls, offline: false,
    async load(uid) { if (this.offline) throw new Error('Offline'); return copy(get(uid)); },
    async merge(uid, payload) {
      calls.push({ uid, payload: copy(payload) });
      if (this.offline) throw new Error('Offline');
      let snapshot = mergeSnapshots(get(uid), payload);
      for (const run of payload.runs) {
        const key = uid + ':' + run.id;
        if (receipts.has(key)) continue;
        receipts.set(key, run);
        if (run.won) { snapshot.trial.wins++; snapshot.trial.bestTime = snapshot.trial.bestTime ? Math.min(snapshot.trial.bestTime, run.time) : run.time; }
        snapshot.trial.bestWave = Math.max(snapshot.trial.bestWave, run.wave);
      }
      let legacyAccepted = false;
      if (payload.legacy) {
        const previous = claims.get(payload.legacy.id);
        if (previous && previous !== uid) throw new Error('Legacy archive already claimed');
        if (!previous) {
          const wins = snapshot.trial.wins + payload.legacy.snapshot.trial.wins;
          snapshot = mergeSnapshots(snapshot, payload.legacy.snapshot); snapshot.trial.wins = wins;
          claims.set(payload.legacy.id, uid);
        }
        legacyAccepted = true;
      }
      profiles.set(uid, snapshot);
      return { snapshot: copy(snapshot), acknowledgedRunIds: payload.runs.map(run => run.id), legacyAccepted };
    }
  };
}
async function settled(store) {
  await store.sync();
  for (let i = 0; i < 10 && store.status.syncing; i++) await new Promise(resolve => setImmediate(resolve));
}

test('snapshot validation whitelists six secrets and merges monotonic records', () => {
  const a = normalizeSnapshot({ secrets: [SECRET_IDS[0], SECRET_IDS[0], '__proto__', 'fake'], bestScore: -5, trial: { wins: 2.8, bestTime: 90, bestWave: 20 } });
  assert.deepEqual(a, { secrets: ['rebound'], bestScore: 0, coachDone: false, trial: { wins: 2, bestTime: 90, bestWave: 6 } });
  const result = mergeSnapshots(a, { secrets: ['ice-break'], bestScore: 400, coachDone: true, trial: { wins: 1, bestTime: 82, bestWave: 3 } });
  assert.deepEqual(result, { secrets: ['rebound', 'ice-break'], bestScore: 400, coachDone: true, trial: { wins: 2, bestTime: 82, bestWave: 6 } });
  assert.equal(normalizeSnapshot({ trial: { wins: Infinity, bestTime: -1 } }).trial.bestTime, 0);
});

test('UMD exposes the same browser API without requiring a module loader', () => {
  const scope = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../profile-store.js'), 'utf8'), scope);
  assert.equal(typeof scope.FrontierProfiles.Store, 'function');
  assert.equal(scope.FrontierProfiles.SECRET_IDS.length, 6);
});

test('legacy keys initialize only guest, which preserves unique local runs over reload', async () => {
  const storage = new MemoryStorage({ 'frontier-secrets-v1': '["rebound","fake"]', 'frontier-best': '700', 'frontier-coach': 'done',
    'frontier-trial-record-v1': '{"wins":3,"bestTime":95,"bestWave":6}', 'frontier-sound': 'off' });
  const store = new Store({ storage, adapter: cloud() });
  assert.equal(store.identity, null); assert.equal(store.snapshot.trial.wins, 3);
  assert.equal(store.recordRun({ id: 'guest-run', won: true, time: 90, wave: 6 }), true);
  assert.equal(store.recordRun({ id: 'guest-run', won: true, time: 80, wave: 6 }), false);
  assert.equal(store.snapshot.trial.wins, 4); assert.equal(store.snapshot.trial.bestTime, 90);
  storage.setItem('frontier-best', '9000');
  const reload = new Store({ storage }); assert.equal(reload.snapshot.bestScore, 700); assert.equal(reload.snapshot.trial.wins, 4);
  await store.switchAccount('A'); assert.deepEqual(store.snapshot, normalizeSnapshot()); assert.equal(store.legacyAvailable, true);
  await store.switchAccount(null); assert.equal(store.snapshot.trial.wins, 4); assert.equal(storage.getItem('frontier-sound'), 'off');
});

test('UID caches, outboxes and memory remain isolated when switching accounts', async () => {
  const storage = new MemoryStorage(), adapter = cloud(), store = new Store({ storage, adapter });
  await store.switchAccount('A'); adapter.offline = true;
  store.recordSecret('rebound'); store.recordBest(250); store.recordCoach(); store.recordRun({ id: 'run-A', won: true, time: 80, wave: 6 }); await settled(store);
  assert.ok(store.status.pending > 0); assert.equal(store.status.error, 'Offline'); assert.equal(store.snapshot.trial.wins, 0);
  await store.switchAccount('B'); assert.deepEqual(store.snapshot, normalizeSnapshot());
  store.recordSecret('ice-break'); await settled(store);
  adapter.offline = false; await store.switchAccount('A'); await settled(store);
  assert.deepEqual(store.snapshot.secrets, ['rebound']); assert.equal(store.snapshot.bestScore, 250); assert.equal(store.snapshot.coachDone, true);
  assert.equal(store.snapshot.trial.wins, 1); assert.equal(store.status.pending, 0);
  assert.ok(adapter.calls.filter(call => call.uid === 'B').every(call => !call.payload.runs.some(run => run.id === 'run-A')));
  await store.switchAccount('B'); await settled(store); assert.deepEqual(store.snapshot.secrets, ['ice-break']); assert.equal(store.snapshot.trial.wins, 0);
  assert.notEqual(accountKey('A'), accountKey('B')); assert.ok(storage.getItem(accountKey('A')));
});

test('stale load and merge completions never replace a different current account', async () => {
  const loadA = deferred(), mergeA = deferred(), changes = [];
  const adapter = { load: uid => uid === 'A' ? loadA.promise : Promise.resolve({ secrets: ['ice-break'], bestScore: 2 }), merge: () => mergeA.promise };
  const store = new Store({ storage: new MemoryStorage(), adapter, onChange: value => changes.push({ uid: value.identity, snapshot: value.snapshot }) });
  const first = store.switchAccount('A'); await store.switchAccount('B');
  const count = changes.length; loadA.resolve({ secrets: ['rebound'], bestScore: 999 }); await first;
  assert.equal(changes.length, count); assert.equal(store.identity, 'B'); assert.deepEqual(store.snapshot.secrets, ['ice-break']);
  adapter.load = async uid => uid === 'A' ? { secrets: ['rebound'], bestScore: 999 } : { secrets: ['ice-break'], bestScore: 2 };
  await store.switchAccount('A'); store.recordSecret('blade-relay');
  const syncing = store.sync(); await store.switchAccount('B'); const before = changes.length;
  mergeA.resolve({ snapshot: { secrets: ['rebound', 'blade-relay'], bestScore: 999 }, acknowledgedRunIds: [] }); await syncing;
  assert.equal(changes.length, before); assert.deepEqual(store.snapshot.secrets, ['ice-break']); assert.equal(store.snapshot.bestScore, 2);
});

test('only acknowledged receipts leave the outbox, including after a lost response and retry', async () => {
  const adapter = cloud(), realMerge = adapter.merge.bind(adapter); let loseResponse = true;
  adapter.merge = async (uid, payload) => { const result = await realMerge(uid, payload); if (loseResponse) throw new Error('Response lost'); return result; };
  const storage = new MemoryStorage(), store = new Store({ storage, adapter }); await store.switchAccount('A');
  store.recordRun({ id: 'once', won: true, time: 100, wave: 6 }); await settled(store);
  assert.equal(adapter.profiles.get('A').trial.wins, 1); assert.ok(store.status.pending > 0);
  loseResponse = false;
  const reload = new Store({ storage, adapter }); await reload.switchAccount('A'); await settled(reload);
  assert.equal(reload.snapshot.trial.wins, 1); assert.equal(reload.status.pending, 0); assert.equal(reload.recordRun({ id: 'once', won: true, time: 100, wave: 6 }), false);
  adapter.merge = async (uid, payload) => (await realMerge(uid, payload)).snapshot;
  reload.recordRun({ id: 'unconfirmed', won: true, time: 85, wave: 6 }); await settled(reload);
  assert.ok(reload.status.pending > 0); assert.equal(reload.snapshot.trial.wins, 2);
});

test('same-account tabs merge new records before writing and do not resurrect acknowledged runs', async () => {
  const storage = new MemoryStorage(), adapter = cloud(), a = new Store({ storage, adapter }), b = new Store({ storage, adapter });
  await a.switchAccount('A'); await b.switchAccount('A'); adapter.offline = true;
  a.recordSecret('rebound'); b.recordSecret('ice-break');
  a.recordRun({ id: 'one', won: true, time: 90, wave: 6 }); b.recordRun({ id: 'two', won: true, time: 88, wave: 6 });
  await settled(a); await settled(b); adapter.offline = false;
  await settled(a); await settled(b);
  assert.deepEqual(b.snapshot.secrets, ['rebound', 'ice-break']); assert.equal(b.snapshot.trial.wins, 2); assert.equal(b.status.pending, 0);
  b.recordBest(300); await settled(b); await a.switchAccount('A');
  assert.equal(a.status.pending, 0); assert.equal(a.snapshot.trial.wins, 2); assert.equal(a.snapshot.bestScore, 300);
});

test('explicit legacy import is stable, retryable, idempotent and claimed by only one UID', async () => {
  const storage = new MemoryStorage({ 'frontier-secrets-v1': '["rail-resonance"]', 'frontier-trial-record-v1': '{"wins":4,"bestTime":95,"bestWave":6}' });
  const adapter = cloud(), store = new Store({ storage, adapter }); await store.switchAccount('A');
  assert.equal(adapter.calls.length, 0); assert.equal(store.snapshot.trial.wins, 0);
  adapter.offline = true; assert.equal(await store.importLegacy(), false);
  const id = JSON.parse(storage.getItem(GUEST_KEY)).legacyId;
  await store.switchAccount('B'); assert.equal(store.legacyAvailable, false); assert.equal(await store.importLegacy(), false);
  adapter.offline = false; await store.switchAccount('A'); await settled(store);
  assert.equal(store.snapshot.trial.wins, 4); assert.deepEqual(store.snapshot.secrets, ['rail-resonance']); assert.equal(store.legacyAvailable, false);
  assert.equal(store.status.pending, 0); assert.equal(adapter.claims.get(id), 'A'); assert.equal(await store.importLegacy(), false);
  const reload = new Store({ storage, adapter }); await reload.switchAccount('A'); assert.equal(reload.snapshot.trial.wins, 4); assert.equal(reload.legacyAvailable, false);
  assert.equal(storage.getItem('frontier-trial-record-v1'), '{"wins":4,"bestTime":95,"bestWave":6}');
});

test('storage denial retains session progress and never reports durable saving or imports an unstable claim', async () => {
  const storage = new MemoryStorage(); storage.denied = true;
  const adapter = cloud(), store = new Store({ storage, adapter }); store.recordSecret('rebound');
  assert.equal(store.status.persistent, false); assert.deepEqual(store.snapshot.secrets, ['rebound']);
  await store.switchAccount('A'); assert.equal(await store.importLegacy(), false); assert.equal(adapter.claims.size, 0);
  await store.switchAccount(null); assert.deepEqual(store.snapshot.secrets, ['rebound']);
  storage.denied = false; store.recordBest(30); assert.equal(store.status.persistent, true);
  const snapshot = store.snapshot; snapshot.secrets.length = 0; assert.deepEqual(store.snapshot.secrets, ['rebound']);
});

test('transport bounds reject invalid receipts and flush more than 100 runs in acknowledged batches', async () => {
  const adapter = cloud(), store = new Store({ storage: new MemoryStorage(), adapter }); await store.switchAccount('A');
  assert.equal(store.recordRun({ id: '中文', won: true, time: 90, wave: 6 }), false);
  assert.equal(store.recordRun({ id: 'x'.repeat(129), won: true, time: 90, wave: 6 }), false);
  assert.equal(store.recordRun({ id: 'bad-time', won: true, time: 86401, wave: 6 }), false);
  store.recordBest(1e12);
  for (let i = 0; i < 205; i++) store.recordRun({ id: 'batch:' + i, won: true, time: 100 + i, wave: 6 });
  await settled(store);
  assert.equal(store.snapshot.bestScore, 1e9); assert.equal(store.snapshot.trial.wins, 205); assert.equal(store.status.pending, 0);
  assert.ok(adapter.calls.every(call => call.payload.runs.length <= 100));
  assert.equal(adapter.receipts.size, 205);
});

test('a delayed old session failure cannot replace a newer successful session of the same UID', async () => {
  const oldLoad = deferred(); let loads = 0;
  const adapter = cloud(); adapter.load = async () => ++loads === 1 ? oldLoad.promise : { secrets: ['ice-break'], bestScore: 12 };
  const store = new Store({ storage: new MemoryStorage(), adapter });
  const oldSession = store.switchAccount('A'); await store.switchAccount(null); await store.switchAccount('A');
  oldLoad.reject(new Error('Expired old request')); await oldSession;
  assert.equal(store.status.error, null); assert.equal(store.status.loading, false); assert.deepEqual(store.snapshot.secrets, ['ice-break']);
});

test('legacy preview is bounded and remains available only to its pending claimant', async () => {
  const storage = new MemoryStorage({ 'frontier-trial-record-v1': '{"wins":1500,"bestTime":90,"bestWave":6}' });
  const adapter = cloud(), store = new Store({ storage, adapter }); await store.switchAccount('A');
  assert.equal(store.legacy.available, true); assert.equal(store.legacy.snapshot.trial.wins, 1000);
  adapter.offline = true; await store.importLegacy();
  assert.equal(store.legacy.available, true); await store.switchAccount('B'); assert.equal(store.legacy.available, false);
});

test('account initialization remains loading until the real adapter settles and exposes load failure', async () => {
  const loading = deferred(), states = [];
  const store = new Store({ storage: new MemoryStorage(), adapter: { load: () => loading.promise },
    onChange: value => states.push({ identity: value.identity, ...value.status }) });
  const switched = store.switchAccount('A');
  assert.equal(store.identity, 'A'); assert.equal(store.status.loading, true); assert.equal(store.status.syncing, false);
  assert.ok(states.filter(state => state.identity === 'A').every(state => state.loading));
  loading.reject(new Error('Authentication expired')); await switched;
  assert.equal(store.status.loading, false); assert.equal(store.status.error, 'Authentication expired'); assert.equal(store.status.pending, 0);
});

test('a storage event delivers another tab acknowledgement before a lost response without reviving the receipt', async () => {
  const previousAdd = globalThis.addEventListener, previousRemove = globalThis.removeEventListener;
  const listeners = new Set();
  globalThis.addEventListener = (name, listener) => { if (name === 'storage') listeners.add(listener); };
  globalThis.removeEventListener = (name, listener) => { if (name === 'storage') listeners.delete(listener); };
  let a, b;
  try {
    const storage = new MemoryStorage(), server = cloud(), firstResponse = deferred();
    const adapterA = { load: server.load.bind(server), async merge(uid, payload) { await server.merge(uid, payload); await firstResponse.promise; throw new Error('Response lost'); } };
    a = new Store({ storage, adapter: adapterA }); b = new Store({ storage, adapter: server });
    await a.switchAccount('A'); await b.switchAccount('A');
    a.recordRun({ id: 'same-run', won: true, time: 90, wave: 6 }); const first = a.sync();
    await settled(b);
    const acknowledged = storage.getItem(accountKey('A'));
    for (const listener of listeners) listener({ key: accountKey('A'), newValue: acknowledged, storageArea: storage });
    assert.equal(a.status.pending, 0); assert.equal(a.snapshot.trial.wins, 1);
    firstResponse.resolve(); await first;
    assert.equal(a.status.pending, 0); assert.equal(a.snapshot.trial.wins, 1);
    assert.equal(JSON.parse(storage.getItem(accountKey('A'))).runs.length, 0);
    assert.equal(a.recordRun({ id: 'same-run', won: true, time: 90, wave: 6 }), false);
    assert.equal(server.profiles.get('A').trial.wins, 1);
  } finally {
    a?.dispose(); b?.dispose(); assert.equal(listeners.size, 0);
    if (previousAdd === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = previousAdd;
    if (previousRemove === undefined) delete globalThis.removeEventListener; else globalThis.removeEventListener = previousRemove;
  }
});

test('a legacy claim committed before response loss retries its original id after reload and counts once', async () => {
  const storage = new MemoryStorage({ 'frontier-trial-record-v1': '{"wins":4,"bestTime":95,"bestWave":6}' });
  const adapter = cloud(), merge = adapter.merge.bind(adapter); let lost = true;
  adapter.merge = async (uid, payload) => { const result = await merge(uid, payload); if (lost) throw new Error('Response lost'); return result; };
  const first = new Store({ storage, adapter }); await first.switchAccount('A');
  assert.equal(await first.importLegacy(), false); assert.equal(adapter.profiles.get('A').trial.wins, 4);
  const id = JSON.parse(storage.getItem(GUEST_KEY)).legacyId;
  lost = false;
  const reloaded = new Store({ storage, adapter }); await reloaded.switchAccount('A'); await settled(reloaded);
  assert.equal(reloaded.snapshot.trial.wins, 4); assert.equal(reloaded.legacy.available, false); assert.equal(reloaded.status.pending, 0);
  assert.equal(adapter.claims.size, 1); assert.ok(adapter.calls.filter(call => call.payload.legacy).every(call => call.payload.legacy.id === id));
});
