-- GARE - FULL migration bundle for a FRESH Supabase project
-- Concatenates drizzle/migrations/0000..0016 in order.
-- Run once in a brand-new project: Supabase -> SQL Editor -> New query -> paste ALL -> Run.
-- NOTE: 0000-0010 use CREATE TABLE without IF NOT EXISTS (meant for a fresh DB).
-- If any line errors 'already exists', that object is already created - safe to ignore.

-- ============================================================================
-- 0000_discovery_engine.sql
-- ============================================================================
CREATE TABLE public.discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  query text NOT NULL,
  location text,
  results_count int NOT NULL DEFAULT 0,
  new_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_runs TO authenticated;
GRANT ALL ON public.discovery_runs TO service_role;
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.discovery_runs FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  place_id text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  website text,
  maps_url text,
  category text,
  rating numeric,
  review_count int,
  business_status text,
  latitude double precision,
  longitude double precision,
  source text NOT NULL DEFAULT 'google_places',
  discovery_run_id uuid,
  status text NOT NULL DEFAULT 'discovered',
  score int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, place_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own businesses" ON public.businesses FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  website_reachable boolean,
  website_status int,
  website_https boolean,
  website_load_ms int,
  website_title text,
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb,
  score int,
  recommended_offer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own investigations" ON public.investigations FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.investigations (business_id, created_at DESC);

-- ============================================================================
-- 0001_memory_proposals_tasks.sql
-- ============================================================================
ALTER TABLE public.discovery_runs
  ADD COLUMN title text,
  ADD COLUMN archived boolean NOT NULL DEFAULT false,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN rerun_of uuid;

ALTER TABLE public.businesses
  ADD COLUMN emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN visibility_score int,
  ADD COLUMN last_investigated_at timestamptz,
  ADD COLUMN last_opened_at timestamptz;

