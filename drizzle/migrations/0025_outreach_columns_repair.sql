-- Repair the outreach columns on public.businesses.
--
-- 0020_outreach_tracker is journaled before 0021_payments_expenses, but the
-- hosted database recorded 0021 first. Drizzle only applies journal entries
-- newer than the last applied migration, so 0020 is skipped forever. This
-- forward-only, idempotent migration re-adds the columns and constraint.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS outreach_stage text DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_note text;

UPDATE public.businesses
SET outreach_stage = 'not_contacted'
WHERE outreach_stage IS NULL;

ALTER TABLE public.businesses
  ALTER COLUMN outreach_stage SET DEFAULT 'not_contacted';

ALTER TABLE public.businesses
  ALTER COLUMN outreach_stage SET NOT NULL;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_outreach_stage_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_outreach_stage_check
  CHECK (outreach_stage IN ('not_contacted', 'messaged', 'replied', 'negotiating', 'won', 'lost'));

CREATE INDEX IF NOT EXISTS businesses_owner_stage_idx
  ON public.businesses (owner_id, outreach_stage);

NOTIFY pgrst, 'reload schema';
