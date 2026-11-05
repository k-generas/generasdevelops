-- Phase 1 social commerce matching.
--
-- Additive only: existing social leads and businesses are preserved. Match
-- candidates keep their evidence, signals and confidence so the owner can
-- review them before a social profile is linked to a business record.

ALTER TABLE public.social_leads
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'unknown'
    CHECK (account_type IN (
      'confirmed_business',
      'probable_business',
      'individual_seller',
      'unknown'
    )),
  ADD COLUMN IF NOT EXISTS account_type_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS match_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.social_business_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  social_lead_id uuid NOT NULL REFERENCES public.social_leads(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'possible'
    CHECK (status IN ('high_confidence', 'possible', 'conflicting', 'confirmed', 'rejected')),
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunity_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  solution_fits jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL DEFAULT '',
  review_note text,
  matched_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, social_lead_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_social_business_matches_owner_status
  ON public.social_business_matches (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_social_business_matches_lead
  ON public.social_business_matches (social_lead_id);
CREATE INDEX IF NOT EXISTS idx_social_business_matches_business
  ON public.social_business_matches (business_id);
CREATE INDEX IF NOT EXISTS idx_social_business_matches_updated
  ON public.social_business_matches (owner_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_business_matches TO authenticated;
GRANT ALL ON public.social_business_matches TO service_role;

ALTER TABLE public.social_business_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own social business matches"
  ON public.social_business_matches;
DROP POLICY IF EXISTS "Users can insert own social business matches"
  ON public.social_business_matches;
DROP POLICY IF EXISTS "Users can update own social business matches"
  ON public.social_business_matches;
DROP POLICY IF EXISTS "Users can delete own social business matches"
  ON public.social_business_matches;

CREATE POLICY "Users can view own social business matches"
  ON public.social_business_matches FOR SELECT
  USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own social business matches"
  ON public.social_business_matches FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own social business matches"
  ON public.social_business_matches FOR UPDATE
  USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own social business matches"
  ON public.social_business_matches FOR DELETE
  USING (auth.uid() = owner_id);

NOTIFY pgrst, 'reload schema';
