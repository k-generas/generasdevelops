CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT up.is_admin FROM public.user_profiles up WHERE up.id = auth.uid()), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can update profiles" ON public.user_profiles;
CREATE POLICY "Admins can update profiles" ON public.user_profiles
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can view all login history" ON public.login_history;
CREATE POLICY "Admins can view all login history" ON public.login_history
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage access codes" ON public.access_codes;
CREATE POLICY "Admins can manage access codes" ON public.access_codes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.access_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.access_code_attempts TO authenticated;
GRANT ALL ON public.access_code_attempts TO service_role;
ALTER TABLE public.access_code_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own code attempts" ON public.access_code_attempts;
CREATE POLICY "Users can view own code attempts" ON public.access_code_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role can manage code attempts" ON public.access_code_attempts;
CREATE POLICY "Service role can manage code attempts" ON public.access_code_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_access_code_attempts_user_created
  ON public.access_code_attempts(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_login_event(
  p_event_type text,
  p_success boolean,
  p_failure_reason text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.login_history (user_id, email, event_type, success, failure_reason, user_agent)
  SELECT v_uid, u.email, COALESCE(NULLIF(trim(p_event_type), ''), 'sign_in'), p_success, p_failure_reason, p_user_agent
  FROM auth.users u WHERE u.id = v_uid;
  IF p_success THEN
    UPDATE public.user_profiles
    SET last_login_at = now(), login_count = login_count + 1, updated_at = now()
    WHERE id = v_uid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_login_event(text, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_access_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_hash text;
  v_code public.access_codes%ROWTYPE;
  v_recent int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_code');
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.access_code_attempts a
  WHERE a.user_id = v_uid AND a.success = false AND a.created_at > now() - interval '10 minutes';
  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  v_hash := encode(digest(trim(p_code), 'sha256'), 'hex');
  SELECT * INTO v_code FROM public.access_codes c WHERE c.code_hash = v_hash FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;

  IF v_code.status <> 'active' THEN
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_' || v_code.status);
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    UPDATE public.access_codes SET status = 'expired', updated_at = now() WHERE id = v_code.id;
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;
  IF v_code.used_count >= v_code.max_uses THEN
    UPDATE public.access_codes SET status = 'used', updated_at = now() WHERE id = v_code.id;
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_exhausted');
  END IF;
  IF v_code.target_email IS NOT NULL AND lower(v_code.target_email) <> lower(COALESCE(v_email, '')) THEN
    INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, false);
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_assigned');
  END IF;

  UPDATE public.access_codes
  SET used_count = used_count + 1,
      status = CASE WHEN used_count + 1 >= max_uses THEN 'used'::public.access_code_status ELSE status END,
      redeemed_at = now(),
      redeemed_by = v_uid,
      updated_at = now()
  WHERE id = v_code.id;

  UPDATE public.user_profiles
  SET access_status = 'approved',
      approved_at = now(),
      approved_by = v_code.issued_by,
      notes = NULL,
      updated_at = now()
  WHERE id = v_uid;

  INSERT INTO public.access_code_attempts (user_id, success) VALUES (v_uid, true);
  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_id, target_user_email, details)
  VALUES (v_uid, v_email, 'code_redeemed', v_uid, v_email, jsonb_build_object('code_id', v_code.id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_access_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_issue_access_code(
  p_target_email text DEFAULT NULL,
  p_max_uses int DEFAULT 1,
  p_expires_in_hours int DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

  INSERT INTO public.access_codes (code_hash, code_prefix, target_email, issued_by, expires_at, max_uses)
  VALUES (encode(digest(v_code, 'sha256'), 'hex'), substr(v_code, 1, 9), v_email, v_uid, v_expires, GREATEST(COALESCE(p_max_uses, 1), 1))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_email, details)
  VALUES (v_uid, (SELECT up.email FROM public.user_profiles up WHERE up.id = v_uid), 'code_issued', v_email, jsonb_build_object('code_id', v_id, 'max_uses', GREATEST(COALESCE(p_max_uses, 1), 1), 'expires_at', v_expires));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'expires_at', v_expires);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_issue_access_code(text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_access_code(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  UPDATE public.access_codes SET status = 'revoked', updated_at = now() WHERE id = p_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_revocable');
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, details)
  VALUES (v_uid, (SELECT up.email FROM public.user_profiles up WHERE up.id = v_uid), 'code_revoked', jsonb_build_object('code_id', p_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_access_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_access_status(
  p_user_id uuid,
  p_status public.access_status,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin_target boolean;
  v_target_email text;
  v_action public.audit_action;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF p_user_id = v_uid AND p_status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_self');
  END IF;

  SELECT up.is_admin, up.email INTO v_is_admin_target, v_target_email
  FROM public.user_profiles up WHERE up.id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_is_admin_target AND p_status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_admin');
  END IF;

  v_action := CASE p_status
    WHEN 'approved' THEN 'user_approved'
    WHEN 'rejected' THEN 'user_rejected'
    WHEN 'suspended' THEN 'user_suspended'
    ELSE 'user_restored'
  END::public.audit_action;

  UPDATE public.user_profiles
  SET access_status = p_status,
      approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN p_status = 'approved' THEN v_uid ELSE approved_by END,
      rejected_at = CASE WHEN p_status = 'rejected' THEN now() ELSE rejected_at END,
      suspended_at = CASE WHEN p_status = 'suspended' THEN now() ELSE suspended_at END,
      suspended_by = CASE WHEN p_status = 'suspended' THEN v_uid ELSE suspended_by END,
      notes = p_note,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_user_id, target_user_email, details)
  VALUES (v_uid, (SELECT up.email FROM public.user_profiles up WHERE up.id = v_uid), v_action, p_user_id, v_target_email, jsonb_build_object('status', p_status, 'note', p_note));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_access_status(uuid, public.access_status, text) TO authenticated;
