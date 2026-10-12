ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS triage_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS triage_reason text,
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz;

CREATE INDEX IF NOT EXISTS businesses_owner_geo_idx ON public.businesses(owner_id, province, district);
CREATE INDEX IF NOT EXISTS businesses_owner_industry_idx ON public.businesses(owner_id, industry);

CREATE TABLE public.business_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  field text NOT NULL,
  value jsonb NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  source_url text,
  method text NOT NULL,
  verification text NOT NULL DEFAULT 'unverified',
  confidence text NOT NULL DEFAULT 'low',
  confidence_reason text,
  excerpt text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, field, source_name, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_facts TO authenticated;
GRANT ALL ON public.business_facts TO service_role;
ALTER TABLE public.business_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own facts" ON public.business_facts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX business_facts_biz_idx ON public.business_facts(business_id, field);