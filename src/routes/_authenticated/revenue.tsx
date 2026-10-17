import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getRevenueLeaks } from "@/lib/leaks.functions";
import {
  deleteSubscription,
  getSubscriptions,
  saveSubscription,
  setSubscriptionStatus,
  type SubscriptionWithBusiness,
} from "@/lib/recurring.functions";
import {
  churnRate,
  overdueRenewals,
  recurringOpportunities,
  RECURRING_RULE,
  recurringSnapshot,
  SUBSCRIPTION_STATUSES,
  upcomingRenewals,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/recurring";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/revenue")({
  head: () => ({
    meta: [
      { title: "Recurring Revenue — GARE" },
      {
        name: "description",
        content: "Track the recurring services your clients pay for each month.",
      },
    ],
  }),
  component: RevenuePage,
});

type Draft = {
  id?: string | undefined;
  business_id: string;
  offer: string;
  status: SubscriptionStatus;
  monthly_value: string;
  currency: string;
  started_at: string;
  next_renewal_at: string;
  notes: string;
};

function emptyDraft(): Draft {
  return {
    business_id: "",
    offer: "",
    status: "proposed",
    monthly_value: "0",
    currency: "USD",
    started_at: "",
    next_renewal_at: "",
    notes: "",
  };
}

function draftFrom(s: Subscription): Draft {
  return {
    id: s.id,
    business_id: s.businessId ?? "",
    offer: s.offer,
    status: s.status,
    monthly_value: String(s.monthlyValue),
    currency: s.currency,
    started_at: s.startedAt ?? "",
    next_renewal_at: s.nextRenewalAt ?? "",
    notes: s.notes ?? "",
  };
}

