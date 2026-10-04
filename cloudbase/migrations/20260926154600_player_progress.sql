-- Run once as the CloudBase database administrator. No passwords are stored here.
-- The gateway supplies request.jwt.claims; never accept a user ID from the payload.
BEGIN;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
     OR pg_catalog.to_regprocedure('auth.role()') IS NULL
     OR pg_catalog.to_regprocedure('auth.jwt()') IS NULL THEN
    RAISE EXCEPTION 'CloudBase auth roles and helpers must exist before this migration';
  END IF;
END;
$migration$;

CREATE TABLE public.frontier_profiles (
  uid text PRIMARY KEY,
  secrets text[] NOT NULL DEFAULT '{}'
    CHECK (secrets <@ ARRAY['rebound','blade-relay','bullet-reversal','fuse-resonance','rail-resonance','ice-break']::text[]),
  best_score integer NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 1000000000),
  coach_done boolean NOT NULL DEFAULT false,
  run_wins bigint NOT NULL DEFAULT 0 CHECK (run_wins >= 0),
  legacy_wins integer NOT NULL DEFAULT 0 CHECK (legacy_wins BETWEEN 0 AND 1000),
  trial_best_time double precision NOT NULL DEFAULT 0 CHECK (trial_best_time BETWEEN 0 AND 86400),
  trial_best_wave integer NOT NULL DEFAULT 0 CHECK (trial_best_wave BETWEEN 0 AND 6),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE public.frontier_run_receipts (
  uid text NOT NULL REFERENCES public.frontier_profiles(uid) ON DELETE CASCADE,
  run_id text NOT NULL CHECK (run_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  won boolean NOT NULL,
  elapsed double precision NOT NULL CHECK (elapsed BETWEEN 0 AND 86400),
  wave integer NOT NULL CHECK (wave BETWEEN 0 AND 6),
  received_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (uid, run_id),
  CHECK (NOT won OR (wave = 6 AND elapsed > 0))
);

CREATE TABLE public.frontier_legacy_receipts (
  legacy_id text PRIMARY KEY CHECK (legacy_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  uid text NOT NULL REFERENCES public.frontier_profiles(uid) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- RPC-only access. RLS has no client policies, so default-deny also protects the
-- tables if table privileges are accidentally broadened later.
ALTER TABLE public.frontier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontier_run_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frontier_legacy_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frontier_profiles, public.frontier_run_receipts, public.frontier_legacy_receipts
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.frontier_load_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  account_uid text := auth.uid();
  profile public.frontier_profiles%ROWTYPE;
BEGIN
  -- CloudBase's RPC gateway may not enforce EXECUTE grants. Check identity in
  -- every public definer function, including anonymous-login JWTs.
  IF auth.role() IS DISTINCT FROM 'authenticated' OR account_uid IS NULL OR account_uid = ''
     OR COALESCE(auth.jwt()->>'is_anonymous', 'false') <> 'false' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to an account to sync progress';
  END IF;
  INSERT INTO public.frontier_profiles (uid) VALUES (account_uid) ON CONFLICT (uid) DO NOTHING;
  SELECT * INTO STRICT profile FROM public.frontier_profiles WHERE uid = account_uid;
  RETURN jsonb_build_object(
    'secrets', to_jsonb(profile.secrets), 'bestScore', profile.best_score, 'coachDone', profile.coach_done,
    'trial', jsonb_build_object('wins', profile.run_wins + profile.legacy_wins,
      'bestTime', profile.trial_best_time, 'bestWave', profile.trial_best_wave)
  );
END;
$function$;

CREATE FUNCTION public.frontier_merge_progress(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  account_uid text := auth.uid();
  source jsonb;
  legacy_snapshot jsonb;
  legacy_id_value text;
  legacy_owner text;
  legacy_accepted boolean := false;
  imported boolean := false;
  item jsonb;
  run_id_value text;
  new_run boolean;
  run_won boolean;
  run_time double precision;
  run_wave integer;
  received_ids text[] := '{}';
  score_value integer;
  time_value double precision;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR account_uid IS NULL OR account_uid = ''
     OR COALESCE(auth.jwt()->>'is_anonymous', 'false') <> 'false' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to an account to sync progress';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text) > 65536 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Progress payload must be an object no larger than 64 KiB';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) AS keys(key)
      WHERE key NOT IN ('secrets','bestScore','coachDone','runs','legacy')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown progress field';
  END IF;

  IF payload ? 'legacy' THEN
    IF jsonb_typeof(payload->'legacy') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid legacy import';
    END IF;
    legacy_id_value := payload->'legacy'->>'id';
    legacy_snapshot := payload->'legacy'->'snapshot';
    IF jsonb_typeof(payload->'legacy'->'id') IS DISTINCT FROM 'string'
       OR legacy_id_value !~ '^[A-Za-z0-9._:-]{1,128}$'
       OR jsonb_typeof(legacy_snapshot) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(payload->'legacy') AS keys(key) WHERE key NOT IN ('id','snapshot')) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid legacy import';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(legacy_snapshot) AS keys(key)
        WHERE key NOT IN ('secrets','bestScore','coachDone','trial'))
       OR jsonb_typeof(legacy_snapshot->'trial') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid legacy snapshot';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(legacy_snapshot->'trial') AS keys(key)
        WHERE key NOT IN ('wins','bestTime','bestWave'))
       OR (CASE WHEN jsonb_typeof(legacy_snapshot->'trial'->'wins') = 'number'
           THEN (legacy_snapshot->'trial'->>'wins')::numeric NOT BETWEEN 0 AND 1000
             OR (legacy_snapshot->'trial'->>'wins')::numeric <> trunc((legacy_snapshot->'trial'->>'wins')::numeric)
           ELSE true END)
       OR (CASE WHEN jsonb_typeof(legacy_snapshot->'trial'->'bestWave') = 'number'
           THEN (legacy_snapshot->'trial'->>'bestWave')::numeric NOT BETWEEN 0 AND 6
             OR (legacy_snapshot->'trial'->>'bestWave')::numeric <> trunc((legacy_snapshot->'trial'->>'bestWave')::numeric)
           ELSE true END)
       OR (CASE WHEN jsonb_typeof(legacy_snapshot->'trial'->'bestTime') = 'number'
           THEN (legacy_snapshot->'trial'->>'bestTime')::numeric NOT BETWEEN 0 AND 86400
           ELSE true END) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid legacy trial record';
    END IF;
  END IF;

  -- Validate both sources before accepting any receipt. A failed call rolls
  -- back completely and leaves all IDs available for a corrected retry.
  FOR source IN SELECT payload UNION ALL SELECT legacy_snapshot WHERE legacy_snapshot IS NOT NULL LOOP
    IF source ? 'secrets' THEN
      IF jsonb_typeof(source->'secrets') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Secrets must be an array';
      END IF;
      IF jsonb_array_length(source->'secrets') > 6 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(source->'secrets') AS values_(value)
        WHERE jsonb_typeof(value) <> 'string' OR (value #>> '{}') NOT IN
          ('rebound','blade-relay','bullet-reversal','fuse-resonance','rail-resonance','ice-break')
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown or excessive secrets';
      END IF;
    END IF;
    IF source ? 'bestScore' AND (CASE WHEN jsonb_typeof(source->'bestScore') = 'number'
      THEN (source->>'bestScore')::numeric NOT BETWEEN 0 AND 1000000000
        OR (source->>'bestScore')::numeric <> trunc((source->>'bestScore')::numeric)
      ELSE true END) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid best score';
    END IF;
    IF source ? 'coachDone' AND jsonb_typeof(source->'coachDone') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid tutorial flag';
    END IF;
  END LOOP;
  IF payload ? 'runs' THEN
    IF jsonb_typeof(payload->'runs') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Runs must be an array';
    END IF;
    IF jsonb_array_length(payload->'runs') > 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Upload at most 100 runs per batch';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(payload->'runs') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid run receipt';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS keys(key) WHERE key NOT IN ('id','won','time','wave'))
         OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR (item->>'id') !~ '^[A-Za-z0-9._:-]{1,128}$'
         OR jsonb_typeof(item->'won') IS DISTINCT FROM 'boolean'
         OR (CASE WHEN jsonb_typeof(item->'time') = 'number'
             THEN (item->>'time')::numeric NOT BETWEEN 0 AND 86400 ELSE true END)
         OR (CASE WHEN jsonb_typeof(item->'wave') = 'number'
             THEN (item->>'wave')::numeric NOT BETWEEN 0 AND 6
               OR (item->>'wave')::numeric <> trunc((item->>'wave')::numeric) ELSE true END) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid run receipt';
      END IF;
      IF (item->>'won')::boolean AND ((item->>'wave')::integer <> 6 OR (item->>'time')::numeric <= 0) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A winning run must finish wave 6 with a positive elapsed time';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.frontier_profiles (uid) VALUES (account_uid) ON CONFLICT (uid) DO NOTHING;
  -- Serialize all updates to this account. Different accounts remain independent.
  PERFORM 1 FROM public.frontier_profiles WHERE uid = account_uid FOR UPDATE;

  IF legacy_snapshot IS NOT NULL THEN
    INSERT INTO public.frontier_legacy_receipts (legacy_id, uid) VALUES (legacy_id_value, account_uid)
      ON CONFLICT (legacy_id) DO NOTHING;
    imported := FOUND;
    SELECT uid INTO legacy_owner FROM public.frontier_legacy_receipts WHERE legacy_id = legacy_id_value;
    legacy_accepted := legacy_owner = account_uid;
    IF imported THEN
      time_value := (legacy_snapshot->'trial'->>'bestTime')::double precision;
      UPDATE public.frontier_profiles SET
        legacy_wins = greatest(legacy_wins, (legacy_snapshot->'trial'->>'wins')::integer),
        trial_best_wave = greatest(trial_best_wave, (legacy_snapshot->'trial'->>'bestWave')::integer),
        trial_best_time = CASE WHEN time_value > 0 AND (legacy_snapshot->'trial'->>'wins')::integer > 0
          THEN CASE WHEN trial_best_time = 0 THEN time_value ELSE least(trial_best_time, time_value) END
          ELSE trial_best_time END
      WHERE uid = account_uid;
    END IF;
  END IF;

  FOR source IN SELECT payload UNION ALL SELECT legacy_snapshot WHERE imported LOOP
    score_value := COALESCE((source->>'bestScore')::integer, 0);
    UPDATE public.frontier_profiles SET
      secrets = ARRAY(SELECT DISTINCT value FROM unnest(secrets ||
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(source->'secrets', '[]'::jsonb)))) AS values_(value) ORDER BY value),
      best_score = greatest(best_score, score_value),
      coach_done = coach_done OR COALESCE((source->>'coachDone')::boolean, false)
    WHERE uid = account_uid;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'runs', '[]'::jsonb)) LOOP
    run_id_value := item->>'id';
    run_won := (item->>'won')::boolean;
    run_time := (item->>'time')::double precision;
    run_wave := (item->>'wave')::integer;
    INSERT INTO public.frontier_run_receipts (uid, run_id, won, elapsed, wave)
      VALUES (account_uid, run_id_value, run_won, run_time, run_wave) ON CONFLICT (uid, run_id) DO NOTHING;
    new_run := FOUND;
    IF new_run THEN
      UPDATE public.frontier_profiles SET
        run_wins = run_wins + CASE WHEN run_won THEN 1 ELSE 0 END,
        trial_best_wave = greatest(trial_best_wave, run_wave),
        trial_best_time = CASE WHEN run_won
          THEN CASE WHEN trial_best_time = 0 THEN run_time ELSE least(trial_best_time, run_time) END
          ELSE trial_best_time END
      WHERE uid = account_uid;
    END IF;
    IF NOT (run_id_value = ANY(received_ids)) THEN
      received_ids := array_append(received_ids, run_id_value);
    END IF;
  END LOOP;
  UPDATE public.frontier_profiles SET updated_at = pg_catalog.now() WHERE uid = account_uid;
  RETURN jsonb_build_object('snapshot', public.frontier_load_progress(),
    'acknowledgedRunIds', to_jsonb(received_ids), 'legacyAccepted', legacy_accepted);
END;
$function$;

REVOKE ALL ON FUNCTION public.frontier_load_progress() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.frontier_merge_progress(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frontier_load_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.frontier_merge_progress(jsonb) TO authenticated;
COMMIT;
