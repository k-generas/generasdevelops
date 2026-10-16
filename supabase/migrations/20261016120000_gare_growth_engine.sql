-- GARE - apply ALL pending migrations in one pass
-- Generated from drizzle/migrations/0011..0016. Every statement is idempotent-safe
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
