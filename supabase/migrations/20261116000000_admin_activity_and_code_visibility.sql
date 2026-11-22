-- Admin visibility for access codes and per-account activity monitoring.
--
-- 1. Keep the plaintext code on access_codes so an admin can copy it again later.
--    Redemption still uses code_hash; the code column is admin-only via RLS.
-- 2. Record row-level account activity for owner-scoped tables, plus a helper
--    RPC that merges those events with login_history for the admin console.

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS code text;

COMMENT ON COLUMN public.access_codes.code IS
  'Plaintext access code for admin copy/display. Null for codes issued before this migration.';

CREATE OR REPLACE FUNCTION public.admin_issue_access_code(
  p_target_email text DEFAULT NULL::text,
  p_max_uses integer DEFAULT 1,
  p_expires_in_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_raw text;
  v_id uuid;
  v_email text;
  v_expires timestamp with time zone;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  v_raw := upper(encode(gen_random_bytes(8), 'hex'));
  v_code := 'GARE-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
  v_email := NULLIF(trim(lower(p_target_email)), '');
  v_expires := now() + make_interval(hours => GREATEST(COALESCE(p_expires_in_hours, 168), 1));

  INSERT INTO public.access_codes (code_hash, code, code_prefix, target_email, issued_by, expires_at, max_uses)
  VALUES (
    encode(digest(v_code, 'sha256'), 'hex'),
    v_code,
    substr(v_code, 1, 9),
    v_email,
    v_uid,
    v_expires,
    GREATEST(COALESCE(p_max_uses, 1), 1)
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_email, details)
  VALUES (
    v_uid,
    (SELECT up.email FROM public.user_profiles up WHERE up.id = v_uid),
    'code_issued',
    v_email,
    jsonb_build_object(
      'code_id', v_id,
      'max_uses', GREATEST(COALESCE(p_max_uses, 1), 1),
      'expires_at', v_expires
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'code', v_code,
    'expires_at', v_expires
  );
END;
$function$;

CREATE TABLE IF NOT EXISTS public.account_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  actor_id uuid,
  actor_email text,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_activity_owner_created_idx
  ON public.account_activity (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_activity_created_idx
  ON public.account_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS account_activity_actor_idx
  ON public.account_activity (actor_id, created_at DESC);

GRANT SELECT ON public.account_activity TO authenticated;
GRANT ALL ON public.account_activity TO service_role;
ALTER TABLE public.account_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view account activity" ON public.account_activity;
CREATE POLICY "Admins can view account activity"
  ON public.account_activity FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage account activity" ON public.account_activity;
CREATE POLICY "Service role can manage account activity"
  ON public.account_activity FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_account_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_owner uuid;
  v_record uuid;
  v_actor uuid := auth.uid();
  v_email text;
  v_changed jsonb := '[]'::jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_owner := OLD.owner_id;
    v_record := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_owner := NEW.owner_id;
    v_record := NEW.id;
    SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb)
      INTO v_changed
      FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
      WHERE to_jsonb(OLD) -> n.key IS DISTINCT FROM n.value;
  ELSE
    v_owner := NEW.owner_id;
    v_record := NEW.id;
  END IF;

  IF v_owner IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT email INTO v_email FROM public.user_profiles WHERE id = v_actor;
  IF v_email IS NULL THEN
    v_email := NULLIF(auth.jwt() ->> 'email', '');
  END IF;

  BEGIN
    INSERT INTO public.account_activity (
      owner_id,
      actor_id,
      actor_email,
      table_name,
      record_id,
      action,
      details
    )
    VALUES (
      v_owner,
      v_actor,
      v_email,
      TG_TABLE_NAME,
      v_record,
      lower(TG_OP),
      jsonb_build_object('changed_columns', v_changed)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Activity logging must never block the user's write.
    RAISE WARNING 'account activity logging failed for %.%: %', TG_TABLE_SCHEMA, TG_TABLE_NAME, SQLERRM;
  END;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'business_audits',
    'business_facts',
    'business_notes',
    'business_sources',
    'businesses',
    'discovery_runs',
    'expenses',
    'investigations',
    'invoices',
    'maintenance_records',
    'offer_kits',
    'offers',
    'opportunities',
    'orders',
    'outreach_campaigns',
    'partner_handoffs',
    'partners',
    'payments',
    'professional_business_links',
    'professionals',
    'proposals',
    'prospect_lists',
    'referrals',
    'revenue_leaks',
    'social_business_matches',
    'social_leads',
    'solution_prompts',
    'solution_recommendations',
    'subscriptions',
    'tasks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS account_activity_log ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER account_activity_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_account_activity()',
        t
      );
    END IF;
  END LOOP;
END;
$do$;

CREATE OR REPLACE FUNCTION public.admin_account_activity(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  WITH events AS (
    SELECT
      a.id,
      a.owner_id,
      op.email AS owner_email,
      a.actor_id,
      COALESCE(a.actor_email, ap.email) AS actor_email,
      a.table_name,
      a.record_id,
      a.action,
      a.details,
      a.created_at
    FROM public.account_activity a
    LEFT JOIN public.user_profiles op ON op.id = a.owner_id
    LEFT JOIN public.user_profiles ap ON ap.id = a.actor_id

    UNION ALL

    SELECT
      l.id,
      l.user_id AS owner_id,
      p.email AS owner_email,
      l.user_id AS actor_id,
      COALESCE(l.email, p.email) AS actor_email,
      'login_history' AS table_name,
      l.id AS record_id,
      l.event_type AS action,
      jsonb_build_object(
        'success', l.success,
        'failure_reason', l.failure_reason,
        'user_agent', l.user_agent
      ) AS details,
      l.created_at
    FROM public.login_history l
    LEFT JOIN public.user_profiles p ON p.id = l.user_id
    WHERE l.user_id IS NOT NULL
  ),
  summary AS (
    SELECT
      e.owner_id,
      MAX(e.owner_email) AS email,
      COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE e.created_at > now() - interval '24 hours')::int AS events_24h,
      MAX(e.created_at) AS last_activity_at
    FROM events e
    GROUP BY e.owner_id
  )
  SELECT jsonb_build_object(
    'ok', true,
    'rows', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
        FROM (
          SELECT * FROM events ORDER BY created_at DESC LIMIT v_limit
        ) r
      ),
      '[]'::jsonb
    ),
    'summary', COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.last_activity_at DESC)
        FROM summary s
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_account_activity(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_account_activity(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
