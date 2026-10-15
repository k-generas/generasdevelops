-- Referral & partnership intelligence (Feature H): the referral ledger.
-- Owner-scoped like every other table. A referral is a recorded introduction;
-- reward_value is what the owner agreed, never a computed payout.
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  referrer_name text NOT NULL,
  referrer_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  referred_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  referred_name text,
  status text NOT NULL DEFAULT 'invited',
  reward_type text NOT NULL DEFAULT 'none',
  reward_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own referrals" ON public.referrals;
CREATE POLICY "own referrals" ON public.referrals FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS referrals_owner_status_idx ON public.referrals (owner_id, status);
