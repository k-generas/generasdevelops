// Invoicing-lite helpers. Pure and dependency-free so they are easy to test.
// No payment provider is involved: an invoice is a document the owner marks paid
// or unpaid by hand.

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type Invoice = {
  id: string | null;
  number: string;
  business_id: string | null;
  proposal_id: string | null;
  currency: string;
  amount: number;
  status: string;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  notes: string | null;
};

export function formatMoney(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

// Deterministic next number for a given year, e.g. INV-2026-0003. Scans the
// owner's existing numbers so the sequence never repeats after a reload.
export function nextInvoiceNumber(existing: string[], year: number): string {
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const num of existing) {
    if (!num.startsWith(prefix)) continue;
    const n = Number(num.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function isOverdue(
  inv: Pick<Invoice, "status" | "due_at">,
  now: Date = new Date(),
): boolean {
  if (inv.status === "PAID" || inv.status === "VOID") return false;
  if (!inv.due_at) return false;
  return new Date(inv.due_at).getTime() < now.getTime();
}

export function invoiceTotals(rows: Pick<Invoice, "amount" | "status">[]): {
  paid: number;
  outstanding: number;
  count: number;
} {
  let paid = 0;
  let outstanding = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (r.status === "PAID") paid += a;
    else if (r.status !== "VOID") outstanding += a;
  }
  return { paid, outstanding, count: rows.length };
}

// A plain-text invoice ready to copy or print.
export function renderInvoiceText(
  inv: Invoice,
  businessName?: string | null,
  description?: string | null,
): string {
  const lines = [
    `INVOICE ${inv.number}`,
    `Status: ${inv.status}${inv.paid_at ? ` (paid ${new Date(inv.paid_at).toLocaleDateString()})` : ""}`,
    `Issued: ${new Date(inv.issued_at).toLocaleDateString()}`,
    inv.due_at ? `Due: ${new Date(inv.due_at).toLocaleDateString()}` : "Due: on receipt",
    "",
    "Bill to:",
    businessName?.trim() || "—",
    "",
    "For:",
    (description ?? inv.notes ?? "Professional services").trim(),
    "",
    `Amount: ${formatMoney(inv.amount, inv.currency)}`,
    "",
    "Payment: bank transfer or mobile money (details to be provided). No online payment is processed.",
  ];
  return lines.join("\n");
}
