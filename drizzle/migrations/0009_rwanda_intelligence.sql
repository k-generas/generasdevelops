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