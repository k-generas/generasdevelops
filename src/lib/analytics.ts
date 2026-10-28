// Time-series + funnel analytics. Pure so the numbers are easy to test and the
// page only has to render what this returns.
export const WEEK_MS = 7 * 86_400_000;

export type AnalyticsBusiness = {
  created_at: string;
  status?: string | null;
  website?: string | null;
  website_checked_at?: string | null;
  business_status?: string | null;
  last_investigated_at?: string | null;
};

export type AnalyticsProposal = {
  business_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  price: number | null;
  currency: string | null;
  sent_at?: string | null;
};

export type AnalyticsInvoice = {
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
};

export type AnalyticsPayment = {
  amount: number;
  currency: string;
  received_at: string;
};

export type WeekPoint = {
  start: string;
  label: string;
  leads: number;
  proposals: number;
  accepted: number;
  cash: number;
  payments: number;
};

export type CurrencyTotal = {
  currency: string;
  amount: number;
};

export type FunnelStage = {
  key: "leads" | "investigated" | "proposed" | "accepted";
  label: string;
  count: number;
  percentOfLeads: number;
};

export type AnalyticsSnapshot = {
  weeks: number;
  series: WeekPoint[];
  funnel: FunnelStage[];
  currency: string;
  range: {
    leads: number;
    proposals: number;
    accepted: number;
    cash: number;
    payments: number;
  };
  totals: {
    leads: number;
    noWebsite: number;
    investigated: number;
    proposals: number;
    sent: number;
    accepted: number;
    rejected: number;
    winRate: number | null;
    avgDeal: number | null;
  };
  wonByCurrency: CurrencyTotal[];
  pipelineByCurrency: CurrencyTotal[];
  cashByCurrency: CurrencyTotal[];
};

const ACCEPTED = "ACCEPTED";
const REJECTED = "REJECTED";
const PIPELINE = new Set(["SENT", "REPLIED", "NEGOTIATING"]);

function currencyOf(value: string | null | undefined): string {
  return (value || "USD").toUpperCase();
}

export function startOfWeekUtc(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const day = d.getUTCDay(); // 0 = Sunday
  const delta = (day + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - delta);
  return d;
}

export function weekStarts(count: number, now: Date = new Date()): Date[] {
  const current = startOfWeekUtc(now);
  const weeks = Math.max(1, Math.min(104, Math.floor(count)));
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current);
    d.setUTCDate(d.getUTCDate() - (weeks - 1 - i) * 7);
    return d;
  });
}

