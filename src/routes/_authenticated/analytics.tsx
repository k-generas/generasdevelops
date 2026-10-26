import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Download, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  computeAnalytics,
  type AnalyticsBusiness,
  type AnalyticsInvoice,
  type AnalyticsProposal,
  type CurrencyTotal,
} from "@/lib/analytics";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — GARE" },
      {
        name: "description",
        content: "Weekly leads, proposals, wins and collected cash across the pipeline.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const RANGES = [4, 12, 26, 52] as const;

const ACTIVITY_CONFIG = {
  leads: { label: "Leads", color: "var(--chart-1)" },
  proposals: { label: "Proposals", color: "var(--chart-4)" },
  accepted: { label: "Accepted", color: "var(--chart-2)" },
} satisfies ChartConfig;

const CASH_CONFIG = {
  cash: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig;

async function collectPages<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < 1000) break;
  }
  return all;
}

async function loadAnalyticsData() {
  const [businesses, proposals, invoices] = await Promise.all([
    collectPages<AnalyticsBusiness>((from, to) =>
      supabase
        .from("businesses")
        .select("created_at,status,website,website_checked_at,business_status,last_investigated_at")
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    collectPages<AnalyticsProposal>((from, to) =>
      supabase
        .from("proposals")
        .select("business_id,created_at,updated_at,status,price,currency,sent_at")
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    collectPages<AnalyticsInvoice>((from, to) =>
      supabase
        .from("invoices")
        .select("amount,currency,status,paid_at")
        .order("issued_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
  ]);
  return { businesses, proposals, invoices };
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en")}`;
  }
}

function MoneyList({ rows }: { rows: CurrencyTotal[] }) {
  if (!rows.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {rows.map((row) => (
        <div key={row.currency}>{formatMoney(row.amount, row.currency)}</div>
      ))}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AnalyticsPage() {
  const [weeks, setWeeks] = useState<number>(12);
  const dataQ = useQuery({
    queryKey: ["analytics-data"],
    queryFn: loadAnalyticsData,
    staleTime: 60_000,
  });

  const snap = useMemo(
    () =>
      dataQ.data
        ? computeAnalytics({
            businesses: dataQ.data.businesses,
            proposals: dataQ.data.proposals,
            invoices: dataQ.data.invoices,
            weeks,
          })
        : null,
    [dataQ.data, weeks],
  );

  function exportSeries() {
    if (!snap) return;
    const rows = snap.series.map((point) => ({
      week_start: point.start.slice(0, 10),
      leads: point.leads,
      proposals: point.proposals,
      accepted: point.accepted,
      cash_currency: snap.currency,
      cash: point.cash,
      payments: point.payments,
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(rowsToCsv(rows), `gare-analytics-${snap.weeks}w-${stamp}.csv`);
  }

  const empty =
    !!snap &&
    snap.totals.leads === 0 &&
    snap.totals.proposals === 0 &&
    snap.totals.sent === 0 &&
    snap.totals.accepted === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Analytics</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <TrendingUp className="h-6 w-6 text-primary" />
            Pipeline trends
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly activity for the last {weeks} weeks. Win rate and currency totals are all-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Last {w} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportSeries} disabled={!snap}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      {dataQ.isError && (
        <ErrorBanner
          error={dataQ.error}
          context="Loading analytics"
          onRetry={() => void dataQ.refetch()}
        />
      )}

      {dataQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      ) : empty ? (
        <EmptyState
          title="No pipeline data yet"
          why="Analytics fills in as you discover leads, send proposals and collect payments. Start with a discovery run."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/discover">Go to Discover</Link>
            </Button>
          }
        />
      ) : snap ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={`Leads · ${weeks}w`}
              value={snap.range.leads}
              hint={`${snap.totals.leads} all-time`}
            />
            <Kpi
              label={`Proposals · ${weeks}w`}
              value={snap.range.proposals}
              hint={`${snap.totals.sent} sent all-time`}
            />
            <Kpi
              label={`Accepted · ${weeks}w`}
              value={snap.range.accepted}
              hint={`${snap.totals.winRate ?? "—"}% win rate all-time`}
            />
            <Kpi
              label={`Cash · ${weeks}w`}
              value={formatMoney(snap.range.cash, snap.currency)}
              hint={`${snap.range.payments} payment${snap.range.payments === 1 ? "" : "s"}`}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Weekly activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={ACTIVITY_CONFIG} className="h-64 w-full">
                  <LineChart data={snap.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="leads"
                      stroke="var(--color-leads)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="proposals"
                      stroke="var(--color-proposals)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="accepted"
                      stroke="var(--color-accepted)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {Object.entries(ACTIVITY_CONFIG).map(([key, item]) => (
                    <span key={key} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conversion funnel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snap.funnel.map((stage) => (
                  <div key={stage.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{stage.label}</span>
                      <span className="text-muted-foreground">
                        {stage.count} · {stage.percentOfLeads}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, stage.percentOfLeads)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Avg deal</p>
                    <p className="font-medium">
                      {snap.totals.avgDeal == null
                        ? "—"
                        : formatMoney(snap.totals.avgDeal, snap.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verified no site</p>
                    <p className="font-medium">{snap.totals.noWebsite}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cash collected per week ({snap.currency})</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={CASH_CONFIG} className="h-56 w-full">
                  <BarChart data={snap.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="cash" fill="var(--color-cash)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Money by currency</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <MoneyList rows={snap.cashByCurrency} />
                </div>
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">Won (accepted proposals)</p>
                  <MoneyList rows={snap.wonByCurrency} />
                </div>
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground">Open pipeline</p>
                  <MoneyList rows={snap.pipelineByCurrency} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Week by week</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Week</th>
                    <th className="py-2 pr-3 text-right">Leads</th>
                    <th className="py-2 pr-3 text-right">Proposals</th>
                    <th className="py-2 pr-3 text-right">Accepted</th>
                    <th className="py-2 pr-3 text-right">Payments</th>
                    <th className="py-2 text-right">Cash ({snap.currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snap.series].reverse().map((point) => (
                    <tr key={point.start} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">{point.label}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{point.leads}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{point.proposals}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{point.accepted}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{point.payments}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatMoney(point.cash, snap.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
