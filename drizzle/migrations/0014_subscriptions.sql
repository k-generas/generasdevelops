-- Recurring Revenue Builder (Feature C): tracked recurring services / retainers.
--
-- Owner-scoped like every other table. A subscription links a business to a
-- recurring offer and records its lifecycle (proposed -> active -> paused/churned)
-- and monthly value. MRR is computed from active rows only; nothing is forecast.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  offer text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  monthly_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  started_at date,
  next_renewal_at date,
  canceled_at date,
  notes text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own subscriptions" ON public.subscriptions;
CREATE POLICY "own subscriptions" ON public.subscriptions FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS subscriptions_owner_status_idx
  ON public.subscriptions (owner_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx
  ON public.subscriptions (business_id);
