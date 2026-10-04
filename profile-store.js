(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FrontierProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SECRET_IDS = ['rebound', 'blade-relay', 'bullet-reversal', 'fuse-resonance', 'rail-resonance', 'ice-break'];
  const GUEST_KEY = 'frontier-guest-v1';
  const accountKey = uid => 'frontier-account-v1:' + encodeURIComponent(uid);
  const keyFor = uid => uid === null ? GUEST_KEY : accountKey(uid);
  const count = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const time = value => Number.isFinite(value) && value > 0 && value <= 86400 ? value : 0;
  const fastest = (a, b) => a && b ? Math.min(a, b) : a || b;
  const clone = value => JSON.parse(JSON.stringify(value));

  function normalizeSnapshot(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const trial = value.trial || {};
    return {
      secrets: SECRET_IDS.filter(id => Array.isArray(value.secrets) && value.secrets.includes(id)),
      bestScore: Math.min(1e9, count(value.bestScore)), coachDone: value.coachDone === true,
      trial: { wins: count(trial.wins), bestTime: time(trial.bestTime), bestWave: Math.min(6, count(trial.bestWave)) }
    };
  }
  function mergeSnapshots(first, second) {
    const a = normalizeSnapshot(first), b = normalizeSnapshot(second);
    return { secrets: SECRET_IDS.filter(id => a.secrets.includes(id) || b.secrets.includes(id)), bestScore: Math.max(a.bestScore, b.bestScore),
      coachDone: a.coachDone || b.coachDone, trial: { wins: Math.max(a.trial.wins, b.trial.wins),
        bestTime: fastest(a.trial.bestTime, b.trial.bestTime), bestWave: Math.max(a.trial.bestWave, b.trial.bestWave) } };
  }
  function normalizeRun(value) {
    if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.id) || typeof value.won !== 'boolean' || !Number.isFinite(value.time) || value.time < 0 || value.time > 86400 || (value.won && value.time <= 0)) return null;
    return { id: value.id, won: value.won, time: value.time, wave: value.won ? 6 : Math.min(6, count(value.wave)) };
  }
  function mergeRuns(a, b) {
    const seen = new Set();
    return [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].map(normalizeRun).filter(run => run && !seen.has(run.id) && seen.add(run.id));
  }
  function emptyData() { return { version: 1, snapshot: normalizeSnapshot(), server: normalizeSnapshot(), runs: [], acknowledged: [], legacy: null, legacyId: '', claim: null }; }
  function normalizeData(value) {
    const data = emptyData();
    if (!value || typeof value !== 'object') return data;
    data.snapshot = normalizeSnapshot(value.snapshot); data.server = normalizeSnapshot(value.server);
    data.acknowledged = [...new Set((Array.isArray(value.acknowledged) ? value.acknowledged : []).filter(id => typeof id === 'string'))];
    data.runs = mergeRuns(value.runs, []).filter(run => !data.acknowledged.includes(run.id));
    if (value.legacy && typeof value.legacy.id === 'string') data.legacy = { id: value.legacy.id, snapshot: normalizeSnapshot(value.legacy.snapshot) };
    if (typeof value.legacyId === 'string') data.legacyId = value.legacyId;
    if (value.claim && typeof value.claim.uid === 'string') data.claim = { uid: value.claim.uid, accepted: value.claim.accepted === true };
    if (data.legacy && data.acknowledged.includes('legacy:' + data.legacy.id)) data.legacy = null;
    return data;
  }
  function mergeData(first, second) {
    const a = normalizeData(first), b = normalizeData(second), data = emptyData();
    data.snapshot = mergeSnapshots(a.snapshot, b.snapshot); data.server = mergeSnapshots(a.server, b.server);
    data.acknowledged = [...new Set([...a.acknowledged, ...b.acknowledged])];
    data.runs = mergeRuns(a.runs, b.runs).filter(run => !data.acknowledged.includes(run.id));
    data.legacy = a.legacy || b.legacy;
    data.legacyId = a.legacyId || b.legacyId;
    data.claim = a.claim || b.claim;
    if (a.claim && b.claim && a.claim.uid === b.claim.uid) data.claim = { uid: a.claim.uid, accepted: a.claim.accepted || b.claim.accepted };
    if (b.claim && b.claim.accepted) data.claim = b.claim;
    if (data.legacy && data.acknowledged.includes('legacy:' + data.legacy.id)) data.legacy = null;
    return data;
  }

  // Store({storage, adapter, onChange}); onChange receives the Store instance.
  // Getters: identity (uid|null), snapshot, status, legacy {available,snapshot}.
  // record* returns whether a new value was recorded. Account writes sync automatically.
  // switchAccount/sync/importLegacy return Promises; errors remain in status, not rejected.
  // merge response: {snapshot, acknowledgedRunIds, legacyAccepted}; only explicit receipts
  // clear the outbox. Account wins show confirmed cloud totals; guest wins are immediate.
  class Store {
    constructor({ storage, adapter, onChange } = {}) {
      this.storage = storage; this.adapter = adapter; this.onChange = onChange || (() => {});
      this._identity = null; this._epoch = 0; this._memory = new Map(); this._errors = new Map(); this._persistent = new Map();
      this._flights = new Map(); this._again = new Set(); this._loading = false;
      this._read(null); this._persist(null, this._memory.get(null));
      this._storageListener = event => {
        if (event.storageArea && event.storageArea !== this.storage) return;
        const uid = this._identity;
        if (event.key !== keyFor(uid) || !event.newValue) return;
        let incoming; try { incoming = JSON.parse(event.newValue); } catch (_) { return; }
        this._persist(uid, mergeData(this._memory.get(uid), incoming)); this._notify();
      };
      if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('storage', this._storageListener);
    }
    get identity() { return this._identity; }
    get snapshot() {
      const data = this._memory.get(this._identity), snapshot = clone(data.snapshot);
      if (this._identity === null) snapshot.trial.wins += data.runs.filter(run => run.won).length;
      return snapshot;
    }
    get status() {
      const uid = this._identity, data = this._memory.get(uid);
      const dirty = uid !== null && JSON.stringify(data.snapshot) !== JSON.stringify(data.server);
      return { loading: this._loading, syncing: this._flights.has(this._epoch + ':' + uid), pending: uid === null ? 0 : data.runs.length + (data.legacy ? 1 : 0) + (dirty ? 1 : 0),
        persistent: this._persistent.get(uid) !== false, error: this._errors.get(uid) || null };
    }
    get legacyAvailable() {
      const guest = this._read(null);
      return this._identity !== null && (!guest.claim || guest.claim.uid === this._identity && !guest.claim.accepted) &&
        (guest.snapshot.secrets.length > 0 || guest.snapshot.bestScore > 0 || guest.snapshot.coachDone || guest.snapshot.trial.wins > 0 || guest.snapshot.trial.bestWave > 0 || guest.runs.length > 0);
    }
    get legacy() {
      const guest = this._read(null), snapshot = clone(guest.snapshot);
      snapshot.trial.wins = Math.min(1000, snapshot.trial.wins + guest.runs.filter(run => run.won).length);
      return { available: this.legacyAvailable, snapshot };
    }
    _notify() { this.onChange(this); }
    _stored(uid) {
      try { const raw = this.storage && this.storage.getItem(keyFor(uid)); return raw === null || raw === undefined ? null : normalizeData(JSON.parse(raw)); }
      catch (_) { this._persistent.set(uid, false); return null; }
    }
    _read(uid) {
      let data = this._stored(uid), memory = this._memory.get(uid);
      if (!data && !memory) {
        data = emptyData();
        if (uid === null) {
          const read = key => { try { return this.storage && this.storage.getItem(key); } catch (_) { return null; } };
          let secrets = [], trial = {};
          try { secrets = JSON.parse(read('frontier-secrets-v1') || '[]'); } catch (_) {}
          try { trial = JSON.parse(read('frontier-trial-record-v1') || '{}'); } catch (_) {}
          data.snapshot = normalizeSnapshot({ secrets, bestScore: Number(read('frontier-best')), coachDone: read('frontier-coach') === 'done', trial });
          data.legacyId = 'guest-' + (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
        }
      }
      data = mergeData(data, memory); this._memory.set(uid, data); return data;
    }
    _persist(uid, value) {
      const data = mergeData(value, this._stored(uid)); this._memory.set(uid, data);
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        const serialized = JSON.stringify(data);
        if (this.storage.getItem(keyFor(uid)) !== serialized) this.storage.setItem(keyFor(uid), serialized);
        this._persistent.set(uid, true);
      } catch (_) { this._persistent.set(uid, false); }
      return data;
    }
    _changed(uid, data) {
      this._persist(uid, data); this._notify();
      if (uid !== null) this.sync();
      return true;
    }
    async switchAccount(uid) {
      if (uid !== null && (typeof uid !== 'string' || !uid.length || uid.length > 256)) throw new TypeError('Expected an account uid or null');
      const epoch = ++this._epoch;
      this._identity = uid; this._loading = uid !== null;
      this._read(uid); this._notify();
      if (uid === null) return this.snapshot;
      try {
        if (!this.adapter) throw new Error('Cloud adapter unavailable');
        const response = await this.adapter.load(uid), snapshot = normalizeSnapshot(response.snapshot || response);
        const data = this._read(uid); data.server = mergeSnapshots(data.server, snapshot); data.snapshot = mergeSnapshots(data.snapshot, snapshot); this._persist(uid, data);
        if (epoch === this._epoch || this._identity !== uid) this._errors.delete(uid);
      } catch (error) { if (epoch === this._epoch || this._identity !== uid) this._errors.set(uid, error.message || 'Cloud load failed'); }
      if (epoch !== this._epoch) return;
      this._loading = false; this._notify();
      if (this.status.pending) await this.sync();
      return this.snapshot;
    }
    recordSecret(id) {
      if (!SECRET_IDS.includes(id)) return false;
      const uid = this._identity, data = this._read(uid);
      if (data.snapshot.secrets.includes(id)) return false;
      data.snapshot = mergeSnapshots(data.snapshot, { secrets: [id] });
      return this._changed(uid, data);
    }
    recordBest(score) {
      const uid = this._identity, data = this._read(uid);
      const bestScore = Math.min(1e9, count(score));
      if (bestScore <= data.snapshot.bestScore) return false;
      data.snapshot.bestScore = bestScore; return this._changed(uid, data);
    }
    recordCoach() {
      const uid = this._identity, data = this._read(uid);
      if (data.snapshot.coachDone) return false;
      data.snapshot.coachDone = true; return this._changed(uid, data);
    }
    recordRun(receipt) {
      const run = normalizeRun(receipt); if (!run) return false;
      const uid = this._identity, data = this._read(uid);
      if (data.runs.some(item => item.id === run.id) || data.acknowledged.includes(run.id)) return false;
      data.runs.push(run); data.snapshot.trial.bestWave = Math.max(data.snapshot.trial.bestWave, run.wave);
      if (run.won) data.snapshot.trial.bestTime = fastest(data.snapshot.trial.bestTime, run.time);
      return this._changed(uid, data);
    }
    async sync() {
      const uid = this._identity, epoch = this._epoch;
      if (uid === null) return true;
      const flightKey = epoch + ':' + uid;
      if (this._flights.has(flightKey)) { this._again.add(flightKey); return this._flights.get(flightKey); }
      const data = this._read(uid), payload = { secrets: data.snapshot.secrets, bestScore: data.snapshot.bestScore, coachDone: data.snapshot.coachDone, runs: clone(data.runs.slice(0, 100)) };
      if (data.legacy) payload.legacy = clone(data.legacy);
      const flight = Promise.resolve().then(async () => {
        try {
          if (!this.adapter) throw new Error('Cloud adapter unavailable');
          const response = await this.adapter.merge(uid, payload), snapshot = normalizeSnapshot(response.snapshot || response);
          const current = this._read(uid), sentIds = new Set(payload.runs.map(run => run.id));
          const acknowledged = (Array.isArray(response.acknowledgedRunIds) ? response.acknowledgedRunIds : []).filter(id => sentIds.has(id));
          current.acknowledged = [...new Set([...current.acknowledged, ...acknowledged])];
          current.runs = current.runs.filter(run => !current.acknowledged.includes(run.id));
          if (acknowledged.length && current.runs.some(run => !sentIds.has(run.id))) this._again.add(flightKey);
          current.server = mergeSnapshots(current.server, snapshot); current.snapshot = mergeSnapshots(current.snapshot, snapshot);
          if (payload.legacy && response.legacyAccepted === true) {
            current.legacy = null;
            const guest = this._read(null);
            if (guest.legacyId === payload.legacy.id && guest.claim && guest.claim.uid === uid) { guest.claim.accepted = true; this._persist(null, guest); }
          }
          // Accepted imports are tombstoned by their stable id so another tab cannot restore them.
          if (payload.legacy && response.legacyAccepted === true) current.acknowledged.push('legacy:' + payload.legacy.id);
          this._persist(uid, current);
          if (epoch === this._epoch || this._identity !== uid) this._errors.delete(uid); return true;
        } catch (error) { if (epoch === this._epoch || this._identity !== uid) this._errors.set(uid, error.message || 'Cloud sync failed'); return false; }
        finally {
          this._flights.delete(flightKey);
          const again = this._again.delete(flightKey);
          if (epoch === this._epoch) { this._notify(); if (again) this.sync(); }
        }
      });
      this._flights.set(flightKey, flight); this._notify();
      return flight;
    }
    async importLegacy() {
      const uid = this._identity;
      if (uid === null || !this.legacyAvailable) return false;
      const guest = this._read(null);
      guest.claim = { uid, accepted: false }; this._persist(null, guest);
      if (this._persistent.get(null) === false) { this._errors.set(uid, 'Cannot persist the legacy claim; retry when browser storage is available'); this._notify(); return false; }
      const snapshot = this.legacy.snapshot;
      const data = this._read(uid); data.legacy = { id: guest.legacyId, snapshot }; this._persist(uid, data);
      this._notify(); await this.sync();
      return this._read(null).claim?.uid === uid && this._read(null).claim.accepted;
    }
    dispose() { if (typeof globalThis.removeEventListener === 'function') globalThis.removeEventListener('storage', this._storageListener); }
  }
  return { Store, SECRET_IDS, normalizeSnapshot, mergeSnapshots, GUEST_KEY, accountKey };
});
