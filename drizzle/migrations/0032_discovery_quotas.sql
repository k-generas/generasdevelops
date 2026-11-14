ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS discovery_daily_limit integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS discovery_cooldown_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_max_results integer NOT NULL DEFAULT 20;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_discovery_limits_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_discovery_limits_check
      CHECK (
        discovery_daily_limit BETWEEN 0 AND 1000
        AND discovery_cooldown_seconds BETWEEN 0 AND 86400
        AND discovery_max_results BETWEEN 1 AND 20
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  discovery_run_id uuid REFERENCES public.discovery_runs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  http_status integer,
  units integer NOT NULL DEFAULT 1,
  duration_ms integer,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_request_logs_status_check CHECK (status IN ('success', 'failed', 'blocked'))
);

GRANT SELECT, INSERT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own api requests" ON public.api_request_logs;
CREATE POLICY "Users can view own api requests"
  ON public.api_request_logs FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can record own api requests" ON public.api_request_logs;
CREATE POLICY "Users can record own api requests"
  ON public.api_request_logs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all api requests" ON public.api_request_logs;
CREATE POLICY "Admins can view all api requests"
  ON public.api_request_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.is_admin = true
  ));

DROP POLICY IF EXISTS "Service role can manage api requests" ON public.api_request_logs;
CREATE POLICY "Service role can manage api requests"
  ON public.api_request_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_owner_created
  ON public.api_request_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_provider_created
  ON public.api_request_logs(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_discovery_run
  ON public.api_request_logs(discovery_run_id);

DROP POLICY IF EXISTS "Admins can view all runs" ON public.discovery_runs;
CREATE POLICY "Admins can view all runs"
  ON public.discovery_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.is_admin = true
  ));

CREATE OR REPLACE FUNCTION public.claim_discovery_run(
  p_query text,
  p_location text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_rerun_of uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_cooldown integer;
  v_max_results integer;
  v_used integer := 0;
  v_last timestamptz;
  v_reset timestamptz;
  v_next timestamptz;
  v_run_id uuid;
BEGIN
  v_reset := (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC';

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'unauthenticated',
      'message', 'Sign in required.',
      'used_today', 0,
      'limit', 20,
      'remaining', 0,
      'cooldown_seconds', 0,
      'max_results', 20,
      'retry_after_seconds', 0,
      'next_available_at', v_reset,
      'reset_at', v_reset
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  SELECT
    COALESCE(discovery_daily_limit, 20),
    COALESCE(discovery_cooldown_seconds, 0),
    COALESCE(discovery_max_results, 20)
  INTO v_limit, v_cooldown, v_max_results
  FROM public.user_profiles
  WHERE id = v_uid;

  v_limit := GREATEST(COALESCE(v_limit, 20), 0);
  v_cooldown := GREATEST(COALESCE(v_cooldown, 0), 0);
  v_max_results := LEAST(GREATEST(COALESCE(v_max_results, 20), 1), 20);

  SELECT count(*), max(created_at)
  INTO v_used, v_last
  FROM public.discovery_runs
  WHERE owner_id = v_uid
    AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');

  IF v_limit = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'disabled',
      'message', 'Discovery is disabled for this account. Ask an administrator to raise the limit.',
      'used_today', v_used,
      'limit', v_limit,
      'remaining', 0,
      'cooldown_seconds', v_cooldown,
      'max_results', v_max_results,
      'retry_after_seconds', 0,
      'next_available_at', v_reset,
      'reset_at', v_reset
    );
  END IF;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'daily_limit',
      'message', format('Daily discovery limit reached (%s/%s). Try again tomorrow or ask an administrator to raise the limit.', v_used, v_limit),
      'used_today', v_used,
      'limit', v_limit,
      'remaining', 0,
      'cooldown_seconds', v_cooldown,
      'max_results', v_max_results,
      'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - now())))::integer),
      'next_available_at', v_reset,
      'reset_at', v_reset
    );
  END IF;

  IF v_cooldown > 0 AND v_last IS NOT NULL THEN
    v_next := v_last + make_interval(secs => v_cooldown);
    IF now() < v_next THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'cooldown',
        'message', format('Please wait %ss before running another discovery search.', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_next - now())))::integer)),
        'used_today', v_used,
        'limit', v_limit,
        'remaining', GREATEST(v_limit - v_used, 0),
        'cooldown_seconds', v_cooldown,
        'max_results', v_max_results,
        'retry_after_seconds', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_next - now())))::integer),
        'next_available_at', v_next,
        'reset_at', v_reset
      );
    END IF;
  END IF;

  INSERT INTO public.discovery_runs (owner_id, query, location, title, status, rerun_of)
  VALUES (v_uid, p_query, NULLIF(p_location, ''), p_title, 'running', p_rerun_of)
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'used_today', v_used + 1,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used - 1, 0),
    'cooldown_seconds', v_cooldown,
    'max_results', v_max_results,
    'retry_after_seconds', 0,
    'next_available_at', CASE
      WHEN v_cooldown > 0 THEN now() + make_interval(secs => v_cooldown)
      ELSE NULL
    END,
    'reset_at', v_reset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_discovery_run(text, text, text, uuid) TO authenticated;
