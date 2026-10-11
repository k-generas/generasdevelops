ALTER TABLE public.businesses
  ADD COLUMN website_source text,
  ADD COLUMN website_checked_at timestamptz,
  ADD COLUMN website_check jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.businesses SET website_source = 'google_places' WHERE website IS NOT NULL AND website_source IS NULL;