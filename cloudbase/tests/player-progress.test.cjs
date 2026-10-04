const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../build-tools/sql-verification/node_modules/@electric-sql/pglite');

// Execute the shipped migration in PostgreSQL, not a JavaScript reimplementation.
const migration = fs.readFileSync(path.join(__dirname, '../migrations/20260926154600_player_progress.sql'), 'utf8');
const empty = { secrets: [], bestScore: 0, coachDone: false, trial: { wins: 0, bestTime: 0, bestWave: 0 } };
let db;
const win = (id, time = 300) => ({ id, won: true, time, wave: 6 });
const legacy = (id, wins = 4, overrides = {}) => ({ id, snapshot: {
  secrets: ['rebound'], bestScore: 800, coachDone: true,
  trial: { wins, bestTime: 450, bestWave: 6 }, ...overrides,
} });

before(async () => {
  db = new PGlite();
  // Test fixture mirrors CloudBase's documented JWT helpers. It does not ship
  // these helpers or a test authentication bypass to the hosted environment.
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'sub' $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  `);
  await db.exec(migration);
});
after(async () => { await db?.close(); });

async function identity(uid, claims = {}) {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: 'authenticated', ...claims })]);
}
async function load() {
  return (await db.query('SELECT public.frontier_load_progress() AS result')).rows[0].result;
}
async function merge(payload) {
  return (await db.query('SELECT public.frontier_merge_progress($1::jsonb) AS result', [JSON.stringify(payload)])).rows[0].result;
}
async function invalid(payload) {
  await assert.rejects(merge(payload), (error) => error.code === '22023');
}

test('account authentication is checked inside both RPCs even when called as their owner', async () => {
  for (const [uid, claims] of [[null, {}], ['', {}], ['fake', { role: 'anon' }], ['guest', { is_anonymous: true }], ['fake', { role: 'service_role' }]]) {
    await identity(uid, claims);
    await assert.rejects(load(), (error) => error.code === '42501');
    await assert.rejects(merge({}), (error) => error.code === '42501');
  }
});

test('empty load is canonical, and an authenticated role can use the RPC without table access', async () => {
  await identity('empty-user');
  await db.exec('SET ROLE authenticated');
  try {
    assert.deepEqual(await load(), empty);
    assert.deepEqual((await merge({})).snapshot, empty);
    for (const table of ['frontier_profiles', 'frontier_run_receipts', 'frontier_legacy_receipts']) {
      await assert.rejects(db.query(`SELECT * FROM public.${table}`), (error) => error.code === '42501');
      await assert.rejects(db.query(`DELETE FROM public.${table}`), (error) => error.code === '42501');
    }
  } finally { await db.exec('RESET ROLE'); }
});

test('UID comes from JWT only; two accounts are isolated and a forged payload UID is rejected', async () => {
  await identity('isolation-a');
  await merge({ secrets: ['ice-break'], bestScore: 500 });
  await identity('isolation-b');
  assert.deepEqual(await load(), empty);
  await invalid({ uid: 'isolation-a', bestScore: 999999 });
  assert.deepEqual(await load(), empty);
  await identity('isolation-a');
  assert.deepEqual((await load()).secrets, ['ice-break']);
  assert.equal((await load()).bestScore, 500);
});

test('union, max score, and tutorial completion are monotone over stale-device uploads', async () => {
  await identity('monotone');
  await merge({ secrets: ['rebound', 'blade-relay', 'rebound'], bestScore: 700, coachDone: true });
  const result = await merge({ secrets: ['ice-break', 'rail-resonance'], bestScore: 100, coachDone: false });
  assert.deepEqual(result.snapshot.secrets, ['blade-relay', 'ice-break', 'rail-resonance', 'rebound']);
  assert.equal(result.snapshot.bestScore, 700);
  assert.equal(result.snapshot.coachDone, true);
  assert.deepEqual(result.acknowledgedRunIds, []);
  assert.equal(result.legacyAccepted, false);
});

test('unique completed runs count once across duplicate batches, and retries are acknowledged', async () => {
  await identity('retries');
  const first = await merge({ runs: [win('run-a', 350), win('run-a', 350), win('run-b', 250)] });
  assert.deepEqual(first.acknowledgedRunIds, ['run-a', 'run-b']);
  assert.deepEqual(first.snapshot.trial, { wins: 2, bestTime: 250, bestWave: 6 });
  const retry = await merge({ runs: [win('run-a', 1), win('run-b', 200)] });
  assert.deepEqual(retry.acknowledgedRunIds, ['run-a', 'run-b']);
  assert.deepEqual(retry.snapshot.trial, first.snapshot.trial);
  await identity('different-account-same-run-id');
  assert.equal((await merge({ runs: [win('run-a')] })).snapshot.trial.wins, 1);
});

test('losses only advance best wave; a receipt cannot later be upgraded to a win', async () => {
  await identity('loss');
  let result = await merge({ runs: [{ id: 'lost', won: false, time: 10, wave: 5 }] });
  assert.deepEqual(result.snapshot.trial, { wins: 0, bestTime: 0, bestWave: 5 });
  result = await merge({ runs: [win('lost', 1), win('completed', 100)] });
  assert.deepEqual(result.snapshot.trial, { wins: 1, bestTime: 100, bestWave: 6 });
  result = await merge({ runs: [{ id: 'lost-faster', won: false, time: 1, wave: 3 }] });
  assert.deepEqual(result.snapshot.trial, { wins: 1, bestTime: 100, bestWave: 6 });
});

test('legacy claim is idempotent, globally single-owner, and distinct-device wins use a maximum baseline', async () => {
  await identity('legacy-a');
  let result = await merge({ legacy: legacy('browser-one'), runs: [win('new-run')] });
  assert.equal(result.legacyAccepted, true);
  assert.deepEqual(result.snapshot.trial, { wins: 5, bestTime: 300, bestWave: 6 });
  result = await merge({ legacy: legacy('browser-one', 99), runs: [win('new-run')] });
  assert.equal(result.legacyAccepted, true);
  assert.equal(result.snapshot.trial.wins, 5);
  result = await merge({ legacy: legacy('browser-two', 6) });
  assert.equal(result.snapshot.trial.wins, 7);
  await identity('legacy-b');
  result = await merge({ legacy: legacy('browser-one'), runs: [win('b-new')] });
  assert.equal(result.legacyAccepted, false);
  assert.deepEqual(result.acknowledgedRunIds, ['b-new']);
  assert.deepEqual(result.snapshot.secrets, []);
  assert.equal(result.snapshot.bestScore, 0);
  assert.equal(result.snapshot.trial.wins, 1);
});

test('legacy fields only merge on the first successful claim, including best-time and secret mutations', async () => {
  await identity('legacy-immutable');
  const initial = await merge({ legacy: legacy('immutable-import', 2) });
  const changed = legacy('immutable-import', 100, {
    secrets: ['rail-resonance'], bestScore: 90000, trial: { wins: 100, bestTime: 1, bestWave: 6 },
  });
  const result = await merge({ legacy: changed });
  assert.equal(result.legacyAccepted, true);
  assert.deepEqual(result.snapshot, initial.snapshot);
});

test('malformed and oversized payloads fail atomically without reserving a run or legacy ID', async () => {
  await identity('invalid-atomic');
  await invalid({ bestScore: 900, secrets: ['rebound'], legacy: legacy('unreserved'), runs: [win('valid'), win('invalid', 0)] });
  assert.deepEqual(await load(), empty);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.frontier_legacy_receipts WHERE legacy_id='unreserved'")).rows[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.frontier_run_receipts WHERE uid='invalid-atomic'")).rows[0].count, 0);
  for (const payload of [null, [], { uid: 'other' }, { bestScore: '42' }, { bestScore: 1.5 }, { bestScore: 1e20 },
    { coachDone: null }, { secrets: null }, { secrets: ['unknown'] }, { secrets: [null] },
    { runs: {} }, { runs: [null] }, { runs: [win('bad id')] }, { runs: [{ ...win('bad-wave'), wave: 5 }] },
    { runs: [{ ...win('fraction'), wave: 5.5 }] }, { runs: [{ ...win('wrong-bool'), won: 'true' }] },
    { runs: [{ ...win('huge-time'), time: 86401 }] }, { runs: Array.from({ length: 101 }, (_, i) => win(`many-${i}`)) },
    { legacy: legacy('excess-wins', 1001) }, { legacy: { id: 'bad', snapshot: {} } },
    { secrets: ['x'.repeat(70000)] }]) await invalid(payload);
  assert.deepEqual(await load(), empty);
  const recovered = await merge({ legacy: legacy('unreserved'), runs: [win('valid')] });
  assert.equal(recovered.legacyAccepted, true);
  assert.equal(recovered.snapshot.trial.wins, 5);
});

test('allowed numeric limits and fractional positive elapsed times survive round trips', async () => {
  await identity('limits');
  const result = await merge({ bestScore: 1000000000, secrets: ['bullet-reversal', 'fuse-resonance'],
    legacy: legacy('limit-import', 1000, { trial: { wins: 1000, bestTime: 86400, bestWave: 6 } }),
    runs: [win('max', 86400), win('fractional', 123.456789)] });
  assert.equal(result.snapshot.bestScore, 1000000000);
  assert.deepEqual(result.snapshot.trial, { wins: 1002, bestTime: 123.456789, bestWave: 6 });
  assert.deepEqual(await load(), result.snapshot);
});

test('RLS defaults to deny even if a future administrator accidentally grants table access', async () => {
  await identity('rls-user');
  await merge({ bestScore: 100 });
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.frontier_profiles TO authenticated; SET ROLE authenticated');
  try {
    assert.deepEqual((await db.query('SELECT uid FROM public.frontier_profiles')).rows, []);
    await assert.rejects(db.query("INSERT INTO public.frontier_profiles(uid) VALUES ('forged')"), (error) => error.code === '42501');
    assert.equal((await db.query('UPDATE public.frontier_profiles SET best_score = 999 RETURNING uid')).rows.length, 0);
    assert.equal((await load()).bestScore, 100);
  } finally {
    await db.exec('RESET ROLE; REVOKE ALL ON public.frontier_profiles FROM authenticated');
  }
});

test('both definers use a fixed trusted search path and expose only authenticated execution grants', async () => {
  const rows = (await db.query(`SELECT p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anonymous_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS account_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('frontier_load_progress','frontier_merge_progress')
    ORDER BY p.proname`)).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.prosecdef, true);
    assert.deepEqual(row.proconfig, ['search_path=pg_catalog']);
    assert.equal(row.anonymous_execute, false);
    assert.equal(row.account_execute, true);
  }
});
