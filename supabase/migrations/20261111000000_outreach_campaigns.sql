-- Outreach campaign foundation. Campaigns, sequence steps and a manual review
-- queue only. Nothing in this schema sends messages automatically.

CREATE TABLE IF NOT EXISTS public.outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'ready', 'running', 'paused', 'completed', 'archived'
  )),
  audience_kind text NOT NULL DEFAULT 'business' CHECK (audience_kind IN (
    'business', 'professional'
  )),
  daily_limit integer NOT NULL DEFAULT 20 CHECK (daily_limit >= 1 AND daily_limit <= 500),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_owner_status
  ON public.outreach_campaigns (owner_id, status, updated_at DESC);

REVOKE ALL ON public.outreach_campaigns FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own outreach_campaigns" ON public.outreach_campaigns;
CREATE POLICY "own outreach_campaigns" ON public.outreach_campaigns FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.outreach_campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order >= 1),
  channel text NOT NULL CHECK (channel IN (
    'email', 'whatsapp', 'phone', 'sms', 'linkedin', 'contact_form'
  )),
  delay_days integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0 AND delay_days <= 90),
  subject_template text,
  body_template text NOT NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, campaign_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_outreach_campaign_steps_campaign
  ON public.outreach_campaign_steps (owner_id, campaign_id, step_order);

REVOKE ALL ON public.outreach_campaign_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaign_steps TO authenticated;
GRANT ALL ON public.outreach_campaign_steps TO service_role;
ALTER TABLE public.outreach_campaign_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own outreach_campaign_steps" ON public.outreach_campaign_steps;
CREATE POLICY "own outreach_campaign_steps" ON public.outreach_campaign_steps
  FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.outreach_queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.outreach_campaign_steps(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN (
    'email', 'whatsapp', 'phone', 'sms', 'linkedin', 'contact_form'
  )),
  recipient_name text NOT NULL,
  recipient_email text,
  recipient_phone text,
  recipient_domain text,
  country text,
  status text NOT NULL DEFAULT 'needs_review' CHECK (status IN (
    'draft', 'needs_review', 'blocked', 'approved', 'sent', 'skipped'
  )),
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_subject text,
  draft_body text NOT NULL DEFAULT '',
  approved_at timestamptz,
  sent_at timestamptz,
  owner_note text,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, campaign_id, step_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_outreach_queue_owner_status
  ON public.outreach_queue_items (owner_id, campaign_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_owner_step
  ON public.outreach_queue_items (owner_id, step_id, status);

REVOKE ALL ON public.outreach_queue_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_queue_items TO authenticated;
GRANT ALL ON public.outreach_queue_items TO service_role;
ALTER TABLE public.outreach_queue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own outreach_queue_items" ON public.outreach_queue_items;
CREATE POLICY "own outreach_queue_items" ON public.outreach_queue_items FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

NOTIFY pgrst, 'reload schema';
