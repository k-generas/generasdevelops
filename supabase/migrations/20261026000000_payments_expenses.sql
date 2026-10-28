-- Money truth: record cash actually received and costs actually paid.
-- Invoices remain documents; payments are the source of truth for collected cash.
-- Additive only and owner-scoped like every other table.

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL DEFAULT 'bank_transfer',
  received_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.payments FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS payments_owner_received_idx
  ON public.payments (owner_id, received_at DESC);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS payments_business_idx ON public.payments (business_id);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other',
  vendor text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL DEFAULT 'bank_transfer',
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own expenses" ON public.expenses FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS expenses_owner_paid_idx
  ON public.expenses (owner_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS expenses_business_idx ON public.expenses (business_id);

-- Backfill invoices that were already marked paid before payment tracking.
-- The NOT EXISTS guard keeps the insert safe if this file is re-run manually.
INSERT INTO public.payments (
  owner_id,
  business_id,
  invoice_id,
  amount,
  currency,
  method,
  received_at,
  reference,
  notes
)
SELECT
  i.owner_id,
  i.business_id,
  i.id,
  i.amount,
  i.currency,
  'legacy',
  COALESCE(i.paid_at, i.updated_at, i.issued_at),
  'Invoice ' || i.number,
  'Backfilled from an invoice marked paid before payments were tracked.'
FROM public.invoices i
WHERE i.status = 'PAID'
  AND i.amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id);

NOTIFY pgrst, 'reload schema';
