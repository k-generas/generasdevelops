-- GARE - apply ALL pending migrations in one pass
-- Generated from drizzle/migrations/0011..0017. Every statement is idempotent-safe
-- (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS),
-- so it is safe to run even if some of these already landed.
--
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste ALL of this -> Run.
-- Then restart your dev server.


-- ============================================================================
-- 0011_monitoring_digests.sql
-- ============================================================================

-- Automatic daily monitoring: the saved radar target and the digests it produces.
--
-- Owner-scoped like every other table. The scheduled scan runs with the service
-- role, so owner_id is set explicitly there (auth.uid() is null in a background
-- job); interactive use falls back to auth.uid() via RLS.

-- The single saved target the daily job scans (district + category).
CREATE TABLE IF NOT EXISTS public.monitoring_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  enabled boolean NOT NULL DEFAULT false,
  district text,
  category text NOT NULL DEFAULT 'all',
  industries text[] NOT NULL DEFAULT '{}'::text[],
  max_queries int NOT NULL DEFAULT 10,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_settings TO authenticated;
GRANT ALL ON public.monitoring_settings TO service_role;
ALTER TABLE public.monitoring_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own monitoring_settings" ON public.monitoring_settings;
CREATE POLICY "own monitoring_settings" ON public.monitoring_settings FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- One digest per day: what a scheduled (or manual) scan found.
CREATE TABLE IF NOT EXISTS public.daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  for_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  status text NOT NULL DEFAULT 'ok',
  district text,
  category text NOT NULL DEFAULT 'all',
  queries int NOT NULL DEFAULT 0,
  found int NOT NULL DEFAULT 0,
  added int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  failed_queries int NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  run_id uuid,
  scan_id uuid,
  new_businesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_digests TO authenticated;
GRANT ALL ON public.daily_digests TO service_role;
ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own daily_digests" ON public.daily_digests;
CREATE POLICY "own daily_digests" ON public.daily_digests FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE UNIQUE INDEX IF NOT EXISTS daily_digests_owner_date
  ON public.daily_digests (owner_id, for_date);
CREATE INDEX IF NOT EXISTS daily_digests_owner_created_idx
  ON public.daily_digests (owner_id, created_at DESC);

-- ============================================================================
-- 0012_revenue_leaks.sql
-- ============================================================================

-- Revenue Leak Detector (Feature A): reviewed, evidence-backed gaps per business.
--
-- Owner-scoped like every other table. Each row is one observed problem for one
-- business (unique per owner + dedupe_key) plus the owner's review decision, so a
-- re-scan can refresh the evidence without losing a dismiss/resolve choice.
-- A leak records a gap, never a claimed monetary loss.

CREATE TABLE IF NOT EXISTS public.revenue_leaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  problem_key text NOT NULL,
  label text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  business_relevance text,
  confidence numeric NOT NULL DEFAULT 0.5,
  source text,
  evidence_url text,
  observed_at timestamptz,
  limitation text,
  suggested_offer text,
  effort text,
  recurring boolean NOT NULL DEFAULT false,
  next_step text,
  hypothesis boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open',
  status_note text,
  reviewed_at timestamptz,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_leaks TO authenticated;
GRANT ALL ON public.revenue_leaks TO service_role;
ALTER TABLE public.revenue_leaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own revenue_leaks" ON public.revenue_leaks;
CREATE POLICY "own revenue_leaks" ON public.revenue_leaks FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS revenue_leaks_owner_dedupe
  ON public.revenue_leaks (owner_id, dedupe_key);
CREATE INDEX IF NOT EXISTS revenue_leaks_owner_status_idx
  ON public.revenue_leaks (owner_id, status, severity);
CREATE INDEX IF NOT EXISTS revenue_leaks_business_idx
  ON public.revenue_leaks (business_id);

-- Owner's saved profit/delivery assumptions (Feature F), stored as jsonb so the
-- feasibility form persists across sessions without a dedicated table.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS feasibility_defaults jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- 0013_partners.sql
-- ============================================================================

-- Agency Overflow Work Finder (Feature B): the owner's partner directory and the
-- handoffs of work they cannot deliver themselves.
--
-- Owner-scoped like every other table. Partners are entered by the owner (never
-- scraped or invented); a handoff records the offloaded opportunity and keeps the
-- partner's delivery value separate from the owner's referral/coordination fee.

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'agency',
  services text[] NOT NULL DEFAULT '{}'::text[],
  industries text[] NOT NULL DEFAULT '{}'::text[],
  districts text[] NOT NULL DEFAULT '{}'::text[],
  available_hours_per_week numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  contact_email text,
  contact_phone text,
  source text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own partners" ON public.partners;