function weekLabel(start: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function currencyTotals(map: Map<string, number>): CurrencyTotal[] {
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

function addTo(map: Map<string, number>, currency: string, amount: number) {
  map.set(currency, (map.get(currency) ?? 0) + amount);
}

function dominantCurrency(
  proposals: AnalyticsProposal[],
  invoices: AnalyticsInvoice[],
  payments?: AnalyticsPayment[],
): string {
  const counts = new Map<string, number>();
  for (const p of proposals) addTo(counts, currencyOf(p.currency), 1);
  for (const i of invoices) addTo(counts, currencyOf(i.currency), 1);
  for (const p of payments ?? []) addTo(counts, currencyOf(p.currency), 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0]?.[1] ?? 0;
  if (top > 0 && (counts.get("USD") ?? 0) === top) return "USD";
  return ranked[0]?.[0] ?? "USD";
}

export function computeAnalytics(input: {
  businesses: AnalyticsBusiness[];
  proposals: AnalyticsProposal[];
  invoices: AnalyticsInvoice[];
  payments?: AnalyticsPayment[] | undefined;
  weeks: number;
  now?: Date;
}): AnalyticsSnapshot {
  const now = input.now ?? new Date();
  const starts = weekStarts(input.weeks, now);
  const oldest = starts[0]!.getTime();
  const newest = starts[starts.length - 1]!.getTime() + WEEK_MS;
  const bucketOf = (iso: string | null | undefined): number | null => {
    const t = timeOf(iso);
    if (t == null || t < oldest || t >= newest) return null;
    return Math.floor((startOfWeekUtc(new Date(t)).getTime() - oldest) / WEEK_MS);
  };

  const currency = dominantCurrency(input.proposals, input.invoices, input.payments);
  const series: WeekPoint[] = starts.map((start) => ({
    start: start.toISOString(),
    label: weekLabel(start),
    leads: 0,
    proposals: 0,
    accepted: 0,
    cash: 0,
    payments: 0,
  }));

  for (const b of input.businesses) {
    const i = bucketOf(b.created_at);
    if (i != null) series[i]!.leads += 1;
  }
  for (const p of input.proposals) {
    const created = bucketOf(p.created_at);
    if (created != null) series[created]!.proposals += 1;
    if (p.status === ACCEPTED) {
      const accepted = bucketOf(p.updated_at);
      if (accepted != null) series[accepted]!.accepted += 1;
    }
  }
  if (input.payments) {
    for (const payment of input.payments) {
      const i = bucketOf(payment.received_at);
      if (i == null) continue;
      series[i]!.payments += 1;
      if (currencyOf(payment.currency) === currency) {
        series[i]!.cash += Number(payment.amount) || 0;
      }
    }
  } else {
    for (const inv of input.invoices) {
      if (inv.status !== "PAID") continue;
      const i = bucketOf(inv.paid_at);
      if (i == null) continue;
      series[i]!.payments += 1;
      if (currencyOf(inv.currency) === currency) series[i]!.cash += Number(inv.amount) || 0;
    }
  }
  for (const point of series) point.cash = Math.round(point.cash * 100) / 100;

  const investigated = input.businesses.filter(
    (b) => b.status === "investigated" || !!b.last_investigated_at,
  ).length;
  const acceptedRows = input.proposals.filter((p) => p.status === ACCEPTED);
  const rejected = input.proposals.filter((p) => p.status === REJECTED).length;
  const decided = acceptedRows.length + rejected;
  const sent = input.proposals.filter(
    (p) => !!p.sent_at || PIPELINE.has(p.status) || p.status === ACCEPTED || p.status === REJECTED,
  ).length;

  const wonByCurrency = new Map<string, number>();
  for (const p of acceptedRows) {
    if (typeof p.price === "number" && Number.isFinite(p.price)) {
      addTo(wonByCurrency, currencyOf(p.currency), p.price);
    }
  }

  const pipelineByCurrency = new Map<string, number>();
  for (const p of input.proposals) {
    if (!PIPELINE.has(p.status)) continue;
    if (typeof p.price === "number" && Number.isFinite(p.price)) {
      addTo(pipelineByCurrency, currencyOf(p.currency), p.price);
    }
  }

  const cashByCurrency = new Map<string, number>();
  if (input.payments) {
    for (const payment of input.payments) {
      addTo(cashByCurrency, currencyOf(payment.currency), Number(payment.amount) || 0);
    }
  } else {
    for (const inv of input.invoices) {
      if (inv.status !== "PAID") continue;
      addTo(cashByCurrency, currencyOf(inv.currency), Number(inv.amount) || 0);
    }
  }

  const leads = input.businesses.length;
  const proposedBusinesses = new Set(input.proposals.map((p) => p.business_id)).size;
  const acceptedBusinesses = new Set(acceptedRows.map((p) => p.business_id)).size;
  const funnel: FunnelStage[] = [
    { key: "leads", label: "Leads", count: leads },
    { key: "investigated", label: "Investigated", count: investigated },
    { key: "proposed", label: "Proposed", count: proposedBusinesses },
    { key: "accepted", label: "Accepted", count: acceptedBusinesses },
  ].map((stage) => ({
    ...stage,
    percentOfLeads: leads > 0 ? Math.round((stage.count / leads) * 100) : 0,
  })) as FunnelStage[];

  const acceptedInCurrency = acceptedRows.filter((p) => currencyOf(p.currency) === currency);
  const priced = acceptedInCurrency.filter(
    (p) => typeof p.price === "number" && Number.isFinite(p.price),
  );
  const avgDeal =
    priced.length > 0
      ? Math.round((priced.reduce((sum, p) => sum + (p.price ?? 0), 0) / priced.length) * 100) / 100
      : null;

  const range = {
    leads: series.reduce((sum, p) => sum + p.leads, 0),
    proposals: series.reduce((sum, p) => sum + p.proposals, 0),
    accepted: series.reduce((sum, p) => sum + p.accepted, 0),
    cash: Math.round(series.reduce((sum, p) => sum + p.cash, 0) * 100) / 100,
    payments: series.reduce((sum, p) => sum + p.payments, 0),
  };

  return {
    weeks: series.length,
    series,
    funnel,
    currency,
    range,
    totals: {
      leads,
      noWebsite: input.businesses.filter((b) => !b.website && !!b.website_checked_at).length,
      investigated,
      proposals: input.proposals.length,
      sent,
      accepted: acceptedRows.length,
      rejected,
      winRate: decided > 0 ? Math.round((acceptedRows.length / decided) * 100) : null,
      avgDeal,
    },
    wonByCurrency: currencyTotals(wonByCurrency),
    pipelineByCurrency: currencyTotals(pipelineByCurrency),
    cashByCurrency: currencyTotals(cashByCurrency),
  };
}
