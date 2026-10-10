ALTER TABLE public.discovery_runs
  ADD COLUMN title text,
  ADD COLUMN archived boolean NOT NULL DEFAULT false,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN rerun_of uuid;

ALTER TABLE public.businesses
  ADD COLUMN emails text[] NOT NULL DEFAULT '{}',
  ADD COLUMN socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN visibility_score int,
  ADD COLUMN last_investigated_at timestamptz,
  ADD COLUMN last_opened_at timestamptz;

CREATE TABLE public.search_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  run_id uuid NOT NULL REFERENCES public.discovery_runs(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  was_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, business_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_run_results TO authenticated;
GRANT ALL ON public.search_run_results TO service_role;
ALTER TABLE public.search_run_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own srr" ON public.search_run_results FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- backfill links for old runs
INSERT INTO public.search_run_results (owner_id, run_id, business_id, was_new)
SELECT owner_id, discovery_run_id, id, true FROM public.businesses WHERE discovery_run_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE public.business_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  summary text NOT NULL,
  ref_table text,
  ref_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_activity_events TO authenticated;
GRANT ALL ON public.business_activity_events TO service_role;
ALTER TABLE public.business_activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.business_activity_events FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.business_activity_events (business_id, created_at DESC);
CREATE INDEX ON public.business_activity_events (owner_id, created_at DESC);

CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  investigation_id uuid REFERENCES public.investigations(id) ON DELETE SET NULL,
  mode text NOT NULL,
  offer text,
  channel text,
  language text NOT NULL DEFAULT 'English',
  tone text,
  price numeric,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'DRAFT',
  title text,
  body text NOT NULL DEFAULT '',
  why jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_version int NOT NULL DEFAULT 1,
  sent_at timestamptz,
  sent_channel text,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own proposals" ON public.proposals FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX ON public.proposals (business_id);

CREATE TABLE public.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version int NOT NULL,
  body text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_versions TO authenticated;
GRANT ALL ON public.proposal_versions TO service_role;
ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pv" ON public.proposal_versions FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'manual',
  dedupe_key text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks" ON public.tasks FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE UNIQUE INDEX tasks_open_dedupe ON public.tasks (owner_id, dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL;

CREATE TABLE public.business_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_notes TO authenticated;
GRANT ALL ON public.business_notes TO service_role;
ALTER TABLE public.business_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON public.business_notes FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.user_preferences (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  last_visit_at timestamptz,
  previous_visit_at timestamptz,
  min_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.user_preferences FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());