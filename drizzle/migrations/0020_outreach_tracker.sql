-- Business-level outreach tracking. Each scanned business remembers its own
-- outreach stage and when it was last contacted, so the owner never has to
-- re-scan to recall who was messaged, who replied, or who is negotiating.
-- Rows keep the existing owner-scoped RLS policy on public.businesses.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS outreach_stage text NOT NULL DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_note text;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_outreach_stage_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_outreach_stage_check
  CHECK (outreach_stage IN ('not_contacted', 'messaged', 'replied', 'negotiating', 'won', 'lost'));

CREATE INDEX IF NOT EXISTS businesses_owner_stage_idx
  ON public.businesses (owner_id, outreach_stage);
