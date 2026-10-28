import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordPayment } from "@/lib/money.actions";
import { CURRENCY_SUGGESTIONS, PAYMENT_METHODS, normalizeCurrency, roundMoney } from "@/lib/money";
import { formatMoney } from "@/lib/invoices";
import { describeError } from "@/lib/errors";

export type PaymentInvoiceOption = {
  id: string;
  number: string;
  business_id: string | null;
  businessName: string | null;
  amount: number;
  currency: string;
  status: string;
  paid: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: PaymentInvoiceOption[];
  businesses?: { id: string; name: string }[];
  fixedInvoiceId?: string | null;
  onSaved: (message: string | null) => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function remainingFor(invoice: PaymentInvoiceOption): number {
  return roundMoney(Math.max(0, invoice.amount - invoice.paid));
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoices,
  businesses = [],
  fixedInvoiceId = null,
  onSaved,
}: Props) {
  const [invoiceId, setInvoiceId] = useState(fixedInvoiceId ?? "");
  const [businessId, setBusinessId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [method, setMethod] = useState("bank_transfer");
  const [receivedAt, setReceivedAt] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selected = invoices.find((invoice) => invoice.id === invoiceId) ?? null;
  const lockedInvoice = fixedInvoiceId
    ? (invoices.find((invoice) => invoice.id === fixedInvoiceId) ?? null)
    : null;
  const active = lockedInvoice ?? selected;

  useEffect(() => {
    if (!open) return;
    const id = fixedInvoiceId ?? "";
    setInvoiceId(id);
    setBusinessId("");
    setCurrency("USD");
    setMethod("bank_transfer");
    setReceivedAt(today());
    setReference("");
    setNotes("");
    setMsg(null);
    const invoice = invoices.find((row) => row.id === id);
    if (invoice) {
      const remaining = remainingFor(invoice);
      setAmount((remaining > 0 ? remaining : invoice.amount).toFixed(2));
      setCurrency(normalizeCurrency(invoice.currency));
      setBusinessId(invoice.business_id ?? "");
    } else {
      setAmount("");
    }
  }, [open, fixedInvoiceId, invoices]);

  function pickInvoice(id: string) {
    setInvoiceId(id);
    setMsg(null);
    const invoice = invoices.find((row) => row.id === id);
    if (!invoice) {
      setAmount("");
      setBusinessId("");
      return;
    }
    const remaining = remainingFor(invoice);
    setAmount((remaining > 0 ? remaining : invoice.amount).toFixed(2));
    setCurrency(normalizeCurrency(invoice.currency));
    setBusinessId(invoice.business_id ?? "");
  }

  async function submit() {
    const value = roundMoney(Number(amount));
    if (!(value > 0)) {
      setMsg("Enter a payment amount greater than zero.");
      return;
    }
    if (!receivedAt) {
      setMsg("Choose the date the payment was received.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const result = await recordPayment({
        invoice_id: active?.id ?? null,
        business_id: active ? undefined : businessId || null,
        amount: value,
        currency: active ? active.currency : currency,
        method,
        received_at: new Date(`${receivedAt}T00:00:00.000Z`).toISOString(),
        reference,
        notes,
      });
      onOpenChange(false);
      onSaved(
        result.warning ??
          `Recorded ${formatMoney(value, active?.currency ?? normalizeCurrency(currency))}.`,
      );
    } catch (e) {
      const d = describeError(e, "Record payment");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Add cash actually received. Partial payments update the invoice balance automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!fixedInvoiceId && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Invoice (optional)</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={invoiceId}
                onChange={(e) => pickInvoice(e.target.value)}
              >
                <option value="">General payment / no invoice</option>
                {invoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number}
                    {invoice.businessName ? ` — ${invoice.businessName}` : ""} —{" "}
                    {formatMoney(remainingFor(invoice), invoice.currency)} left
                  </option>
                ))}
              </select>
            </label>
          )}

          {active && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {active.number}
                {active.businessName ? ` — ${active.businessName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Invoice {formatMoney(active.amount, active.currency)} · paid{" "}
                {formatMoney(active.paid, active.currency)} · remaining{" "}
                {formatMoney(remainingFor(active), active.currency)}
              </p>
            </div>
          )}

          {!active && businesses.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Business (optional)</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
              >
                <option value="">No business link</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="text-sm">
              <Label htmlFor="payment-amount" className="mb-1 block text-muted-foreground">
                Amount
              </Label>
              <Input
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="text-sm">
              <Label htmlFor="payment-currency" className="mb-1 block text-muted-foreground">
                Currency
              </Label>
              <Input
                id="payment-currency"
                list="money-currency-options"
                value={currency}
                disabled={!!active}
                maxLength={6}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
            <div className="text-sm">
              <Label htmlFor="payment-date" className="mb-1 block text-muted-foreground">
                Received
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Method</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.filter((m) => m.value !== "legacy").map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm">
            <Label htmlFor="payment-reference" className="mb-1 block text-muted-foreground">
              Reference
            </Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction or receipt number"
            />
          </div>

          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was this payment for?"
          />
        </div>

        {msg && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {msg}
          </p>
        )}

        <datalist id="money-currency-options">
          {CURRENCY_SUGGESTIONS.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
