-- Business Digital Audit (evidence-based). Every row owner-scoped via RLS.
-- No fabricated findings; statuses/severities per spec; partial results allowed.
CREATE TABLE IF NOT EXISTS public.business_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  findings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_log_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_0_100 integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_audits TO authenticated;
GRANT ALL ON public.business_audits TO service_role;

ALTER TABLE public.business_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own business_audits" ON public.business_audits;
CREATE POLICY "own business_audits" ON public.business_audits FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS business_audits_owner_business_idx ON public.business_audits (owner_id, business_id, created_at DESC);
