// Money helpers. Pure and dependency-free so the ledger, invoice balances and
// analytics all agree on rounding, currency grouping and partial payments.

export const CURRENCY_SUGGESTIONS = [
  "USD",
  "RWF",
  "EUR",
  "GBP",
  "KES",
  "TZS",
  "UGX",
  "CDF",
  "ZAR",
] as const;

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
  { value: "legacy", label: "Legacy invoice" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "software", label: "Software & tools" },
  { value: "apis", label: "Data & APIs" },
  { value: "hosting", label: "Hosting & domains" },
  { value: "ads", label: "Ads & marketing" },
  { value: "contractors", label: "Contractors" },
  { value: "transport", label: "Transport" },
  { value: "internet", label: "Internet & phone" },
  { value: "office", label: "Office" },
  { value: "taxes", label: "Taxes & fees" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export type MoneyAmount = {
  amount: number;
  currency: string;
};

export type MoneyTotal = {
  currency: string;
  amount: number;
};

export type PaymentLike = MoneyAmount & {
  invoice_id?: string | null;
  received_at?: string | null;
};

export type ExpenseLike = MoneyAmount & {
  paid_at?: string | null;
};

export type InvoiceLike = {
  id: string | null;
  amount: number;
  currency: string;
  status: string;
};

export function roundMoney(value: number): number {
  const n = Number.isFinite(value) ? value : 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizeCurrency(value: string | null | undefined): string {
  const cleaned = (value ?? "").trim().toUpperCase();
  return cleaned || "USD";
}

export function methodLabel(value: string | null | undefined): string {
  const found = PAYMENT_METHODS.find((m) => m.value === value);
  return found?.label ?? (value || "Other");
}

export function categoryLabel(value: string | null | undefined): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.value === value);
  return found?.label ?? (value || "Other");
}

export function paymentTotalsByInvoice(
  payments: Pick<PaymentLike, "invoice_id" | "amount">[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoice_id) continue;
    const amount = Number(payment.amount) || 0;
    totals.set(payment.invoice_id, roundMoney((totals.get(payment.invoice_id) ?? 0) + amount));
  }
  return totals;
}

export function sumMoney(rows: MoneyAmount[], direction: 1 | -1 = 1): MoneyTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    const amount = (Number(row.amount) || 0) * direction;
    totals.set(currency, roundMoney((totals.get(currency) ?? 0) + amount));
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount: roundMoney(amount) }))
    .filter((row) => Math.abs(row.amount) >= 0.005)
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

export function totalForCurrency(
  rows: MoneyAmount[],
  currency: string,
  direction: 1 | -1 = 1,
): number {
  const wanted = normalizeCurrency(currency);
  let total = 0;
  for (const row of rows) {
    if (normalizeCurrency(row.currency) !== wanted) continue;
    total += (Number(row.amount) || 0) * direction;
  }
  return roundMoney(total);
}

export type InvoicePaymentState = {
  due: number;
  paid: number;
  remaining: number;
  overpaid: number;
  isPaid: boolean;
  isPartial: boolean;
  progress: number;
};

export function invoicePaymentState(
  amount: number,
  payments: Pick<PaymentLike, "amount">[],
): InvoicePaymentState {
  const due = roundMoney(Math.max(0, Number(amount) || 0));
  const paid = roundMoney(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const remaining = roundMoney(Math.max(0, due - paid));
  const overpaid = roundMoney(Math.max(0, paid - due));
  const isPaid = due > 0 ? paid + 0.005 >= due : paid > 0;
  return {
    due,
    paid,
    remaining,
    overpaid,
    isPaid,
    isPartial: paid > 0 && !isPaid,
    progress: due > 0 ? Math.min(1, paid / due) : isPaid ? 1 : 0,
  };
}

export function invoiceStatusAfterPayments(
  currentStatus: string,
  amount: number,
  payments: Pick<PaymentLike, "amount">[],
): string {
  if (currentStatus === "VOID") return "VOID";
  const state = invoicePaymentState(amount, payments);
  if (state.isPaid) return "PAID";
  if (state.paid > 0) return "PARTIAL";
  if (currentStatus === "PAID" || currentStatus === "PARTIAL") return "SENT";
  return currentStatus || "DRAFT";
}

export function latestPaymentAt(payments: Pick<PaymentLike, "received_at">[]): string | null {
  let latest: string | null = null;
  for (const payment of payments) {
    if (!payment.received_at) continue;
    if (!latest || Date.parse(payment.received_at) >= Date.parse(latest)) {
      latest = payment.received_at;
    }
  }
  return latest;
}

export function monthRangeUtc(now: Date = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function withinRange(iso: string | null | undefined, start: string, end: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= Date.parse(start) && t < Date.parse(end);
}

export type CashSummary = {
  collected: number;
  spent: number;
  net: number;
  paymentCount: number;
  expenseCount: number;
};

export function cashSummary(
  payments: PaymentLike[],
  expenses: ExpenseLike[],
  currency: string,
  range?: { start: string; end: string },
): CashSummary {
  const wanted = normalizeCurrency(currency);
  const inRange = (iso: string | null | undefined) =>
    !range || withinRange(iso, range.start, range.end);
  const collectedRows = payments.filter(
    (p) => normalizeCurrency(p.currency) === wanted && inRange(p.received_at),
  );
  const expenseRows = expenses.filter(
    (e) => normalizeCurrency(e.currency) === wanted && inRange(e.paid_at),
  );
  const collected = roundMoney(collectedRows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const spent = roundMoney(expenseRows.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
  return {
    collected,
    spent,
    net: roundMoney(collected - spent),
    paymentCount: collectedRows.length,
    expenseCount: expenseRows.length,
  };
}

export function invoiceCashTotals(
  invoices: InvoiceLike[],
  payments: Pick<PaymentLike, "invoice_id" | "amount" | "currency">[],
): {
  paid: MoneyTotal[];
  outstanding: MoneyTotal[];
  count: number;
} {
  const paidByCurrency = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoice_id) continue;
    const currency = normalizeCurrency(payment.currency);
    paidByCurrency.set(
      currency,
      roundMoney((paidByCurrency.get(currency) ?? 0) + (Number(payment.amount) || 0)),
    );
  }

  const paidForInvoice = paymentTotalsByInvoice(payments);
  const outstandingByCurrency = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.status === "VOID") continue;
    const currency = normalizeCurrency(invoice.currency);
    const amount = Number(invoice.amount) || 0;
    const paid =
      (invoice.id ? paidForInvoice.get(invoice.id) : undefined) ??
      (invoice.status === "PAID" ? amount : 0);
    const remaining = Math.max(0, amount - paid);
    outstandingByCurrency.set(
      currency,
      roundMoney((outstandingByCurrency.get(currency) ?? 0) + remaining),
    );
  }

  const moneyRows = (map: Map<string, number>): MoneyTotal[] =>
    [...map.entries()]
      .map(([currency, amount]) => ({ currency, amount: roundMoney(amount) }))
      .filter((row) => Math.abs(row.amount) >= 0.005)
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));

  return {
    paid: moneyRows(paidByCurrency),
    outstanding: moneyRows(outstandingByCurrency),
    count: invoices.length,
  };
}

export function addMoneyTotals(rows: MoneyTotal[]): MoneyTotal[] {
  return sumMoney(rows);
}
