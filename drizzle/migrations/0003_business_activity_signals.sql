-- Activity / closure signals captured from Google Places so closed or
-- recently-gone-quiet businesses can be flagged instead of being pitched.
ALTER TABLE public.businesses
  ADD COLUMN activity_checked_at timestamptz,
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN open_now boolean,
  ADD COLUMN opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN recent_reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN reviews_last_90d int;
