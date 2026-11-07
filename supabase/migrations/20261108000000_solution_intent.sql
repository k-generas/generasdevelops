-- Solution builder intent and requested-deliverable classification.
-- Additive only: existing recommendations keep their data and are backfilled.

ALTER TABLE public.solution_recommendations
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS requested_deliverable text;

UPDATE public.solution_recommendations
SET
  intent = CASE
    WHEN solution_type = 'website_repair' THEN 'REPAIR'
    WHEN solution_type = 'maintenance' THEN 'MAINTAIN'
    WHEN solution_type IN ('custom_system', 'automation') THEN 'AUTOMATE'
    WHEN solution_type = 'other' THEN 'ANALYZE'
    WHEN solution_type IN ('ordering_ecommerce', 'booking_appointments')
      AND EXISTS (
        SELECT 1
        FROM public.businesses b
        WHERE b.id = public.solution_recommendations.business_id
          AND b.website IS NOT NULL
          AND btrim(b.website) <> ''
      ) THEN 'IMPROVE'
    ELSE 'CREATE'
  END,
  requested_deliverable = CASE
    WHEN solution_type = 'website_new' THEN 'business_website'
    WHEN solution_type = 'ordering_ecommerce' THEN 'online_ordering_website'
    WHEN solution_type = 'booking_appointments' THEN 'booking_website'
    WHEN solution_type = 'website_repair' THEN 'website_repair'
    WHEN solution_type = 'maintenance' THEN 'website_maintenance'
    WHEN solution_type = 'custom_system' THEN 'business_system'
    WHEN solution_type = 'automation' THEN 'automation'
    ELSE 'analysis'
  END
WHERE intent IS NULL OR requested_deliverable IS NULL;

ALTER TABLE public.solution_recommendations
  ALTER COLUMN intent SET DEFAULT 'CREATE',
  ALTER COLUMN intent SET NOT NULL,
  ALTER COLUMN requested_deliverable SET DEFAULT 'business_website',
  ALTER COLUMN requested_deliverable SET NOT NULL;

ALTER TABLE public.solution_recommendations
  DROP CONSTRAINT IF EXISTS solution_recommendations_intent_check,
  ADD CONSTRAINT solution_recommendations_intent_check
    CHECK (intent IN ('CREATE', 'REPAIR', 'IMPROVE', 'MAINTAIN', 'ANALYZE', 'AUTOMATE')),
  DROP CONSTRAINT IF EXISTS solution_recommendations_requested_deliverable_check,
  ADD CONSTRAINT solution_recommendations_requested_deliverable_check
    CHECK (requested_deliverable IN (
      'business_website', 'online_ordering_website', 'booking_website',
      'website_repair', 'website_maintenance', 'business_system',
      'automation', 'analysis'
    ));

NOTIFY pgrst, 'reload schema';
