-- Reusable prospect segments. A list stores live filters, not frozen members,
-- so counts stay current and campaign queues still run every compliance check.

CREATE TABLE IF NOT EXISTS public.prospect_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  entity_kind text NOT NULL DEFAULT 'business' CHECK (entity_kind IN (
    'business', 'professional'
  )),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(filters) = 'object'),
  filter_version integer NOT NULL DEFAULT 1 CHECK (filter_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_lists_owner_updated
  ON public.prospect_lists (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_lists_owner_kind
  ON public.prospect_lists (owner_id, entity_kind, updated_at DESC);

REVOKE ALL ON public.prospect_lists FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_lists TO authenticated;
GRANT ALL ON public.prospect_lists TO service_role;
ALTER TABLE public.prospect_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own prospect_lists" ON public.prospect_lists;
CREATE POLICY "own prospect_lists" ON public.prospect_lists FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

NOTIFY pgrst, 'reload schema';
