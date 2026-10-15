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