function RevenuePage() {
  const qc = useQueryClient();
  const loadSubs = useServerFn(getSubscriptions);
  const loadLeaks = useServerFn(getRevenueLeaks);
  const upsert = useServerFn(saveSubscription);
  const remove = useServerFn(deleteSubscription);
  const setStatus = useServerFn(setSubscriptionStatus);

  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const subs = useQuery({ queryKey: ["subscriptions"], queryFn: () => loadSubs() });
  const leaks = useQuery({ queryKey: ["revenue-leaks"], queryFn: () => loadLeaks() });

  const rows = useMemo(() => subs.data ?? [], [subs.data]);
  const snapshot = useMemo(() => recurringSnapshot(rows), [rows]);
  const churn = useMemo(() => churnRate(rows), [rows]);
  const now = useMemo(() => new Date(), []);
  const overdue = useMemo(() => overdueRenewals(rows, now), [rows, now]);
  const upcoming = useMemo(() => upcomingRenewals(rows, now), [rows, now]);
  const opportunities = useMemo(
    () =>
      recurringOpportunities(
        (leaks.data ?? []).map((l) => ({
          dedupeKey: l.dedupe_key,
          businessId: l.business_id,
          label: l.label,
          suggestedOffer: l.suggested_offer,
          confidence: l.confidence,
          recurring: l.recurring,
          status: l.status,
        })),
      ),
    [leaks.data],
  );

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      upsert({
        data: {
          ...(d.id ? { id: d.id } : {}),
          business_id: d.business_id || null,
          offer: d.offer,
          status: d.status,
          monthly_value: Number(d.monthly_value) || 0,
          currency: d.currency || "USD",
          started_at: d.started_at || null,
          next_renewal_at: d.next_renewal_at || null,
          notes: d.notes || null,
        },
      }),
    onSuccess: () => {
      setDraft(null);
      setMessage("Subscription saved.");
      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e) => {
      const d = describeError(e, "Save subscription");
      setMessage(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Repeat className="h-5 w-5" /> Recurring revenue
        </h1>
        <p className="text-sm text-muted-foreground">{RECURRING_RULE}</p>
      </header>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {(subs.isError || leaks.isError) && (
        <ErrorBanner
          error={(subs.error ?? leaks.error) as Error}
          context="Recurring revenue"
          onRetry={() => {
            if (subs.isError) void subs.refetch();
            if (leaks.isError) void leaks.refetch();
          }}
        />
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR (active)" value={`${snapshot.mrr.toFixed(0)} ${snapshot.currency}`} />
        <Stat label="ARR" value={`${snapshot.arr.toFixed(0)} ${snapshot.currency}`} />
        <Stat
          label="Active / proposed"
          value={`${snapshot.activeCount} / ${snapshot.proposedCount}`}
        />
        <Stat label="Churn rate" value={churn == null ? "—" : `${Math.round(churn * 100)}%`} />
      </section>
      {(snapshot.proposedMonthlyValue > 0 || snapshot.pausedMonthlyValue > 0) && (
        <p className="text-xs text-muted-foreground">
          Not counted in MRR: proposed {snapshot.proposedMonthlyValue.toFixed(0)}{" "}
          {snapshot.currency}, paused {snapshot.pausedMonthlyValue.toFixed(0)} {snapshot.currency},
          churned {snapshot.churnedMonthlyValue.toFixed(0)} {snapshot.currency}.
          {snapshot.mixedCurrency &&
            " Active subscriptions use more than one currency — the sum is approximate."}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Renewals</h2>
          <span className="text-xs text-muted-foreground">
            {overdue.length} overdue · {upcoming.length} due within 30 days
          </span>
        </div>
        {(overdue.length > 0 || upcoming.length > 0) && (
          <div className="space-y-2">
            {overdue.map((s) => (
              <RenewalRow key={s.id ?? s.offer} sub={s} overdue />
            ))}
            {upcoming.map((s) => (
              <RenewalRow key={s.id ?? s.offer} sub={s} overdue={false} />
            ))}
          </div>
        )}
        {overdue.length === 0 && upcoming.length === 0 && (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            No active renewals in the next 30 days.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Recurring opportunities</h2>
          <span className="text-xs text-muted-foreground">
            {opportunities.length} from open leaks
          </span>
        </div>
        {opportunities.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            No open recurring leaks. Recurring offers come from measured problems that need ongoing
            work, like care plans and monitoring.
          </p>
        ) : (
          <div className="space-y-2">
            {opportunities.map((o) => (
              <article
                key={o.leakId}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm"
              >
                <span className="font-medium">{o.problemLabel}</span>
                {o.offer && <Badge variant="outline">{o.offer}</Badge>}
                <span className="text-xs text-muted-foreground">
                  confidence {Math.round(o.confidence * 100)}%
                </span>
                <span className="ml-auto flex gap-2">
                  {o.businessId && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/businesses/$id" params={{ id: o.businessId }}>
                        Open lead
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...emptyDraft(),
                        business_id: o.businessId ?? "",
                        offer: o.offer ?? o.problemLabel,
                      })
                    }
                  >
                    Add subscription
                  </Button>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Subscriptions</h2>
          <span className="text-xs text-muted-foreground">{rows.length} recorded</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setDraft(emptyDraft())}
          >
            Add subscription
          </Button>
        </div>

        {draft && (
          <SubscriptionForm
            draft={draft}
            setDraft={setDraft}
            onSave={() => saveMutation.mutate(draft)}
            onCancel={() => setDraft(null)}
            busy={saveMutation.isPending}
          />
        )}

        {subs.isError ? (
          <ErrorBanner
            error={subs.error}
            context="Subscriptions"
            onRetry={() => void subs.refetch()}
          />
        ) : subs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No subscriptions recorded yet"
            why="Add a retainer or care plan to start tracking MRR. Subscriptions are saved manually or seeded from recurring leaks on the Radar page."
            action={
              <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft())}>
                Add subscription
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {rows.map((s) => (
              <SubscriptionRowView
                key={s.id ?? `${s.offer}-${s.businessId}`}
                sub={s}
                onEdit={() => setDraft(draftFrom(s))}
                onStatus={(status) =>
                  setStatus({ data: { id: s.id!, status } })
                    .then(() => void qc.invalidateQueries({ queryKey: ["subscriptions"] }))
                    .catch((e) => setMessage(e instanceof Error ? e.message : "Could not update."))
                }
                onDelete={() => {
                  remove({ data: { id: s.id! } })
                    .then(() => {
                      setMessage("Subscription removed.");
                      void qc.invalidateQueries({ queryKey: ["subscriptions"] });
                    })
                    .catch((e) => setMessage(e instanceof Error ? e.message : "Could not remove."));
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function RenewalRow({ sub, overdue }: { sub: Subscription; overdue: boolean }) {
  return (
    <article className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
      <Badge variant={overdue ? "destructive" : "secondary"}>
        {overdue ? "overdue" : "renewing"}
      </Badge>
      <span className="font-medium">{sub.offer}</span>
      <span className="text-xs text-muted-foreground">{sub.nextRenewalAt}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {sub.monthlyValue.toFixed(0)} {sub.currency}/mo
      </span>
    </article>
  );
}

function SubscriptionRowView({
  sub,
  onEdit,
  onStatus,
  onDelete,
}: {
  sub: SubscriptionWithBusiness;
  onEdit: () => void;
  onStatus: (status: SubscriptionStatus) => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
      <span className="font-medium">{sub.offer}</span>
      {sub.businessName && <span className="text-muted-foreground">· {sub.businessName}</span>}
      <span className="text-xs text-muted-foreground">
        {sub.monthlyValue.toFixed(0)} {sub.currency}/mo
      </span>
      <span className="ml-auto flex items-center gap-2">
        {sub.businessId && (
          <Link to="/businesses/$id" params={{ id: sub.businessId }} className="text-xs underline">
            lead
          </Link>
        )}
        <select
          value={sub.status}
          onChange={(e) => onStatus(e.target.value as SubscriptionStatus)}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        >
          {SUBSCRIPTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          Delete
        </Button>
      </span>
    </article>
  );
}

function SubscriptionForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  function set<K extends keyof Draft>(key: K, v: Draft[K]) {
    setDraft({ ...draft, [key]: v });
  }
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">
        {draft.id ? "Edit subscription" : "Add subscription"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Offer / service</Label>
          <Input
            value={draft.offer}
            placeholder="Website care plan"
            onChange={(e) => set("offer", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <select
            value={draft.status}
            onChange={(e) => set("status", e.target.value as SubscriptionStatus)}
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Monthly value</Label>
          <Input
            type="number"
            value={draft.monthly_value}
            onChange={(e) => set("monthly_value", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Input value={draft.currency} onChange={(e) => set("currency", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Business id (optional)</Label>
          <Input
            value={draft.business_id}
            placeholder="uuid"
            onChange={(e) => set("business_id", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Started (YYYY-MM-DD)</Label>
          <Input value={draft.started_at} onChange={(e) => set("started_at", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Next renewal (YYYY-MM-DD)</Label>
          <Input
            value={draft.next_renewal_at}
            onChange={(e) => set("next_renewal_at", e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">Notes</Label>
          <Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !draft.offer.trim()} onClick={onSave}>
          Save subscription
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
