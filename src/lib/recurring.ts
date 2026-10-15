// Recurring Revenue Builder (Feature C).
//
// Turns the owner's recorded recurring services into a tracked pipeline: which
// clients are on a retainer, what they are worth per month, what is only proposed,
// what was lost, and what renews next. Numbers come only from recorded
// subscriptions — MRR is a record, not a forecast.
//
// Money states are kept apart: proposed value is never counted as active MRR, and
// delivery value is never mixed with the owner's own cut (see partners.ts).

export type SubscriptionStatus = "proposed" | "active" | "paused" | "churned";

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "proposed",
  "active",
  "paused",
  "churned",
];

export type Subscription = {
  id?: string;
  businessId: string | null;
  businessName?: string | null;
  offer: string;
  status: SubscriptionStatus;
  monthlyValue: number;
  currency: string;
  startedAt: string | null;
  nextRenewalAt: string | null;
  canceledAt: string | null;
  notes: string | null;
  source: string | null;
};

export const RECURRING_RULE =
  "MRR and ARR are computed only from subscriptions you have recorded as active. They are not a forecast and say nothing about future delivery.";

export type RecurringSnapshot = {
  activeCount: number;
  proposedCount: number;
  pausedCount: number;
  churnedCount: number;
  /** Sum of active monthly values — the recorded MRR. */
  mrr: number;
  /** mrr * 12. */
  arr: number;
  /** Proposed (not yet won) monthly value — tracked separately from MRR. */
  proposedMonthlyValue: number;
  pausedMonthlyValue: number;
  /** Monthly value that churned (for reference, never subtracted from MRR). */
  churnedMonthlyValue: number;
  currency: string;
  /** True when active subscriptions use more than one currency (sum is then rough). */
  mixedCurrency: boolean;
};

function sumActive(rows: Subscription[], status: SubscriptionStatus): number {
  return rows.filter((s) => s.status === status).reduce((n, s) => n + s.monthlyValue, 0);
}

export function recurringSnapshot(rows: Subscription[]): RecurringSnapshot {
  const active = rows.filter((s) => s.status === "active");
  const currencies = new Set(active.map((s) => s.currency));
  const mrr = sumActive(rows, "active");
  return {
    activeCount: active.length,
    proposedCount: rows.filter((s) => s.status === "proposed").length,
    pausedCount: rows.filter((s) => s.status === "paused").length,
    churnedCount: rows.filter((s) => s.status === "churned").length,
    mrr,
    arr: mrr * 12,
    proposedMonthlyValue: sumActive(rows, "proposed"),
    pausedMonthlyValue: sumActive(rows, "paused"),
    churnedMonthlyValue: sumActive(rows, "churned"),
    currency: active[0]?.currency ?? rows[0]?.currency ?? "USD",
    mixedCurrency: currencies.size > 1,
  };
}

// Churn rate from decided subscriptions: churned / (active + churned). Null until
// there is at least one active or churned record, so it never reports a fake 0%.
export function churnRate(rows: Subscription[]): number | null {
  const active = rows.filter((s) => s.status === "active").length;
  const churned = rows.filter((s) => s.status === "churned").length;
  const decided = active + churned;
  return decided > 0 ? churned / decided : null;
}

function daysUntil(iso: string, now: Date): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

// Active subscriptions renewing within `days` (or already due).
export function upcomingRenewals(rows: Subscription[], now: Date, days = 30): Subscription[] {
  return rows
    .filter((s) => s.status === "active" && s.nextRenewalAt)
    .filter((s) => {
      const d = daysUntil(s.nextRenewalAt as string, now);
      return d <= days;
    })
    .sort(
      (a, b) =>
        new Date(a.nextRenewalAt as string).getTime() -
        new Date(b.nextRenewalAt as string).getTime(),
    );
}

export function overdueRenewals(rows: Subscription[], now: Date): Subscription[] {
  return rows
    .filter((s) => s.status === "active" && s.nextRenewalAt)
    .filter((s) => daysUntil(s.nextRenewalAt as string, now) < 0)
    .sort(
      (a, b) =>
        new Date(a.nextRenewalAt as string).getTime() -
        new Date(b.nextRenewalAt as string).getTime(),
    );
}

export type RecurringOpportunity = {
  leakId: string;
  businessId: string | null;
  offer: string | null;
  problemLabel: string;
  confidence: number;
  businessName: string | null;
};

// Minimal shape shared by the pure RevenueLeak and the stored revenue_leaks row.
export type RecurringLeakInput = {
  dedupeKey: string;
  businessId: string | null;
  label: string;
  suggestedOffer: string | null;
  confidence: number;
  recurring: boolean;
  status: string;
};

// Open leaks whose matching offer is recurring are recurring-revenue opportunities.
export function recurringOpportunities(leaks: RecurringLeakInput[]): RecurringOpportunity[] {
  return leaks
    .filter((l) => l.status === "open" && l.recurring)
    .map((l) => ({
      leakId: l.dedupeKey,
      businessId: l.businessId,
      offer: l.suggestedOffer,
      problemLabel: l.label,
      confidence: l.confidence,
      businessName: null,
    }));
}
