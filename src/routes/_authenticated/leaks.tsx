import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeFeasibility,
  DEFAULT_HOURS_BY_EFFORT,
  type FeasibilityAssumptions,
} from "@/lib/feasibility";
import {
  getFeasibilityDefaults,
  getRevenueLeaks,
  refreshRevenueLeaks,
  saveFeasibilityDefaults,
  setRevenueLeakStatus,
  type LeakWithBusiness,
} from "@/lib/leaks.functions";
import { createKitTasks } from "@/lib/offer-kit.functions";
import { useOffers } from "@/lib/offers.hooks";
import { REVENUE_LEAK_RULE, type LeakStatus } from "@/lib/revenue-leaks";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import type { Effort } from "@/lib/service-match";

export const Route = createFileRoute("/_authenticated/leaks")({
  head: () => ({
    meta: [
      { title: "Revenue Leaks — GARE" },
      {
        name: "description",
        content: "Evidence-backed gaps in your leads' public presence that your offers can close.",
      },
    ],
  }),
  component: LeaksPage,
});

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_VARIANT: Record<string, "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function LeaksPage() {
  const qc = useQueryClient();
  const load = useServerFn(getRevenueLeaks);
  const refresh = useServerFn(refreshRevenueLeaks);
  const changeStatus = useServerFn(setRevenueLeakStatus);
  const loadDefaults = useServerFn(getFeasibilityDefaults);
  const saveDefaults = useServerFn(saveFeasibilityDefaults);
  const planDelivery = useServerFn(createKitTasks);
  const { data: offersResult } = useOffers();

  const [statusFilter, setStatusFilter] = useState<"all" | LeakStatus>("open");
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [message, setMessage] = useState<string | null>(null);

  const leaks = useQuery({ queryKey: ["revenue-leaks"], queryFn: () => load() });
  const defaults = useQuery({ queryKey: ["feasibility-defaults"], queryFn: () => loadDefaults() });

  const refreshMutation = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      setMessage(
        r.applied
          ? `Scan complete: ${r.created} new, ${r.updated} refreshed across ${r.businesses} businesses.`
          : (r.error ?? "Could not refresh."),
      );
      void qc.invalidateQueries({ queryKey: ["revenue-leaks"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : "Refresh failed."),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: LeakStatus }) =>
      changeStatus({ data: { id: vars.id, status: vars.status, note: null } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["revenue-leaks"] }),
    onError: (e) => setMessage(e instanceof Error ? e.message : "Update failed."),
  });

  const planMutation = useMutation({
    mutationFn: (vars: { offer: string; businessId: string }) =>
      planDelivery({ data: { offer: vars.offer, business_id: vars.businessId } }),
    onSuccess: (r) => {
      setMessage(
        r.total === 0
          ? "No delivery checklist for that offer yet — build one in the Offer studio."
          : `Delivery plan: ${r.created} task${r.created === 1 ? "" : "s"} created, ${r.skipped} already planned.`,
      );
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => setMessage(e instanceof Error ? e.message : "Could not plan delivery."),
  });

  const rows = useMemo(() => {
    const list = leaks.data ?? [];
    return list
      .filter((l) => statusFilter === "all" || l.status === statusFilter)
      .filter((l) => severityFilter === "all" || l.severity === severityFilter)
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
          Number(a.hypothesis) - Number(b.hypothesis) ||
          Number(b.confidence) - Number(a.confidence),
      );
  }, [leaks.data, statusFilter, severityFilter]);

  const summary = useMemo(() => {
    const list = leaks.data ?? [];
    return {
      open: list.filter((l) => l.status === "open").length,
      actionable: list.filter((l) => l.status === "open" && !l.hypothesis).length,
      dismissed: list.filter((l) => l.status === "dismissed").length,
      resolved: list.filter((l) => l.status === "resolved").length,
    };
  }, [leaks.data]);

  const offerPrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of offersResult?.offers ?? []) {
      if (o.default_price != null) map.set(o.name, o.default_price);
    }
    return map;
  }, [offersResult]);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <AlertTriangle className="h-5 w-5" /> Revenue Leaks
        </h1>
        <p className="text-sm text-muted-foreground">
          Concrete gaps detected in your leads' public presence, each with its evidence and an offer
          that addresses it. {REVENUE_LEAK_RULE}
        </p>
      </header>

      {leaks.isError && (
        <ErrorBanner
          error={leaks.error}
          context="Revenue leaks"
          onRetry={() => void leaks.refetch()}
        />
      )}
      {defaults.isError && (
        <ErrorBanner
          error={defaults.error}
          context="Profit assumptions"
          onRetry={() => void defaults.refetch()}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{summary.open} open</span>
        <span>· {summary.actionable} actionable</span>
        <span>· {summary.dismissed} dismissed</span>
        <span>· {summary.resolved} resolved</span>
        <span className="ml-auto">
          <Button
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending ? "Scanning…" : "Refresh leaks"}
          </Button>
        </span>
      </div>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      <AssumptionsPanel
        defaults={defaults.data}
        onSave={async (a) => {
          try {
            await saveDefaults({ data: a });
            setMessage("Profit assumptions saved.");
            void qc.invalidateQueries({ queryKey: ["feasibility-defaults"] });
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not save assumptions.");
          }
        }}
      />

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="open">Open</option>
            <option value="dismissed">Dismissed</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Severity
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>

      {leaks.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading leaks…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No leaks match this filter"
          why="Leaks are derived from saved businesses that have been investigated. Run a scan on the Radar page or investigate leads on the Businesses page, then press 'Refresh leaks' above."
          action={
            <div className="flex justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/radar">Open Radar</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/businesses">Investigate leads</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((leak) => (
            <LeakCard
              key={leak.id}
              leak={leak}
              assumptions={defaults.data}
              price={leak.suggested_offer ? (offerPrices.get(leak.suggested_offer) ?? 0) : 0}
              onStatus={(status) => statusMutation.mutate({ id: leak.id, status })}
              onPlanDelivery={(offer) =>
                planMutation.mutate({ offer, businessId: leak.business_id })
              }
              busy={statusMutation.isPending || planMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssumptionsPanel({
  defaults,
  onSave,
}: {
  defaults: FeasibilityAssumptions | undefined;
  onSave: (a: FeasibilityAssumptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FeasibilityAssumptions | null>(null);
  const value = draft ?? defaults ?? null;

  function set<K extends keyof FeasibilityAssumptions>(key: K, v: FeasibilityAssumptions[K]) {
    if (!value) return;
    setDraft({ ...value, [key]: v });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
        <span className="text-muted-foreground">
          Profit &amp; delivery assumptions drive the feasibility check on each leak.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            setDraft(defaults ?? null);
            setOpen(true);
          }}
        >
          Edit assumptions
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Profit &amp; delivery assumptions</h2>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {!value ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Currency</Label>
              <Input value={value.currency} onChange={(e) => set("currency", e.target.value)} />
            </div>
            <NumField
              label="Internal cost / hour"
              value={value.internalHourlyCost}
              onChange={(v) => set("internalHourlyCost", v)}
            />
            <NumField
              label="Available h / week"
              value={value.availableHoursPerWeek}
              onChange={(v) => set("availableHoursPerWeek", v)}
            />
            <NumField
              label="Committed h / week"
              value={value.committedHoursPerWeek}
              onChange={(v) => set("committedHoursPerWeek", v)}
            />
            <NumField
              label="Monthly operating cost"
              value={value.monthlyOperatingCost}
              onChange={(v) => set("monthlyOperatingCost", v)}
            />
            <NumField
              label="Acquisition cost"
              value={value.acquisitionCost}
              onChange={(v) => set("acquisitionCost", v)}
            />
            <NumField
              label="Payment terms (days)"
              value={value.paymentTermsDays}
              onChange={(v) => set("paymentTermsDays", v)}
            />
            <NumField
              label="Delivery lead (months)"
              value={value.deliveryMonths}
              onChange={(v) => set("deliveryMonths", v)}
            />
            <NumField
              label="Available cash"
              value={value.availableCash ?? 0}
              onChange={(v) => set("availableCash", v)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={() => {
                onSave(value);
                setOpen(false);
              }}
            >
              Save assumptions
            </Button>
            <span className="text-xs text-muted-foreground">
              Win probability is not stored here — only set it when evidence supports it.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function LeakCard({
  leak,
  assumptions,
  price,
  onStatus,
  onPlanDelivery,
  busy,
}: {
  leak: LeakWithBusiness;
  assumptions: FeasibilityAssumptions | undefined;
  price: number;
  onStatus: (status: LeakStatus) => void;
  onPlanDelivery: (offer: string) => void;
  busy: boolean;
}) {
  const [showProfit, setShowProfit] = useState(false);
  const effort = (leak.effort as Effort | null) ?? "medium";
  const hours = DEFAULT_HOURS_BY_EFFORT[effort];
  const feasibility = useMemo(() => {
    if (!assumptions) return null;
    return computeFeasibility({
      ...assumptions,
      proposedPrice: price,
      estimatedHours: hours,
      recurringMonthlyPrice: leak.recurring ? assumptions.recurringMonthlyPrice : 0,
    });
  }, [assumptions, price, hours, leak.recurring]);

  return (
    <article className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={SEVERITY_VARIANT[leak.severity] ?? "outline"}>{leak.severity}</Badge>
        <h2 className="font-semibold">{leak.label}</h2>
        {leak.hypothesis && <Badge variant="outline">hypothesis</Badge>}
        {leak.status !== "open" && <Badge variant="secondary">{leak.status}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {Math.round(Number(leak.confidence) * 100)}% confidence
        </span>
      </div>

      <p className="text-sm">
        {leak.business_name ? (
          <Link
            to="/businesses/$id"
            params={{ id: leak.business_id }}
            className="font-medium hover:underline"
          >
            {leak.business_name}
          </Link>
        ) : (
          "Unknown business"
        )}
        {leak.business_relevance ? (
          <span className="text-muted-foreground"> — {leak.business_relevance}</span>
        ) : null}
      </p>

      <p className="text-xs text-muted-foreground">
        Evidence: {leak.source ?? "unknown"}
        {leak.observed_at ? ` · observed ${new Date(leak.observed_at).toLocaleDateString()}` : ""}
        {leak.evidence_url ? (
          <>
            {" · "}
            <a href={leak.evidence_url} target="_blank" rel="noreferrer" className="underline">
              source
            </a>
          </>
        ) : null}
      </p>
      {leak.limitation && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Limitation: {leak.limitation}</p>
      )}

      <p className="text-sm">
        <span className="font-medium">Suggested offer: </span>
        {leak.suggested_offer ?? "none yet"}
        {leak.suggested_offer && (
          <span className="text-muted-foreground">
            {" "}
            · {effort} effort{leak.recurring ? " · recurring" : ""}
          </span>
        )}
      </p>
      {leak.next_step && <p className="text-sm text-muted-foreground">Next: {leak.next_step}</p>}

      {showProfit && feasibility && (
        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
          <p className="font-medium">
            Feasibility for {leak.suggested_offer ?? "this offer"} at {price || 0}{" "}
            {feasibility.currency} ({hours} h est.)
          </p>
          {feasibility.scenarios.map((s) => (
            <p key={s.name} className="flex flex-wrap gap-x-3">
              <span className="w-10 font-medium capitalize">{s.name}</span>
              <span>
                net {s.netContribution.toFixed(2)} {feasibility.currency}
              </span>
              <span>margin {s.margin == null ? "n/a" : `${Math.round(s.margin * 100)}%`}</span>
              <span>{s.hours.toFixed(0)} h</span>
              <span>first payment ~{s.timeToFirstPaymentDays}d</span>
            </p>
          ))}
          {feasibility.flags.length > 0 ? (
            <ul className="list-disc pl-4 text-amber-700 dark:text-amber-400">
              {feasibility.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No feasibility warnings.</p>
          )}
          {price === 0 && (
            <p className="text-muted-foreground">
              No default price on this offer — set one on the Offers catalog for a real profit
              check.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to="/businesses/$id" params={{ id: leak.business_id }}>
            Open lead
          </Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowProfit((v) => !v)}>
          {showProfit ? "Hide profit check" : "Profit check"}
        </Button>
        {leak.suggested_offer && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onPlanDelivery(leak.suggested_offer as string)}
          >
            Plan delivery
          </Button>
        )}
        {leak.status !== "resolved" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("resolved")}>
            Resolve
          </Button>
        )}
        {leak.status !== "dismissed" ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("dismissed")}>
            Dismiss
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus("open")}>
            Reopen
          </Button>
        )}
      </div>
    </article>
  );
}
