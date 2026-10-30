CREATE TABLE IF NOT EXISTS public.opportunity_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text NOT NULL,
  evidence_source text NOT NULL,
  source_url text,
  published_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_verification_date timestamptz,
  confidence_level numeric NOT NULL DEFAULT 0.5 CHECK (confidence_level >= 0 AND confidence_level <= 1),
  possible_business_need text NOT NULL,
  relevant_generas_service jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_investigation text NOT NULL,
  suggested_validation_question text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','UNDER_REVIEW','CONFIRMED','NEEDS_VALIDATION','EXPIRED','DISMISSED','CONVERTED_TO_OPPORTUNITY')),
  industry text,
  location text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_signals_owner ON public.opportunity_signals(owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_signals_business ON public.opportunity_signals(business_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_signals_status ON public.opportunity_signals(status);
CREATE INDEX IF NOT EXISTS idx_opportunity_signals_category ON public.opportunity_signals(category);
CREATE INDEX IF NOT EXISTS idx_opportunity_signals_detected ON public.opportunity_signals(detected_at DESC);

ALTER TABLE public.opportunity_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own opportunity_signals" ON public.opportunity_signals
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own opportunity_signals" ON public.opportunity_signals
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own opportunity_signals" ON public.opportunity_signals
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own opportunity_signals" ON public.opportunity_signals
  FOR DELETE USING (auth.uid() = owner_id);
