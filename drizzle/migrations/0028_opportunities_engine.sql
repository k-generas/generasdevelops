-- Phase 2-6 opportunities engine.
--
-- Additive only. Existing opportunities keep their qualification stage, owner
-- decisions and notes. New evidence refreshes scores and gaps without replacing
-- the owner's workflow state.

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('social_match', 'business_audit', 'manual', 'signal')),
  ADD COLUMN IF NOT EXISTS source_status text
    CHECK (source_status IS NULL OR source_status IN (
      'confirmed', 'high_confidence', 'possible', 'conflicting', 'manual'
    )),
  ADD COLUMN IF NOT EXISTS source_confidence numeric
    CHECK (source_confidence IS NULL OR (source_confidence >= 0 AND source_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS social_lead_id uuid REFERENCES public.social_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_match_id uuid REFERENCES public.social_business_matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0
    CHECK (score >= 0 AND score <= 100),
  ADD COLUMN IF NOT EXISTS score_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS solution_fits jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS solution_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_effort text
    CHECK (estimated_effort IS NULL OR estimated_effort IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outreach_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_count integer NOT NULL DEFAULT 0
    CHECK (outreach_count >= 0),
  ADD COLUMN IF NOT EXISTS owner_notes text,
  ADD COLUMN IF NOT EXISTS dismissed_reason text,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_owner_dedupe
  ON public.opportunities (owner_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_owner_score
  ON public.opportunities (owner_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_priority
  ON public.opportunities (owner_id, priority);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_source
  ON public.opportunities (owner_id, source);
CREATE INDEX IF NOT EXISTS idx_opportunities_social_lead
  ON public.opportunities (social_lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_opportunity
  ON public.proposals (opportunity_id);

NOTIFY pgrst, 'reload schema';