CREATE TABLE public.search_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  run_id uuid NOT NULL REFERENCES public.discovery_runs(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  was_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, business_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_run_results TO authenticated;
GRANT ALL ON public.search_run_results TO service_role;
ALTER TABLE public.search_run_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own srr" ON public.search_run_results FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- backfill links for old runs
INSERT INTO public.search_run_results (owner_id, run_id, business_id, was_new)
SELECT owner_id, discovery_run_id, id, true FROM public.businesses WHERE discovery_run_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE public.business_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  summary text NOT NULL,
  ref_table text,
  ref_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_activity_events TO authenticated;
GRANT ALL ON public.business_activity_events TO service_role;
ALTER TABLE public.business_activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.business_activity_events FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.business_activity_events (business_id, created_at DESC);
CREATE INDEX ON public.business_activity_events (owner_id, created_at DESC);

CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  investigation_id uuid REFERENCES public.investigations(id) ON DELETE SET NULL,
  mode text NOT NULL,
  offer text,
  channel text,
  language text NOT NULL DEFAULT 'English',
  tone text,
  price numeric,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'DRAFT',
  title text,
  body text NOT NULL DEFAULT '',
  why jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_version int NOT NULL DEFAULT 1,
  sent_at timestamptz,
  sent_channel text,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own proposals" ON public.proposals FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.proposals (business_id);

CREATE TABLE public.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version int NOT NULL,
  body text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_versions TO authenticated;
GRANT ALL ON public.proposal_versions TO service_role;
ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pv" ON public.proposal_versions FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'manual',
  dedupe_key text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks" ON public.tasks FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE UNIQUE INDEX tasks_open_dedupe ON public.tasks (owner_id, dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL;

CREATE TABLE public.business_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_notes TO authenticated;
GRANT ALL ON public.business_notes TO service_role;
ALTER TABLE public.business_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON public.business_notes FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.user_preferences (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  last_visit_at timestamptz,
  previous_visit_at timestamptz,
  min_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.user_preferences FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- 0002_website_verification.sql
-- ============================================================================
ALTER TABLE public.businesses
  ADD COLUMN website_source text,
  ADD COLUMN website_checked_at timestamptz,
  ADD COLUMN website_check jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.businesses SET website_source = 'google_places' WHERE website IS NOT NULL AND website_source IS NULL;

-- ============================================================================
-- 0003_business_activity_signals.sql
-- ============================================================================
-- Activity / closure signals captured from Google Places so closed or
-- recently-gone-quiet businesses can be flagged instead of being pitched.
ALTER TABLE public.businesses
  ADD COLUMN activity_checked_at timestamptz,
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN open_now boolean,
  ADD COLUMN opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN recent_reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN reviews_last_90d int;


-- ============================================================================
-- 0004_offers_catalog.sql
-- ============================================================================
-- Owner-editable offer catalog. Replaces the hard-coded OFFER_LIST so the owner
-- can rename offers, set default prices, keep deliverable templates and notes.
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  default_price numeric,
  currency text NOT NULL DEFAULT 'USD',
  deliverables text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own offers" ON public.offers FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.offers (owner_id, position);


-- ============================================================================
-- 0005_invoices.sql
-- ============================================================================
-- Invoicing-lite. No payment provider: an invoice records intent and is marked
-- paid/unpaid by hand. Owner-scoped like every other table.
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  number text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own invoices" ON public.invoices FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.invoices (owner_id, created_at DESC);


-- ============================================================================
-- 0006_orders_delivery.sql
-- ============================================================================
-- P3: Orders + delivery checklist. Owner-scoped; links to proposal/business/invoice.
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  number text NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'USD',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT',
  due_at timestamptz,
  fulfilled_at timestamptz,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders" ON public.orders FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.orders (owner_id, created_at DESC);
CREATE INDEX ON public.orders (business_id);
CREATE INDEX ON public.orders (status);


-- ============================================================================
-- 0007_business_validation_plan.sql
-- ============================================================================
-- P2/P1: owner validation plan stored on a business (opportunity). Nullable so
-- existing rows stay valid. Powers the low-cost validation planner.
ALTER TABLE public.businesses ADD COLUMN validation_plan jsonb;


-- ============================================================================
-- 0008_rwanda_intelligence.sql
-- ============================================================================
-- Rwanda business intelligence: extend the canonical business record and add
-- provenance / monitoring tables. Additive only: every new column is nullable or
-- defaulted so existing rows and existing app code keep working unchanged.
--
-- Design rules encoded here:
--   * One company database: these columns extend `public.businesses`, they do
--     not create a second company table.
--   * Facts keep provenance: `business_facts` stores one row per (field, source)
--     so conflicting values are preserved instead of overwritten.
--   * Monitoring is change-aware: `company_events` is idempotent via dedupe_key.
--   * Everything is owner-scoped with owner_id = auth.uid() like every other table.

-- 1) Comprehensive profile fields on the existing business record -------------
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trading_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS registration_id text,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS registration_date date,
  ADD COLUMN IF NOT EXISTS legal_structure text,
  ADD COLUMN IF NOT EXISTS parent_organization text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS cell text,
  ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS industry_secondary text,
  ADD COLUMN IF NOT EXISTS products_services text,
  ADD COLUMN IF NOT EXISTS target_customers text,
  ADD COLUMN IF NOT EXISTS business_model text,
  ADD COLUMN IF NOT EXISTS supply_chain_role text,
  ADD COLUMN IF NOT EXISTS markets_served text,
  ADD COLUMN IF NOT EXISTS exports boolean,
  ADD COLUMN IF NOT EXISTS employees_min int,
  ADD COLUMN IF NOT EXISTS employees_max int,
  ADD COLUMN IF NOT EXISTS employee_count_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS founded_date date,
  ADD COLUMN IF NOT EXISTS founded_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS contact_page text,
  ADD COLUMN IF NOT EXISTS preferred_channel text,
  ADD COLUMN IF NOT EXISTS contact_suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppression_reason text,
  ADD COLUMN IF NOT EXISTS profile_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS profile_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS intel_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS businesses_location_idx
  ON public.businesses (owner_id, province, district);
CREATE INDEX IF NOT EXISTS businesses_industry_idx
  ON public.businesses (owner_id, industry);

-- 2) Provenance: which sources contributed to a business ----------------------
CREATE TABLE IF NOT EXISTS public.business_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'directory',
  method text NOT NULL DEFAULT 'manual',
  url text,
  excerpt text,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'unverified',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_sources TO authenticated;
GRANT ALL ON public.business_sources TO service_role;
ALTER TABLE public.business_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own business_sources" ON public.business_sources FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS business_sources_business_idx
  ON public.business_sources (business_id);

-- 3) Provenance: one row per field value so conflicts are preserved -----------
CREATE TABLE IF NOT EXISTS public.business_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  field text NOT NULL,
  value jsonb,
  source_id text,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'directory',
  method text NOT NULL DEFAULT 'manual',
  url text,
  excerpt text,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'unverified',
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_facts TO authenticated;
GRANT ALL ON public.business_facts TO service_role;
ALTER TABLE public.business_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own business_facts" ON public.business_facts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS business_facts_field_idx
  ON public.business_facts (business_id, field);

-- 4) Company activity / hiring monitoring (idempotent) ------------------------
CREATE TABLE IF NOT EXISTS public.company_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_kind text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'unverified',
  source_id text,
  source_url text,
  source_date timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_events TO authenticated;
