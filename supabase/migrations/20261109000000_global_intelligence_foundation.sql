-- Global intelligence foundation: professionals, professional/business links and
-- a suppression ledger. Additive only; existing businesses, contacts, proposals,
-- outreach and investigations are not rewritten.

CREATE TABLE IF NOT EXISTS public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  headline text,
  professional_type text NOT NULL DEFAULT 'other' CHECK (professional_type IN (
    'founder', 'owner', 'executive', 'director', 'manager', 'consultant',
    'freelancer', 'creator', 'engineer', 'designer', 'marketer', 'salesperson',
    'investor', 'partner', 'other'
  )),
  country text,
  region text,
  city text,
  languages text[] NOT NULL DEFAULT '{}'::text[],
  expertise text[] NOT NULL DEFAULT '{}'::text[],
  skills text[] NOT NULL DEFAULT '{}'::text[],
  website text,
  public_email text,
  public_phone text,
  profile_url text,
  source_name text,
  source_url text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.3 CHECK (confidence >= 0 AND confidence <= 1),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN (
    'unverified', 'observed', 'corroborated', 'owner_confirmed'
  )),
  availability_status text NOT NULL DEFAULT 'unknown' CHECK (availability_status IN (
    'unknown', 'open', 'limited', 'unavailable'
  )),
  relationship_stage text NOT NULL DEFAULT 'researching' CHECK (relationship_stage IN (
    'not_contacted', 'researching', 'contacted', 'replied', 'meeting',
    'proposal', 'won', 'lost', 'dormant', 'do_not_contact'
  )),
  do_not_contact boolean NOT NULL DEFAULT false,
  notes text,
  last_verified_at timestamptz,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_professionals_owner_dedupe
  ON public.professionals (owner_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_professionals_owner_stage
  ON public.professionals (owner_id, relationship_stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_professionals_owner_country
  ON public.professionals (owner_id, country, professional_type);
CREATE INDEX IF NOT EXISTS idx_professionals_owner_verification
  ON public.professionals (owner_id, verification_status, availability_status);

REVOKE ALL ON public.professionals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own professionals" ON public.professionals;
CREATE POLICY "own professionals" ON public.professionals FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.professional_business_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role text,
  relationship_type text NOT NULL DEFAULT 'works_at' CHECK (relationship_type IN (
    'works_at', 'founder_of', 'owner_of', 'advisor_to', 'partner_with',
    'client_of', 'prospect_for', 'other'
  )),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  verified boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, professional_id, business_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_professional_links_professional
  ON public.professional_business_links (owner_id, professional_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_professional_links_business
  ON public.professional_business_links (owner_id, business_id, updated_at DESC);

REVOKE ALL ON public.professional_business_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_business_links TO authenticated;
GRANT ALL ON public.professional_business_links TO service_role;
ALTER TABLE public.professional_business_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own professional_business_links" ON public.professional_business_links;
CREATE POLICY "own professional_business_links" ON public.professional_business_links
  FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.suppression_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'contact' CHECK (scope IN (
    'contact', 'email', 'phone', 'domain', 'business', 'professional'
  )),
  value text NOT NULL,
  channel text NOT NULL DEFAULT 'all' CHECK (channel IN (
    'all', 'email', 'whatsapp', 'phone', 'sms', 'linkedin', 'contact_form'
  )),
  reason text NOT NULL,
  source text,
  country text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, scope, value, channel)
);

CREATE INDEX IF NOT EXISTS idx_suppression_entries_owner_scope
  ON public.suppression_entries (owner_id, scope, value);
CREATE INDEX IF NOT EXISTS idx_suppression_entries_owner_channel
  ON public.suppression_entries (owner_id, channel, expires_at);

REVOKE ALL ON public.suppression_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppression_entries TO authenticated;
GRANT ALL ON public.suppression_entries TO service_role;
ALTER TABLE public.suppression_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own suppression_entries" ON public.suppression_entries;
CREATE POLICY "own suppression_entries" ON public.suppression_entries FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

NOTIFY pgrst, 'reload schema';
