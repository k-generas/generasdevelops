import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Printer, Receipt, Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useInvoices, type InvoiceRow } from "@/lib/invoices.hooks";
import {
  formatMoney,
  invoiceTotals,
  isOverdue,
  nextInvoiceNumber,
  renderInvoiceText,
  INVOICE_STATUSES,
} from "@/lib/invoices";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [{ title: "Invoices — GARE" }, { name: "description", content: "Invoices." }],
  }),
  component: Invoices,
});

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

function Invoices() {
  const invoices = useInvoices();
  const list = invoices.data?.invoices ?? [];
  const persisted = invoices.data?.persisted ?? false;

  const [filter, setFilter] = useState("ALL");
  const [propId, setPropId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
  const totals = invoiceTotals(list);

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
    } catch (e) {
      const d = describeError(e, "Create invoice");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    setBusy(false);
  }

  async function setStatus(inv: InvoiceRow, status: string) {
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
  }

  async function remove(inv: InvoiceRow) {
    if (!window.confirm(`Delete ${inv.number}?`)) return;
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id!);
    if (error) {
      const d = describeError(error, "Delete invoice");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    await invoices.refetch();
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
            Make a document from a proposal, then mark it paid or unpaid. No online payment.
          </p>
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const csv = rowsToCsv(
                list.map((i) => ({
                  number: i.number,
                  business_name: i.businesses?.name,
                  amount: i.amount,
                  currency: i.currency,
                  status: i.status,
                  issued_at: i.issued_at,
                  due_at: i.due_at,
                  paid_at: i.paid_at,
                })),
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
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
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

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">New invoice from a proposal</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Proposal</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={propId}
            onChange={(e) => onPick(e.target.value)}
          >
            <option value="">Select a proposal…</option>
            {proposals.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.businesses?.name ?? "No client"} — {p.title ?? p.offer ?? p.mode} ({p.status}
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
          <p className="text-xl font-semibold">{formatMoney(totals.outstanding, "USD")}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-xl font-semibold">{formatMoney(totals.paid, "USD")}</p>
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
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === "ALL" ? "No invoices yet" : `No ${filter.toLowerCase()} invoices`}
            why={
              filter === "ALL"
                ? "Create one from a proposal above — it becomes a printable document with a status you can mark paid/unpaid."
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
          filtered.map((inv) => (
            <div key={inv.id ?? inv.number} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {inv.number}
                  {inv.businesses?.name ? ` · ${inv.businesses.name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(Number(inv.amount) || 0, inv.currency)} · issued{" "}
                  {new Date(inv.issued_at).toLocaleDateString()}
                  {inv.due_at ? ` · due ${new Date(inv.due_at).toLocaleDateString()}` : ""}
                  {isOverdue(inv) ? " · OVERDUE" : ""}
                </p>
              </div>
              <span className="rounded-full border px-2 py-0.5 text-xs">{inv.status}</span>
              <div className="flex items-center gap-1">
                {inv.status === "PAID" ? (
                  <Button size="sm" variant="outline" onClick={() => setStatus(inv, "SENT")}>
                    Mark unpaid
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setStatus(inv, "PAID")}>
                    Mark paid
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
          ))
        )}
      </div>
    </div>
  );
}
