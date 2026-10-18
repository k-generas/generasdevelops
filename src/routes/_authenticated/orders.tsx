import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Circle, Receipt, TriangleAlert, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrders, type OrderRow } from "@/lib/orders.hooks";
import {
  ORDER_STATUSES,
  checklistProgress,
  nextOrderNumber,
  orderIsLate,
  toChecklist,
  type ChecklistItem,
} from "@/lib/orders";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/invoices";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "Orders — GARE" }] }),
  component: Orders,
});

function Orders() {
  const orders = useOrders();
  const list = orders.data?.orders ?? [];
  const persisted = orders.data?.persisted ?? true;
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [propId, setPropId] = useState("");
  const [invId, setInvId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [checklistText, setChecklistText] = useState("Design\nBuild\nReview\nLaunch");

  const proposals = useQuery({
    queryKey: ["orders", "proposals"],
    queryFn: async () => {
      const { data } = await supabase
        .from("proposals")
        .select("id,title,mode,price,currency,business_id,businesses(name)")
        .order("updated_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });
  const invoices = useQuery({
    queryKey: ["orders", "invoices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id,number,business_id,amount,currency,proposal_id")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const filtered = list.filter((o) => filter === "ALL" || o.status === filter);

  function onPickProp(id: string) {
    setPropId(id);
    const p = proposals.data?.find((x) => x.id === id);
    if (p) {
      setAmount(p.price != null ? String(p.price) : "");
      setCurrency(p.currency ?? "USD");
      setNotes(p.title ?? p.mode ?? "");
    }
  }

  function onPickInv(id: string) {
    setInvId(id);
    const i = invoices.data?.find((x) => x.id === id);
    if (i) {
      setAmount(i.amount != null ? String(i.amount) : "");
      setCurrency(i.currency ?? "USD");
      if (!propId) setPropId(i.proposal_id ?? "");
    }
  }

  async function create() {
    const p = proposals.data?.find((x) => x.id === propId);
    setBusy(true);
    setMsg(null);
    try {
      const number = nextOrderNumber(
        list.map((x) => x.number),
        new Date().getFullYear(),
      );
      const items = checklistText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((label) => ({ label, done: false }));
      const { data, error } = await supabase
        .from("orders")
        .insert({
          number,
          business_id: p?.business_id ?? null,
          proposal_id: propId || null,
          invoice_id: invId || null,
          currency,
          amount: Number(amount) || 0,
          status: "DRAFT",
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          checklist: items,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (p?.business_id) {
        await supabase.from("business_activity_events").insert({
          business_id: p.business_id,
          event_type: "order_created",
          summary: `Order ${number} created`,
          ref_table: "orders",
          ref_id: data?.id ?? null,
        });
      }
      setPropId("");
      setInvId("");
      setAmount("");
      setDueAt("");
      setNotes("");
      setMsg(`Created ${number}.`);
      await orders.refetch();
    } catch (e) {
      const d = describeError(e, "Create order");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    setBusy(false);
  }

  async function setStatus(o: OrderRow, status: string) {
    const { error } = await supabase
      .from("orders")
      .update({
        status,
        fulfilled_at: status === "FULFILLED" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", o.id!);
    if (error) {
      const d = describeError(error, "Update order");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    if (status === "FULFILLED" && o.businesses) {
      await supabase.from("business_activity_events").insert({
        business_id: o.business_id,
        event_type: "order_fulfilled",
        summary: `Order ${o.number} fulfilled`,
        ref_table: "orders",
        ref_id: o.id,
      });
    }
    await orders.refetch();
  }

  async function updateChecklist(o: OrderRow, c: ChecklistItem[]) {
    await supabase
      .from("orders")
      .update({ checklist: c, updated_at: new Date().toISOString() })
      .eq("id", o.id!);
    await orders.refetch();
  }

  async function remove(o: OrderRow) {
    if (!window.confirm(`Delete ${o.number}?`)) return;
    const { error } = await supabase.from("orders").delete().eq("id", o.id!);
    if (error) {
      const d = describeError(error, "Delete order");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    }
    await orders.refetch();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Orders & Delivery</h1>
          <p className="text-sm text-muted-foreground">
            Turn a proposal/invoice into an order with a simple delivery checklist.
          </p>
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const csv = rowsToCsv(
                list.map((o) => ({
                  number: o.number,
                  business_name: o.businesses?.name,
                  amount: o.amount,
                  currency: o.currency,
                  status: o.status,
                  due_at: o.due_at,
                  fulfilled_at: o.fulfilled_at,
                  invoice_number: o.invoices?.number,
                })),
              );
              downloadCsv(csv, `orders-${new Date().toISOString().slice(0, 10)}.csv`);
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {(orders.isError || proposals.isError || invoices.isError) && (
        <ErrorBanner
          error={(orders.error ?? proposals.error ?? invoices.error) as Error}
          context="Orders"
          onRetry={() => {
            if (orders.isError) void orders.refetch();
            if (proposals.isError) void proposals.refetch();
            if (invoices.isError) void invoices.refetch();
          }}
        />
      )}

      {!orders.isLoading && !persisted && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-card p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Orders need the database update</p>
            <p className="text-muted-foreground">
              Apply migration <code>0006_orders_delivery.sql</code> (see{" "}
              <code>docs/GARE_DB_RUNBOOK.md</code>).
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">New order</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">From proposal (optional)</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={propId}
              onChange={(e) => onPickProp(e.target.value)}
            >
              <option value="">None</option>
              {proposals.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.businesses?.name ?? "No client"} — {p.title ?? p.mode}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">From invoice (optional)</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={invId}
              onChange={(e) => onPickInv(e.target.value)}
            >
              <option value="">None</option>
              {invoices.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} — {formatMoney(i.amount ?? 0, i.currency ?? "USD")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Amount</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
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
          <span className="mb-1 block text-muted-foreground">
            Delivery checklist (one per line)
          </span>
          <Textarea
            rows={4}
            value={checklistText}
            onChange={(e) => setChecklistText(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Notes</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="flex items-center gap-3">
          <Button onClick={create} disabled={busy || !persisted}>
            Create order
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["ALL", ...ORDER_STATUSES].map((s) => (
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

      <div className="space-y-3">
        {orders.isError ? (
          <ErrorBanner
            error={orders.error}
            context="Order list"
            onRetry={() => void orders.refetch()}
          />
        ) : orders.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === "ALL" ? "No orders yet" : `No ${filter.toLowerCase()} orders`}
            why={
              filter === "ALL"
                ? "Create an order from an accepted proposal above — it tracks the delivery checklist and due date."
                : "Nothing currently has this status. Change the status filter above to see other orders."
            }
            action={
              filter !== "ALL" ? (
                <Button size="sm" variant="outline" onClick={() => setFilter("ALL")}>
                  Show all
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to="/proposals">Open proposals</Link>
                </Button>
              )
            }
          />
        ) : (
          filtered.map((o) => {
            const c = toChecklist(o.checklist);
            const p = checklistProgress(c);
            return (
              <div key={o.id ?? o.number} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {o.number}
                      {o.businesses?.name ? ` · ${o.businesses.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(Number(o.amount) || 0, o.currency)} · {o.status}
                      {o.due_at ? ` · due ${new Date(o.due_at).toLocaleDateString()}` : ""}
                      {orderIsLate(o) ? " · LATE" : ""}
                      {o.invoices?.number ? ` · inv ${o.invoices.number}` : ""}
                    </p>
                  </div>
                  <select
                    className="rounded border bg-background px-2 py-1 text-sm"
                    value={o.status}
                    onChange={(e) => setStatus(o, e.target.value)}
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove(o)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground">
                  Checklist: {p.done}/{p.total} complete
                </div>
                <div className="space-y-1">
                  {c.map((it, idx) => (
                    <label key={idx} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={it.done}
                        onChange={(e) => {
                          const nc = c.slice();
                          nc[idx] = { label: it.label, done: e.target.checked };
                          updateChecklist(o, nc);
                        }}
                      />
                      <span className={it.done ? "text-muted-foreground line-through" : ""}>
                        {it.label}
                      </span>
                    </label>
                  ))}
                  {c.length === 0 && (
                    <p className="text-xs text-muted-foreground">No checklist items.</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
