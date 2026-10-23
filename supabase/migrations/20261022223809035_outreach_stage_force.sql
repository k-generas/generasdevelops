ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS outreach_stage text DEFAULT 'not_contacted';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS outreach_note text;
UPDATE public.businesses SET outreach_stage = 'not_contacted' WHERE outreach_stage IS NULL;
ALTER TABLE public.businesses ALTER COLUMN outreach_stage SET DEFAULT 'not_contacted';
ALTER TABLE public.businesses ALTER COLUMN outreach_stage SET NOT NULL;
DO  BEGIN
  ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_outreach_stage_check;
  ALTER TABLE public.businesses ADD CONSTRAINT businesses_outreach_stage_check CHECK (outreach_stage IN ('not_contacted','messaged','replied','negotiating','won','lost'));
EXCEPTION WHEN OTHERS THEN NULL;
END ;
GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
NOTIFY pgrst, 'reload schema';