GRANT ALL ON public.company_events TO service_role;
ALTER TABLE public.company_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own company_events" ON public.company_events FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS company_events_business_idx
  ON public.company_events (business_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS company_events_dedupe
  ON public.company_events (owner_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 5) Durable scan bookkeeping for coverage / health / cost --------------------
CREATE TABLE IF NOT EXISTS public.source_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  items_found int NOT NULL DEFAULT 0,
  new_items int NOT NULL DEFAULT 0,
  error text,
  cost_usd numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_scans TO authenticated;
GRANT ALL ON public.source_scans TO service_role;
ALTER TABLE public.source_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own source_scans" ON public.source_scans FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS source_scans_source_idx
  ON public.source_scans (owner_id, source_id, created_at DESC);


-- ============================================================================
-- 0009_rwanda_intelligence.sql
-- ============================================================================
-- Rwanda business intelligence: extend the canonical business record and add
-- provenance / monitoring tables. Additive only: every new column is nullable or
-- defaulted so existing rows and existing app code keep working unchanged.
--
-- Design rules encoded here:
--   * One company database: these columns extend `public.businesses`, they do
--     not create a second company table.
--   * Facts keep provenance: `business_facts` stores one row per (field, source)
--     so conflicting values are preserved instead of overwritten.
--   * Monitoring is change-aware: `company_events` is idempotent via dedupe_key.
--   * Everything is owner-scoped with owner_id = auth.uid() like every other table.

-- 1) Comprehensive profile fields on the existing business record -------------
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trading_names text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS registration_id text,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS registration_date date,
  ADD COLUMN IF NOT EXISTS legal_structure text,
  ADD COLUMN IF NOT EXISTS parent_organization text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS cell text,
  ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS industry_secondary text,
  ADD COLUMN IF NOT EXISTS products_services text,
  ADD COLUMN IF NOT EXISTS target_customers text,
  ADD COLUMN IF NOT EXISTS business_model text,
  ADD COLUMN IF NOT EXISTS supply_chain_role text,
  ADD COLUMN IF NOT EXISTS markets_served text,
  ADD COLUMN IF NOT EXISTS exports boolean,
  ADD COLUMN IF NOT EXISTS employees_min int,
  ADD COLUMN IF NOT EXISTS employees_max int,
  ADD COLUMN IF NOT EXISTS employee_count_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS founded_date date,
  ADD COLUMN IF NOT EXISTS founded_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS contact_page text,
  ADD COLUMN IF NOT EXISTS preferred_channel text,
  ADD COLUMN IF NOT EXISTS contact_suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppression_reason text,
  ADD COLUMN IF NOT EXISTS profile_confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS profile_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS intel_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS businesses_location_idx
  ON public.businesses (owner_id, province, district);
CREATE INDEX IF NOT EXISTS businesses_industry_idx
  ON public.businesses (owner_id, industry);

-- 2) Provenance: which sources contributed to a business ----------------------
CREATE TABLE IF NOT EXISTS public.business_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'directory',
  method text NOT NULL DEFAULT 'manual',
  url text,
  excerpt text,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'unverified',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_sources TO authenticated;
GRANT ALL ON public.business_sources TO service_role;
ALTER TABLE public.business_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own business_sources" ON public.business_sources FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS business_sources_business_idx
  ON public.business_sources (business_id);

-- 3) Provenance: one row per field value so conflicts are preserved -----------
CREATE TABLE IF NOT EXISTS public.business_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  field text NOT NULL,
  value jsonb,
  source_id text,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'directory',
  method text NOT NULL DEFAULT 'manual',
  url text,
  excerpt text,
  confidence numeric NOT NULL DEFAULT 0.5,
  status text NOT NULL DEFAULT 'unverified',
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_facts TO authenticated;
GRANT ALL ON public.business_facts TO service_role;
ALTER TABLE public.business_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own business_facts" ON public.business_facts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS business_facts_field_idx
  ON public.business_facts (business_id, field);

-- 4) Company activity / hiring monitoring (idempotent) ------------------------
CREATE TABLE IF NOT EXISTS public.company_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_kind text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'unverified',
  source_id text,
  source_url text,
  source_date timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_events TO authenticated;
GRANT ALL ON public.company_events TO service_role;
ALTER TABLE public.company_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own company_events" ON public.company_events FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS company_events_business_idx
  ON public.company_events (business_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS company_events_dedupe
  ON public.company_events (owner_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- 5) Durable scan bookkeeping for coverage / health / cost --------------------
CREATE TABLE IF NOT EXISTS public.source_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  source_id text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  items_found int NOT NULL DEFAULT 0,
  new_items int NOT NULL DEFAULT 0,
  error text,
  cost_usd numeric NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_scans TO authenticated;
GRANT ALL ON public.source_scans TO service_role;
ALTER TABLE public.source_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own source_scans" ON public.source_scans FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS source_scans_source_idx
  ON public.source_scans (owner_id, source_id, created_at DESC);

-- ============================================================================
-- 0010_business_facts_align.sql
-- ============================================================================
ALTER TABLE public.business_facts
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now();

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

