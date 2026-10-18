-- Early Access Approval and Admin Monitoring
-- Tables for user profiles with access control, login history, audit logs, and access codes

-- Create enum for access status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_status') THEN
    CREATE TYPE public.access_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
  END IF;
END $$;

-- Create enum for access code status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_code_status') THEN
    CREATE TYPE public.access_code_status AS ENUM ('active', 'used', 'expired', 'revoked');
  END IF;
END $$;


-- Create enum for audit action types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN
    CREATE TYPE public.audit_action AS ENUM ('user_registered','user_approved','user_rejected','user_suspended','user_restored','code_issued','code_revoked','code_redeemed','login_success','login_failure','logout','role_changed');
  END IF;
END $$;

-- User profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  access_status public.access_status NOT NULL DEFAULT 'pending',
  is_admin boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejected_at timestamptz,
  suspended_at timestamptz,
  suspended_by uuid REFERENCES auth.users(id),
  notes text,
  last_login_at timestamptz,
  login_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
 );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.user_profiles;
CREATE POLICY "Service role can manage profiles" ON public.user_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles" ON public.user_profiles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true));
DROP POLICY IF EXISTS "Admins can update profiles" ON public.user_profiles;
CREATE POLICY "Admins can update profiles" ON public.user_profiles FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_access_status ON public.user_profiles(access_status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON public.user_profiles(is_admin);


-- Login history
CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  event_type text NOT NULL,
  success boolean NOT NULL,
  failure_reason text,
  ip_address text,
  user_agent text,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
 );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_history TO authenticated;
GRANT ALL ON public.login_history TO service_role;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own login history" ON public.login_history;
CREATE POLICY "Users can view own login history" ON public.login_history FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can view all login history" ON public.login_history;
CREATE POLICY "Admins can view all login history" ON public.login_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true));
DROP POLICY IF EXISTS "Service role can manage login history" ON public.login_history;
CREATE POLICY "Service role can manage login history" ON public.login_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id_created_at ON public.login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON public.login_history(created_at DESC);


-- Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action public.audit_action NOT NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_email text,
  details jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
 );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true));
DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.audit_logs;
CREATE POLICY "Service role can manage audit logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);


-- Access codes
CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  code_prefix text,
  target_email text,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by uuid REFERENCES auth.users(id) NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  used_count int NOT NULL DEFAULT 0,
  status public.access_code_status NOT NULL DEFAULT 'active',
  notes text,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
 );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_codes TO authenticated;
GRANT ALL ON public.access_codes TO service_role;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage access codes" ON public.access_codes;
CREATE POLICY "Admins can manage access codes" ON public.access_codes FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true)) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_admin = true));
DROP POLICY IF EXISTS "Service role can manage access codes" ON public.access_codes;
CREATE POLICY "Service role can manage access codes" ON public.access_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_access_codes_target_email ON public.access_codes(target_email);
CREATE INDEX IF NOT EXISTS idx_access_codes_status ON public.access_codes(status);
CREATE INDEX IF NOT EXISTS idx_access_codes_expires_at ON public.access_codes(expires_at);


-- Ensure admins exist for specified emails
-- Do NOT grant via browser - this is a backfill for trusted admins
UPDATE public.user_profiles SET is_admin = true WHERE email IN ('generaskagiraneza9@gmail.com', 'generaskagiraneza@gmail.com') AND (is_admin IS NULL OR is_admin = false);


-- New signups start pending until an administrator approves them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, access_status)
  VALUES (NEW.id, COALESCE(NEW.email, ''), 'pending')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grandfather accounts that existed before approval was introduced so the
-- current owner keeps access. Only runs against a freshly created table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles) THEN
    INSERT INTO public.user_profiles (id, email, access_status)
    SELECT u.id, u.email, 'approved'
    FROM auth.users u
    WHERE u.email IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
