-- Automatic daily monitoring: the saved radar target and the digests it produces.
--
-- Owner-scoped like every other table. The scheduled scan runs with the service
-- role, so owner_id is set explicitly there (auth.uid() is null in a background
-- job); interactive use falls back to auth.uid() via RLS.

-- The single saved target the daily job scans (district + category).
CREATE TABLE IF NOT EXISTS public.monitoring_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  enabled boolean NOT NULL DEFAULT false,
  district text,
  category text NOT NULL DEFAULT 'all',
  industries text[] NOT NULL DEFAULT '{}'::text[],
  max_queries int NOT NULL DEFAULT 10,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_settings TO authenticated;
GRANT ALL ON public.monitoring_settings TO service_role;
ALTER TABLE public.monitoring_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own monitoring_settings" ON public.monitoring_settings FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- One digest per day: what a scheduled (or manual) scan found.
CREATE TABLE IF NOT EXISTS public.daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  for_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  status text NOT NULL DEFAULT 'ok',
  district text,
  category text NOT NULL DEFAULT 'all',
  queries int NOT NULL DEFAULT 0,
  found int NOT NULL DEFAULT 0,
  added int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  failed_queries int NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  run_id uuid,
  scan_id uuid,
  new_businesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_digests TO authenticated;
GRANT ALL ON public.daily_digests TO service_role;
ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily_digests" ON public.daily_digests FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE UNIQUE INDEX IF NOT EXISTS daily_digests_owner_date
  ON public.daily_digests (owner_id, for_date);
CREATE INDEX IF NOT EXISTS daily_digests_owner_created_idx
  ON public.daily_digests (owner_id, created_at DESC);
