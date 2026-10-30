CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  investigation_id uuid REFERENCES public.investigations(id) ON DELETE SET NULL,
  audit_id uuid REFERENCES public.business_audits(id) ON DELETE SET NULL,
  signal_id uuid REFERENCES public.opportunity_signals(id) ON DELETE SET NULL,
  leak_id uuid REFERENCES public.revenue_leaks(id) ON DELETE SET NULL,
  title text NOT NULL,
  identified_problem text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  potential_solution text NOT NULL,
  relevant_service text,
  business_impact_hypothesis text,
  confidence numeric NOT NULL DEFAULT 0.3 CHECK (confidence >= 0 AND confidence <= 1),
  urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','critical')),
  estimated_project_value numeric,
  validation_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (validation_status IN ('UNKNOWN','CONFIRMED','DENIED','PARTIAL')),
  qualification_stage text NOT NULL DEFAULT 'DISCOVERED' CHECK (qualification_stage IN ('DISCOVERED','RESEARCHING','NEEDS_VALIDATION','VALIDATION_IN_PROGRESS','QUALIFIED','READY_TO_PROPOSE','PROPOSAL_SENT','WON','LOST','DISQUALIFIED')),
  next_action text,
  assigned_owner uuid,
  validation_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualification_assessment jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON public.opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_business ON public.opportunities(business_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON public.opportunities(qualification_stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.opportunities(validation_status);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own opportunities" ON public.opportunities
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own opportunities" ON public.opportunities
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own opportunities" ON public.opportunities
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own opportunities" ON public.opportunities
  FOR DELETE USING (auth.uid() = owner_id);