CREATE POLICY "own partners" ON public.partners FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS partners_owner_active_idx
  ON public.partners (owner_id, active);

CREATE TABLE IF NOT EXISTS public.partner_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  leak_id uuid REFERENCES public.revenue_leaks(id) ON DELETE SET NULL,
  title text NOT NULL,
  reason text,
  service text,
  delivery_value numeric NOT NULL DEFAULT 0,
  owner_cut numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'planned',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_handoffs TO authenticated;
GRANT ALL ON public.partner_handoffs TO service_role;
ALTER TABLE public.partner_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own partner_handoffs" ON public.partner_handoffs;
CREATE POLICY "own partner_handoffs" ON public.partner_handoffs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS partner_handoffs_owner_status_idx
  ON public.partner_handoffs (owner_id, status);
CREATE INDEX IF NOT EXISTS partner_handoffs_partner_idx
  ON public.partner_handoffs (partner_id);

-- ============================================================================
-- 0014_subscriptions.sql
-- ============================================================================

-- Recurring Revenue Builder (Feature C): tracked recurring services / retainers.
--
-- Owner-scoped like every other table. A subscription links a business to a
-- recurring offer and records its lifecycle (proposed -> active -> paused/churned)
-- and monthly value. MRR is computed from active rows only; nothing is forecast.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  offer text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  monthly_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  started_at date,
  next_renewal_at date,
  canceled_at date,
  notes text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own subscriptions" ON public.subscriptions;
CREATE POLICY "own subscriptions" ON public.subscriptions FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS subscriptions_owner_status_idx
  ON public.subscriptions (owner_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx
  ON public.subscriptions (business_id);

-- ============================================================================
-- 0015_offer_kits.sql
-- ============================================================================

-- Repeatable Offer Factory (Feature E): productised delivery kits / scoping presets
-- attached to an offer name. Owner-scoped like every other table. A kit is a
-- reusable starting point the owner edits; nothing here prices or promises work.
CREATE TABLE IF NOT EXISTS public.offer_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  offer text NOT NULL,
  scope_includes text[] NOT NULL DEFAULT '{}',
  scope_excludes text[] NOT NULL DEFAULT '{}',
  deliverables text[] NOT NULL DEFAULT '{}',
  timeline_days integer,
  revisions integer,
  deposit_percent numeric,
  recurring boolean NOT NULL DEFAULT false,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, offer)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_kits TO authenticated;
GRANT ALL ON public.offer_kits TO service_role;
ALTER TABLE public.offer_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own offer kits" ON public.offer_kits;
CREATE POLICY "own offer kits" ON public.offer_kits FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS offer_kits_owner_idx ON public.offer_kits (owner_id);

-- ============================================================================
-- 0016_referrals.sql
-- ============================================================================

-- Referral & partnership intelligence (Feature H): the referral ledger.
-- Owner-scoped like every other table. A referral is a recorded introduction;
-- reward_value is what the owner agreed, never a computed payout.
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  referrer_name text NOT NULL,
  referrer_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  referred_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  referred_name text,
  status text NOT NULL DEFAULT 'invited',
  reward_type text NOT NULL DEFAULT 'none',
  reward_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own referrals" ON public.referrals;
CREATE POLICY "own referrals" ON public.referrals FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS referrals_owner_status_idx ON public.referrals (owner_id, status);

-- ============================================================================
-- 0017_early_access.sql
-- ============================================================================

-- Early access approval: user_profiles.access_status gates the app. New signups
-- start pending; an administrator approves via the service role / dashboard.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_status') THEN
    CREATE TYPE public.access_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_code_status') THEN
    CREATE TYPE public.access_code_status AS ENUM ('active', 'used', 'expired', 'revoked');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN
    CREATE TYPE public.audit_action AS ENUM ('user_registered','user_approved','user_rejected','user_suspended','user_restored','code_issued','code_revoked','code_redeemed','login_success','login_failure','logout','role_changed');
  END IF;
END $$;

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

UPDATE public.user_profiles SET is_admin = true WHERE email IN ('generaskagiraneza9@gmail.com', 'generaskagiraneza@gmail.com') AND (is_admin IS NULL OR is_admin = false);

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
