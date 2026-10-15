-- Agency Overflow Work Finder (Feature B): the owner's partner directory and the
-- handoffs of work they cannot deliver themselves.
--
-- Owner-scoped like every other table. Partners are entered by the owner (never
-- scraped or invented); a handoff records the offloaded opportunity and keeps the
-- partner's delivery value separate from the owner's referral/coordination fee.

CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'agency',
  services text[] NOT NULL DEFAULT '{}'::text[],
  industries text[] NOT NULL DEFAULT '{}'::text[],
  districts text[] NOT NULL DEFAULT '{}'::text[],
  available_hours_per_week numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  contact_email text,
  contact_phone text,
  source text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own partners" ON public.partners;
CREATE POLICY "own partners" ON public.partners FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS partners_owner_active_idx
  ON public.partners (owner_id, active);

CREATE TABLE IF NOT EXISTS public.partner_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  leak_id uuid REFERENCES public.revenue_leaks(id) ON DELETE SET NULL,
  title text NOT NULL,
  reason text,
  service text,
  delivery_value numeric NOT NULL DEFAULT 0,
  owner_cut numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'planned',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_handoffs TO authenticated;
GRANT ALL ON public.partner_handoffs TO service_role;
ALTER TABLE public.partner_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own partner_handoffs" ON public.partner_handoffs;
CREATE POLICY "own partner_handoffs" ON public.partner_handoffs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS partner_handoffs_owner_status_idx
  ON public.partner_handoffs (owner_id, status);
CREATE INDEX IF NOT EXISTS partner_handoffs_partner_idx
  ON public.partner_handoffs (partner_id);
