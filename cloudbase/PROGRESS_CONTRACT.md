# Account progress RPC contract

Migration: `migrations/20260926154600_player_progress.sql`.

The CloudBase gateway supplies the authenticated JWT. The browser never supplies a UID to these RPCs, and these tables contain no passwords. The functions require `auth.role() = 'authenticated'`, a nonempty `auth.uid()`, and no anonymous-login claim. Direct client table access is revoked; all three tables also have RLS enabled with no client policies.

## Calls

Use the authenticated CloudBase PostgreSQL client / RPC endpoint:

```js
await app.rdb().rpc('frontier_load_progress', {});
await app.rdb().rpc('frontier_merge_progress', { payload });
```

The load RPC returns this bare JSON object, inside the SDK's normal response envelope:

```json
{
  "secrets": [],
  "bestScore": 0,
  "coachDone": false,
  "trial": { "wins": 0, "bestTime": 0, "bestWave": 0 }
}
```

The merge RPC accepts optional top-level `secrets`, `bestScore`, `coachDone`, `runs`, and `legacy` fields. An empty object is valid. Unknown fields are rejected, including a client-supplied UID or top-level aggregate `trial` record.

```json
{
  "secrets": ["rebound"],
  "bestScore": 4000,
  "coachDone": true,
  "runs": [{ "id": "run-unique-id", "won": true, "time": 421.25, "wave": 6 }],
  "legacy": {
    "id": "stable-old-browser-id",
    "snapshot": {
      "secrets": ["rebound"],
      "bestScore": 3500,
      "coachDone": true,
      "trial": { "wins": 2, "bestTime": 430.5, "bestWave": 6 }
    }
  }
}
```

Its return value is `{ snapshot, acknowledgedRunIds, legacyAccepted }`. Only remove queued run IDs listed in `acknowledgedRunIds`. Repeating a previously accepted ID for the same account still acknowledges it; the first receipt is immutable and later payload changes cannot upgrade a loss, change time, or add another win.

`legacyAccepted` is true for a new successful claim or a retry by its original account. It is false when no legacy import was supplied or that legacy ID belongs to another account; other valid progress in that call still merges. A retry does not re-import any snapshot fields. Use one persistent legacy ID per old local installation, not a new ID per upload. Capture legacy history once; do not turn later downloaded cloud snapshots back into new legacy imports.

## Merge and limits

- Secrets form a sorted set of the six IDs: `rebound`, `blade-relay`, `bullet-reversal`, `fuse-resonance`, `rail-resonance`, `ice-break`; a supplied array has at most six entries. Unknown IDs are rejected.
- Score is an integer from 0 through 1,000,000,000 and only increases. Tutorial completion is a boolean and stays true once achieved.
- Run and legacy IDs are 1–128 ASCII letters, digits, `.`, `_`, `:`, or `-`. A run requires all four fields: `id`, boolean `won`, numeric `time`, and integer `wave`.
- A batch has at most 100 runs, and a JSON payload has at most 64 KiB in its PostgreSQL JSON text representation. Split larger queues into batches.
- Wave is 0–6; elapsed time is 0–86,400 seconds. A win requires wave 6 and strictly positive time. Only newly accepted winning receipts increase wins or improve best time. Losses can improve best wave.
- A legacy `trial` record requires `wins`, `bestTime`, and `bestWave`; legacy wins must be an integer 0–1,000. The historical win baseline is the **maximum** among claimed legacy snapshots, then new distinct winning receipts are added. This conservatively avoids adding overlapping old histories from several devices. Old wins are not summed across imports.
- Best wave takes the maximum. Best time takes the minimum positive winning time; 0 means no winning time. A legacy snapshot with zero wins cannot introduce a winning time.
- Any invalid field fails the entire transaction with SQLSTATE `22023`; authentication failures use `42501`. No receipt is reserved by a failed transaction.

Per-account row locking serializes merges for one UID. Composite run keys prevent repeat counting; the globally unique legacy key prevents two accounts claiming one legacy ID. These are synchronization guarantees, not server-authoritative anti-cheat: the game still reports its own local results.

## Local verification

Install the test-only PostgreSQL runtime outside game dependencies:

```powershell
npm.cmd install --prefix build-tools/sql-verification --no-audit --no-fund @electric-sql/pglite@0.5.8
node --test cloudbase/tests/player-progress.test.cjs
```

The suite executes the unmodified migration in PostgreSQL and checks identity isolation, direct-table denial, the internal role guard, deduplication, rollback, immutable receipts, legacy ownership, maxima/minima, and RLS even after an accidental table grant. The auth helper fixture exists only inside the test database. PGlite provides one connection, so this suite does **not** establish multi-session concurrency or the hosted gateway's token behavior.

## Deployment acceptance plan

1. Apply the migration once through CloudBase's migration tool as the database administrator. Do not expose CLI credentials, an administrative key, or user access tokens in files shipped to the browser.
2. Inspect the hosted catalog: three RLS-enabled tables with no client policies; two definer functions with `search_path=pg_catalog`; only authenticated execution grants. Test an unauthenticated gateway call and an anonymous-login call: both must fail, including when the gateway bypasses PostgreSQL EXECUTE grants.
3. Sign in two dedicated test accounts. Verify each starts with an empty snapshot, writes its own data, and cannot supply another UID. Verify authenticated RPC works while direct table access fails.
4. For one test UID, submit two concurrent batches sharing one run ID and each having one distinct ID. The final increase must be exactly three wins, both responses must acknowledge their requested IDs, and replaying both batches must add zero. Also race disjoint secrets and scores; the final result must contain their union and maximum.
5. Race the same fresh legacy ID from two test accounts. Exactly one response must claim it. A winner retry must return true with no increment; a loser retry must return false without reading the owner's identity. For the same UID, simultaneous new legacy import and run must preserve both results.
6. Use the same real account on a second browser/device: verify discoveries and records restore. Interrupt one upload, replay its queued IDs after reconnecting, and confirm wins remain stable. A live gateway or concurrency failure is a deployment blocker even when local SQL tests pass.

## Verified platform facts

Read-only inspection of the target environment on 2026-09-26 found PostgreSQL 17.11, `anon` / `authenticated` / `service_role`, and `auth.uid(): text`, `auth.role(): text`, `auth.jwt(): jsonb`. The read-only role switch was unavailable to this CLI account; the catalog inspection used a plain SELECT as the existing default role and did not change hosted data.

After deployment, the catalog audit at 2026-09-26 15:52 UTC confirmed all three tables have RLS enabled, no policies, and no direct authenticated read/write grants. Both RPCs return JSONB, run as definers with `search_path=pg_catalog`, retain the UID/role/anonymous checks, and grant execution only to authenticated clients. This catalog verification does not replace the separate live-account and concurrent-request acceptance checks above.

Official references: [PostgreSQL auth helpers](https://docs.cloudbase.net/authentication-v2/auth/auth-pg), [RPC security and API](https://docs.cloudbase.net/database/postgresql/rpc), [RLS and permissions](https://docs.cloudbase.net/database/postgresql/data-permission). CloudBase explicitly warns that its gateway may not enforce RPC EXECUTE grants, which is why both public functions independently validate the trusted JWT inside their bodies.
