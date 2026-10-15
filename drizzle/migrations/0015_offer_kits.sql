-- Repeatable Offer Factory (Feature E): productised delivery kits / scoping presets
-- attached to an offer name. Owner-scoped like every other table. A kit is a
-- reusable starting point the owner edits; nothing here prices or promises work.
CREATE TABLE IF NOT EXISTS public.offer_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  offer text NOT NULL,
  scope_includes text[] NOT NULL DEFAULT '{}',
  scope_excludes text[] NOT NULL DEFAULT '{}',
  deliverables text[] NOT NULL DEFAULT '{}',
  timeline_days integer,
  revisions integer,
  deposit_percent numeric,
  recurring boolean NOT NULL DEFAULT false,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, offer)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_kits TO authenticated;
GRANT ALL ON public.offer_kits TO service_role;
ALTER TABLE public.offer_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own offer kits" ON public.offer_kits;
CREATE POLICY "own offer kits" ON public.offer_kits FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS offer_kits_owner_idx ON public.offer_kits (owner_id);
