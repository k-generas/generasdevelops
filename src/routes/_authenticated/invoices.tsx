import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, Printer, Receipt, Trash2, TriangleAlert, Undo2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useInvoices, type InvoiceRow } from "@/lib/invoices.hooks";
import {
  formatMoney,
  isOverdue,
  nextInvoiceNumber,
  renderInvoiceText,
  INVOICE_STATUSES,
} from "@/lib/invoices";
import {
  invoiceCashTotals,
  invoicePaymentState,
  paymentTotalsByInvoice,
  sumMoney,
} from "@/lib/money";
import { usePayments } from "@/lib/money.hooks";
import { removeInvoicePayments } from "@/lib/money.actions";
import { RecordPaymentDialog, type PaymentInvoiceOption } from "@/components/RecordPaymentDialog";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices - GARE" },
      { name: "description", content: "Invoices and customer payments." },
    ],
  }),
  component: Invoices,
});

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

function TotalsList({ rows }: { rows: { currency: string; amount: number }[] }) {
  if (!rows.length) return <p className="text-xl font-semibold">-</p>;
  return (
    <div className="space-y-0.5">
      {rows.map((row) => (
        <p key={row.currency} className="text-xl font-semibold">
          {formatMoney(row.amount, row.currency)}
        </p>
      ))}
    </div>
  );
}

