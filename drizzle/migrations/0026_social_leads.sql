-- Social-first lead discovery.
--
-- Stores public Instagram/Facebook profiles that look like active sellers but
-- do not have an owned online store. The Instagram adapter uses Meta's official
-- Graph API only; no scraping, fake accounts or login bypasses.

CREATE TABLE IF NOT EXISTS public.social_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  discovery_run_id uuid,
  platform text NOT NULL DEFAULT 'instagram'
    CHECK (platform IN ('instagram', 'facebook')),
  handle text NOT NULL,
  profile_url text NOT NULL,
  display_name text,
  biography text,
  category text,
  district text,
  website text,
  website_status text NOT NULL DEFAULT 'unknown'
    CHECK (website_status IN ('none', 'live', 'dead', 'link_hub', 'whatsapp', 'unknown')),
  store_status text NOT NULL DEFAULT 'unknown'
    CHECK (store_status IN ('none', 'live_store', 'link_hub', 'whatsapp_only', 'unknown')),
  followers_count integer,
  media_count integer,
  last_post_at timestamptz,
  engagement_rate numeric,
  contact_phone text,
  contact_whatsapp text,
  lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  score_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'qualified', 'dismissed', 'promoted')),
  source text NOT NULL DEFAULT 'manual_import'
    CHECK (source IN ('instagram_api', 'manual_import')),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_social_leads_owner_score
  ON public.social_leads (owner_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_social_leads_owner_status
  ON public.social_leads (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_social_leads_owner_district
  ON public.social_leads (owner_id, district);
CREATE INDEX IF NOT EXISTS idx_social_leads_owner_last_post
  ON public.social_leads (owner_id, last_post_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_leads TO authenticated;
GRANT ALL ON public.social_leads TO service_role;

ALTER TABLE public.social_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social leads" ON public.social_leads;
DROP POLICY IF EXISTS "Users can insert own social leads" ON public.social_leads;
DROP POLICY IF EXISTS "Users can update own social leads" ON public.social_leads;
DROP POLICY IF EXISTS "Users can delete own social leads" ON public.social_leads;

CREATE POLICY "Users can view own social leads" ON public.social_leads
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own social leads" ON public.social_leads
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own social leads" ON public.social_leads
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own social leads" ON public.social_leads
  FOR DELETE USING (auth.uid() = owner_id);

NOTIFY pgrst, 'reload schema';
