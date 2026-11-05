-- Phase 7 solution builder (Drizzle migration parity with Supabase).

CREATE TABLE public.solution_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  investigation_id uuid REFERENCES public.investigations(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  audit_id uuid REFERENCES public.business_audits(id) ON DELETE SET NULL,
  solution_type text NOT NULL CHECK (solution_type IN (
    'website_new', 'ordering_ecommerce', 'booking_appointments', 'website_repair',
    'maintenance', 'custom_system', 'automation', 'other'
  )),
  title text NOT NULL,
  summary text NOT NULL,
  why_recommended text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  hypothesis boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  unknowns jsonb NOT NULL DEFAULT '[]'::jsonb,
  maintenance_required boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'investigation'
    CHECK (source IN ('investigation', 'audit', 'opportunity', 'manual')),
  status text NOT NULL DEFAULT 'recommended'
    CHECK (status IN ('recommended', 'accepted', 'dismissed')),
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_solution_recommendations_owner_dedupe
  ON public.solution_recommendations (owner_id, business_id, dedupe_key);
CREATE INDEX idx_solution_recommendations_business
  ON public.solution_recommendations (owner_id, business_id, created_at DESC);
CREATE INDEX idx_solution_recommendations_investigation
  ON public.solution_recommendations (investigation_id);

REVOKE ALL ON public.solution_recommendations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solution_recommendations TO authenticated;
GRANT ALL ON public.solution_recommendations TO service_role;
ALTER TABLE public.solution_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own solution_recommendations" ON public.solution_recommendations FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.solution_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES public.solution_recommendations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN (
    'opencode', 'lovable', 'google_ai_studio', 'developer_spec'
  )),
  prompt text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed')),
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text,
  model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recommendation_id, platform, version)
);

CREATE INDEX idx_solution_prompts_recommendation
  ON public.solution_prompts (owner_id, recommendation_id, created_at DESC);
CREATE INDEX idx_solution_prompts_ready
  ON public.solution_prompts (recommendation_id, platform, version DESC)
  WHERE status = 'ready';

REVOKE ALL ON public.solution_prompts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solution_prompts TO authenticated;
GRANT ALL ON public.solution_prompts TO service_role;
ALTER TABLE public.solution_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own solution_prompts" ON public.solution_prompts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES public.solution_recommendations(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'recommended' CHECK (status IN (
    'recommended', 'accepted', 'scheduled', 'in_progress', 'completed', 'cancelled'
  )),
  cadence text,
  next_due_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  source text NOT NULL DEFAULT 'solution_builder'
    CHECK (source IN ('solution_builder', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_records_owner_status
  ON public.maintenance_records (owner_id, status, created_at DESC);
CREATE INDEX idx_maintenance_records_business
  ON public.maintenance_records (business_id, created_at DESC);
CREATE INDEX idx_maintenance_records_recommendation
  ON public.maintenance_records (recommendation_id);
CREATE UNIQUE INDEX uq_maintenance_records_active_recommendation
  ON public.maintenance_records (recommendation_id)
  WHERE recommendation_id IS NOT NULL AND status <> 'cancelled';

REVOKE ALL ON public.maintenance_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_records TO authenticated;
GRANT ALL ON public.maintenance_records TO service_role;
ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own maintenance_records" ON public.maintenance_records FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

NOTIFY pgrst, 'reload schema';