function Invoices() {
  const qc = useQueryClient();
  const invoices = useInvoices();
  const paymentsQ = usePayments();
  const list = useMemo(() => invoices.data?.invoices ?? [], [invoices.data?.invoices]);
  const payments = useMemo(() => paymentsQ.data?.rows ?? [], [paymentsQ.data?.rows]);
  const persisted = invoices.data?.persisted ?? false;
  const paymentsPersisted = paymentsQ.data?.persisted ?? false;

  const [filter, setFilter] = useState("ALL");
  const [propId, setPropId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);

  const proposals = useQuery({
    queryKey: ["invoices", "proposals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("proposals")
        .select("id,title,mode,offer,status,price,currency,business_id,businesses(name)")
        .order("updated_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const filtered = list.filter((i) => filter === "ALL" || i.status === filter);
  const paidByInvoice = useMemo(() => paymentTotalsByInvoice(payments), [payments]);

  const totals = useMemo(() => {
    if (paymentsPersisted) return invoiceCashTotals(list, payments);
    const paidRows = list
      .filter((invoice) => invoice.status === "PAID")
      .map((invoice) => ({ amount: Number(invoice.amount) || 0, currency: invoice.currency }));
    const outstandingRows = list
      .filter((invoice) => invoice.status !== "PAID" && invoice.status !== "VOID")
      .map((invoice) => ({ amount: Number(invoice.amount) || 0, currency: invoice.currency }));
    return {
      paid: sumMoney(paidRows),
      outstanding: sumMoney(outstandingRows),
      count: list.length,
    };
  }, [list, payments, paymentsPersisted]);

  const paymentOptions = useMemo(
    () =>
      list
        .filter((invoice) => invoice.id && invoice.status !== "VOID")
        .map<PaymentInvoiceOption>((invoice) => ({
          id: invoice.id as string,
          number: invoice.number,
          business_id: invoice.business_id,
          businessName: invoice.businesses?.name ?? null,
          amount: Number(invoice.amount) || 0,
          currency: invoice.currency,
          status: invoice.status,
          paid: paidByInvoice.get(invoice.id as string) ?? 0,
        })),
    [list, paidByInvoice],
  );

  function paidFor(invoice: InvoiceRow): number {
    if (paymentsPersisted && invoice.id) return paidByInvoice.get(invoice.id) ?? 0;
    return invoice.status === "PAID" ? Number(invoice.amount) || 0 : 0;
  }

  async function refreshMoney() {
    await Promise.all([invoices.refetch(), paymentsQ.refetch()]);
    void qc.invalidateQueries({ queryKey: ["nav-counts"] });
    void qc.invalidateQueries({ queryKey: ["analytics-data"] });
  }

  function onPick(id: string) {
    setPropId(id);
    const p = proposals.data?.find((x) => x.id === id);
    if (p) {
      setAmount(p.price != null ? String(p.price) : "");
      setCurrency(p.currency ?? "USD");
      setNotes(p.title ?? p.offer ?? p.mode ?? "");
    }
  }

  async function create() {
    const p = proposals.data?.find((x) => x.id === propId);
    if (!p) {
      setMsg("Pick a proposal first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const number = nextInvoiceNumber(
        list.map((i) => i.number),
        new Date().getFullYear(),
      );
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          number,
          business_id: p.business_id,
          proposal_id: p.id,
          currency,
          amount: Number(amount) || 0,
          status: "DRAFT",
          issued_at: new Date().toISOString(),
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (p.business_id) {
        await supabase.from("business_activity_events").insert({
          business_id: p.business_id,
          event_type: "invoice_created",
          summary: `Invoice ${number} created for ${formatMoney(Number(amount) || 0, currency)}`,
          ref_table: "invoices",
          ref_id: data?.id ?? null,
        });
      }
      setPropId("");
      setAmount("");
      setDueAt("");
      setNotes("");
      setMsg(`Created ${number}.`);
      await invoices.refetch();
      void qc.invalidateQueries({ queryKey: ["nav-counts"] });
    } catch (e) {
      const d = describeError(e, "Create invoice");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    setBusy(false);
  }

  async function setLegacyStatus(inv: InvoiceRow, status: string) {
    const { error } = await supabase
      .from("invoices")
      .update({
        status,
        paid_at: status === "PAID" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id!);
    if (error) {
      const d = describeError(error, "Update invoice");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    await invoices.refetch();
    void qc.invalidateQueries({ queryKey: ["nav-counts"] });
  }

  async function remove(inv: InvoiceRow) {
    const hasPayments = paidFor(inv) > 0;
    const extra = hasPayments ? " Recorded payments stay in the cash ledger." : "";
    if (!window.confirm(`Delete ${inv.number}?${extra}`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id!);
    if (error) {
      const d = describeError(error, "Delete invoice");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    await refreshMoney();
  }

  async function clearPayments(inv: InvoiceRow) {
    if (!inv.id) return;
    if (!window.confirm(`Remove every payment recorded against ${inv.number}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await removeInvoicePayments(inv.id);
      setMsg(`Removed payments from ${inv.number}.`);
      await refreshMoney();
    } catch (e) {
      const d = describeError(e, "Remove payments");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    setBusy(false);
  }

  function print(inv: InvoiceRow) {
    const text = renderInvoiceText(inv, inv.businesses?.name ?? null, inv.notes);
    const w = window.open("", "_blank", "width=700,height=900");
    if (!w) return;
    w.document.write(
      `<div style="font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;padding:32px">${escapeHtml(text)}</div>`,
    );
    w.document.title = inv.number;
    w.document.close();
  }

  function copy(inv: InvoiceRow) {
    void navigator.clipboard.writeText(
      renderInvoiceText(inv, inv.businesses?.name ?? null, inv.notes),
    );
    setMsg(`Copied ${inv.number}.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Make a document from a proposal, then record the payments you actually receive.
          </p>
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const csv = rowsToCsv(
                list.map((i) => {
                  const paid = paidFor(i);
                  return {
                    number: i.number,
                    business_name: i.businesses?.name,
                    amount: i.amount,
                    currency: i.currency,
                    status: i.status,
                    paid,
                    outstanding: Math.max(0, (Number(i.amount) || 0) - paid),
                    issued_at: i.issued_at,
                    due_at: i.due_at,
                    paid_at: i.paid_at,
                  };
                }),
              );
              downloadCsv(csv, `invoices-${new Date().toISOString().slice(0, 10)}.csv`);
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {(invoices.isError || proposals.isError) && (
        <ErrorBanner
          error={(invoices.error ?? proposals.error) as Error}
          context="Invoices"
          onRetry={() => {
            if (invoices.isError) void invoices.refetch();
            if (proposals.isError) void proposals.refetch();
          }}
        />
      )}

      {!invoices.isLoading && !persisted && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-card p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Invoices need the database update</p>
            <p className="text-muted-foreground">
              Apply migration <code>0005_invoices.sql</code> (see{" "}
              <code>docs/GARE_DB_RUNBOOK.md</code>). Creating invoices is disabled until then.
            </p>
          </div>
        </div>
      )}

      {!paymentsQ.isLoading && persisted && !paymentsPersisted && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-card p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Payment ledger needs migration 0021</p>
            <p className="text-muted-foreground">
              Apply <code>0021_payments_expenses.sql</code> to record partial and full payments.
              Until then you can still mark invoices paid or unpaid.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">New invoice from a proposal</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Proposal</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={propId}
            onChange={(e) => onPick(e.target.value)}
          >
            <option value="">Select a proposal...</option>
            {proposals.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.businesses?.name ?? "No client"} - {p.title ?? p.offer ?? p.mode} ({p.status}
                {p.price != null ? `, ${formatMoney(p.price, p.currency ?? "USD")}` : ""})
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Amount</span>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Currency</span>
            <Input
              value={currency}
              maxLength={6}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Due date</span>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">For / notes</span>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What is this invoice for?"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={create} disabled={busy || !persisted}>
            Create invoice
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <TotalsList rows={totals.outstanding} />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Collected against invoices</p>
          <TotalsList rows={totals.paid} />
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Invoices</p>
          <p className="text-xl font-semibold">{totals.count}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["ALL", ...INVOICE_STATUSES].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <div className="divide-y rounded-lg border bg-card">
        {invoices.isError ? (
          <div className="p-4">
            <ErrorBanner
              error={invoices.error}
              context="Invoice list"
              onRetry={() => void invoices.refetch()}
            />
          </div>
        ) : invoices.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === "ALL" ? "No invoices yet" : `No ${filter.toLowerCase()} invoices`}
            why={
              filter === "ALL"
                ? "Create one from a proposal above - it becomes a printable document with payments tracked against it."
                : "Nothing currently has this status. Change the status filter above to see other invoices."
            }
            action={
              filter !== "ALL" ? (
                <Button size="sm" variant="outline" onClick={() => setFilter("ALL")}>
                  Show all
                </Button>
              ) : undefined
            }
          />
        ) : (
          filtered.map((inv) => {
            const paid = paidFor(inv);
            const state = invoicePaymentState(inv.amount, [{ amount: paid }]);
            return (
              <div
                key={inv.id ?? inv.number}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {inv.number}
                    {inv.businesses?.name ? ` - ${inv.businesses.name}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(Number(inv.amount) || 0, inv.currency)} - paid{" "}
                    {formatMoney(paid, inv.currency)}
                    {state.remaining > 0
                      ? ` - remaining ${formatMoney(state.remaining, inv.currency)}`
                      : ""}
                    {state.overpaid > 0
                      ? ` - overpaid ${formatMoney(state.overpaid, inv.currency)}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Issued {new Date(inv.issued_at).toLocaleDateString()}
                    {inv.due_at ? ` - due ${new Date(inv.due_at).toLocaleDateString()}` : ""}
                    {isOverdue(inv) ? " - OVERDUE" : ""}
                  </p>
                </div>
                <span className="rounded-full border px-2 py-0.5 text-xs">{inv.status}</span>
                <div className="flex items-center gap-1">
                  {paymentsPersisted ? (
                    <Button
                      size="sm"
                      variant={state.remaining > 0 ? "default" : "outline"}
                      onClick={() => {
                        setPaymentInvoiceId(inv.id);
                        setPaymentOpen(true);
                      }}
                      disabled={!inv.id || inv.status === "VOID"}
                    >
                      <Wallet className="h-4 w-4" />
                      Record payment
                    </Button>
                  ) : inv.status === "PAID" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLegacyStatus(inv, "SENT")}
                    >
                      Mark unpaid
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setLegacyStatus(inv, "PAID")}>
                      Mark paid
                    </Button>
                  )}
                  {paymentsPersisted && paid > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void clearPayments(inv)}
                      title="Remove all payments"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => print(inv)} title="Print / PDF">
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copy(inv)} title="Copy">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(inv)}
                    title="Delete"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        invoices={paymentOptions}
        fixedInvoiceId={paymentInvoiceId}
        onSaved={(message) => {
          if (message) setMsg(message);
          setPaymentInvoiceId(null);
          void refreshMoney();
        }}
      />
    </div>
  );
}
