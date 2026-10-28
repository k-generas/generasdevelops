import { supabase } from "@/integrations/supabase/client";
import {
  invoiceStatusAfterPayments,
  latestPaymentAt,
  normalizeCurrency,
  roundMoney,
} from "@/lib/money";

export type PaymentInput = {
  invoice_id?: string | null | undefined;
  business_id?: string | null | undefined;
  amount: number;
  currency?: string | undefined;
  method?: string | undefined;
  received_at?: string | undefined;
  reference?: string | null | undefined;
  notes?: string | null | undefined;
};

export type ExpenseInput = {
  business_id?: string | null | undefined;
  category?: string | undefined;
  vendor?: string | null | undefined;
  amount: number;
  currency?: string | undefined;
  method?: string | undefined;
  paid_at?: string | undefined;
  reference?: string | null | undefined;
  notes?: string | null | undefined;
};

export type PaymentResult = {
  id: string;
  invoiceStatus: string | null;
  warning: string | null;
};

function cleanText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text || null;
}

function validIso(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

async function syncInvoice(invoiceId: string): Promise<string | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id,amount,status,paid_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) return null;

  const { data: payments, error: paymentError } = await supabase
    .from("payments")
    .select("amount,received_at")
    .eq("invoice_id", invoiceId);
  if (paymentError) throw new Error(paymentError.message);

  const rows = payments ?? [];
  const status = invoiceStatusAfterPayments(invoice.status, invoice.amount, rows);
  const paidAt = status === "PAID" ? (latestPaymentAt(rows) ?? new Date().toISOString()) : null;
  const changed = status !== invoice.status || paidAt !== invoice.paid_at;
  if (changed) {
    const { error } = await supabase
      .from("invoices")
      .update({ status, paid_at: paidAt, updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    if (error) throw new Error(error.message);
  }
  return status;
}

export async function syncInvoicePaymentState(invoiceId: string): Promise<string | null> {
  return syncInvoice(invoiceId);
}

async function logPayment(
  paymentId: string,
  businessId: string | null,
  amount: number,
  currency: string,
): Promise<void> {
  if (!businessId) return;
  await supabase.from("business_activity_events").insert({
    business_id: businessId,
    event_type: "payment_recorded",
    summary: `Payment of ${currency} ${amount.toLocaleString()} recorded`,
    ref_table: "payments",
    ref_id: paymentId,
  });
}

export async function recordPayment(input: PaymentInput): Promise<PaymentResult> {
  const amount = roundMoney(Number(input.amount));
  if (!(amount > 0)) throw new Error("Payment amount must be greater than zero.");

  let invoice: {
    id: string;
    business_id: string | null;
    currency: string;
  } | null = null;
  if (input.invoice_id) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id,business_id,currency")
      .eq("id", input.invoice_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("That invoice was not found. Refresh and try again.");
    invoice = data;
  }

  const currency = normalizeCurrency(invoice?.currency ?? input.currency);
  const businessId = invoice?.business_id ?? input.business_id ?? null;
  const receivedAt = validIso(input.received_at, new Date().toISOString());

  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: invoice?.id ?? null,
      business_id: businessId,
      amount,
      currency,
      method: input.method || "bank_transfer",
      received_at: receivedAt,
      reference: cleanText(input.reference),
      notes: cleanText(input.notes),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  let invoiceStatus: string | null = null;
  let warning: string | null = null;
  if (invoice) {
    try {
      invoiceStatus = await syncInvoice(invoice.id);
    } catch {
      warning = "Payment saved, but the invoice balance could not be refreshed. Reopen the page.";
    }
  }
  try {
    await logPayment(data.id, businessId, amount, currency);
  } catch {
    // The payment is already saved; an activity note is optional.
  }
  return { id: data.id, invoiceStatus, warning };
}

export async function deletePayment(paymentId: string): Promise<string | null> {
  const { data: payment, error: readError } = await supabase
    .from("payments")
    .select("id,invoice_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!payment) return null;

  const { error } = await supabase.from("payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  if (!payment.invoice_id) return null;
  return syncInvoice(payment.invoice_id);
}

export async function removeInvoicePayments(invoiceId: string): Promise<string | null> {
  const { error } = await supabase.from("payments").delete().eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  return syncInvoice(invoiceId);
}

export async function recordExpense(input: ExpenseInput): Promise<string> {
  const amount = roundMoney(Number(input.amount));
  if (!(amount > 0)) throw new Error("Expense amount must be greater than zero.");
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      business_id: input.business_id ?? null,
      category: input.category || "other",
      vendor: cleanText(input.vendor),
      amount,
      currency: normalizeCurrency(input.currency),
      method: input.method || "bank_transfer",
      paid_at: validIso(input.paid_at, new Date().toISOString()),
      reference: cleanText(input.reference),
      notes: cleanText(input.notes),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);
}
