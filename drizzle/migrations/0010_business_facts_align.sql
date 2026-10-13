ALTER TABLE public.business_facts
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS observed_at timestamptz NOT NULL DEFAULT now();