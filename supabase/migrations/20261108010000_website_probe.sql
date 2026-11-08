-- Persist lightweight website health probes so discovery can focus on businesses
-- that need a website or an existing-site service, and hide healthy websites.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS website_probe jsonb,
  ADD COLUMN IF NOT EXISTS website_probed_at timestamptz;

CREATE INDEX IF NOT EXISTS businesses_website_probed_at_idx
  ON public.businesses (owner_id, website_probed_at);

NOTIFY pgrst, 'reload schema';
