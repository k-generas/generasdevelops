import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Compass,
  FileText,
  Globe,
  ListChecks,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { summarizeOutcomes } from "@/lib/outcomes";
import { Button } from "@/components/ui/button";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — GARE" },
      {
        name: "description",
        content: "Overview of your pipeline: leads, investigations, proposals and tasks.",
      },
    ],
  }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const businesses = useQuery({
    queryKey: ["dash-businesses"],
    queryFn: async () =>
      (
        await supabase
          .from("businesses")
          .select("id,name,category,address,website,website_checked_at,status,score,created_at")
          .order("created_at", { ascending: false })
          .limit(1000)
      ).data ?? [],
  });
  const proposals = useQuery({
    queryKey: ["dash-proposals"],
    queryFn: async () =>
      (
        await supabase
          .from("proposals")
          .select("id,title,mode,status,price,currency,updated_at,businesses(name)")
          .order("updated_at", { ascending: false })
          .limit(50)
      ).data ?? [],
  });
  const tasks = useQuery({
    queryKey: ["dash-tasks"],
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("id,title,due_at,created_at,businesses(name)")
          .eq("status", "open")
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(6)
      ).data ?? [],
  });
  const overdueQ = useQuery({
    queryKey: ["dash-overdue"],
    queryFn: async () => {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .not("due_at", "is", null)
        .lt("due_at", new Date().toISOString());
      return count ?? 0;
    },
  });
  const failedRuns = useQuery({
    queryKey: ["dash-failed-runs"],
    queryFn: async () =>
      (
        await supabase
          .from("discovery_runs")
          .select("id,query,error,created_at")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(3)
      ).data ?? [],
  });
  const lastOpened = useQuery({
    queryKey: ["dash-last-opened"],
    queryFn: async () =>
      (
        await supabase
          .from("businesses")
          .select("id,name,category,last_opened_at")
          .not("last_opened_at", "is", null)
          .order("last_opened_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data,
  });
  const prefs = useQuery({
    queryKey: ["dash-prefs"],
    queryFn: async () =>
      (
        await supabase
          .from("user_preferences")
          .select("last_visit_at,previous_visit_at")
          .maybeSingle()
      ).data,
  });
  const outcomesQ = useQuery({
    queryKey: ["dash-outcomes"],
    queryFn: async () =>
      (await supabase.from("proposals").select("status,price").limit(1000)).data ?? [],
  });

  const rows = businesses.data ?? [];
  const total = rows.length;
  const noSite = rows.filter((b) => !b.website && b.website_checked_at).length;
  const investigated = rows.filter((b) => b.status === "investigated").length;

  const props = proposals.data ?? [];
  const openTasks = tasks.data?.length ?? 0;
  const overdue = overdueQ.data ?? 0;
  const failed = failedRuns.data ?? [];
  const accepted = props.filter((p) => p.status === "ACCEPTED");
  const acceptedValue = accepted.reduce((s: number, p) => s + (Number(p.price) || 0), 0);
  const currency = accepted[0]?.currency ?? props[0]?.currency ?? "USD";
  const outcome = summarizeOutcomes(outcomesQ.data ?? []);

  const prev = prefs.data?.previous_visit_at ? new Date(prefs.data.previous_visit_at) : null;
  const sinceLeads = prev ? rows.filter((b) => new Date(b.created_at) > prev).length : 0;
  const sinceProposals = prev ? props.filter((p) => new Date(p.updated_at) > prev).length : 0;

  const recentLeads = rows.slice(0, 6);
  const recentProposals = props.slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here is the state of your pipeline.</p>
        </div>
        <Button asChild>
          <Link to="/discover">
            <Compass className="h-4 w-4" />
            Run discovery
          </Link>
        </Button>
      </header>

      {(businesses.isError || proposals.isError || tasks.isError || failedRuns.isError) && (
        <ErrorBanner
          error={(businesses.error ?? proposals.error ?? tasks.error ?? failedRuns.error) as Error}
          context="Dashboard"
          onRetry={() => {
            if (businesses.isError) void businesses.refetch();
            if (proposals.isError) void proposals.refetch();
            if (tasks.isError) void tasks.refetch();
            if (failedRuns.isError) void failedRuns.refetch();
          }}
        />
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Businesses" value={total} icon={Globe} />
        <Kpi label="No website" value={noSite} icon={TrendingUp} hint="Verified no site" />
        <Kpi label="Investigated" value={investigated} icon={BadgeCheck} />
        <Kpi
          label="Open tasks"
          value={openTasks}
          icon={ListChecks}
          hint={overdue > 0 ? `${overdue} overdue` : undefined}
        />
      </section>

      {(overdue > 0 || failed.length > 0) && (
        <section className="space-y-2">
          {overdue > 0 && (
            <Link
              to="/tasks"
              className="flex items-center gap-3 rounded-xl border border-accent/40 bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <ListChecks className="h-4 w-4 text-accent" />
              <span className="flex-1">
                <strong>{overdue}</strong> overdue follow-up{overdue === 1 ? "" : "s"}
              </span>
              <span className="text-xs text-muted-foreground">Review</span>
            </Link>
          )}
          {failed.length > 0 && (
            <Link
              to="/history"
              className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="min-w-0 flex-1">
                <strong>{failed.length}</strong> discovery run{failed.length === 1 ? "" : "s"}{" "}
                failed
                {failed[0]?.error ? ` — ${failed[0].error}` : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">History</span>
            </Link>
          )}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Recent leads</h2>
            <Link to="/discover" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {businesses.isError ? (
            <div className="p-4 text-sm text-destructive">
              Could not load leads. See the error above for the cause and fix.
            </div>
          ) : businesses.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : recentLeads.length === 0 ? (
            <EmptyState
              title="No businesses yet"
              why="Nothing has been discovered so far. Run a discovery search on the Discover page to import real Google Maps results."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/discover">Go to Discover</Link>
                </Button>
              }
            />
          ) : (
            <div className="divide-y">
              {recentLeads.map((b) => (
                <Link
                  key={b.id}
                  to="/businesses/$id"
                  params={{ id: b.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[b.category, b.address].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  {!b.website && b.website_checked_at && (
                    <span className="shrink-0 rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">
                      no site
                    </span>
                  )}
                  <span className="w-9 shrink-0 text-right text-sm font-semibold text-primary">
                    {b.score ?? "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {lastOpened.data && (
            <Link
              to="/businesses/$id"
              params={{ id: lastOpened.data.id }}
              className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Continue where you left off
              </p>
              <p className="mt-1 text-sm font-semibold">{lastOpened.data.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lastOpened.data.category || "Last opened"}
                {lastOpened.data.last_opened_at
                  ? ` · ${relativeTime(lastOpened.data.last_opened_at)}`
                  : ""}
              </p>
            </Link>
          )}

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Since your last visit</h2>
            {prefs.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">…</p>
            ) : !prev ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This is your first visit. Welcome.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MiniStat label="New leads" value={sinceLeads} />
                <MiniStat label="Proposals touched" value={sinceProposals} />
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Win rate</h2>
            <p className="mt-1 text-2xl font-semibold">
              {outcome.winRate == null ? "—" : `${outcome.winRate}%`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {outcome.decided === 0
                ? "No decided proposals yet"
                : `${outcome.won} won · ${outcome.lost} lost`}
              {outcome.pipeline > 0 ? ` · ${outcome.pipeline} in progress` : ""}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Accepted value</h2>
            <p className="mt-1 text-2xl font-semibold text-accent">
              {acceptedValue > 0 ? `${currency} ${acceptedValue.toLocaleString()}` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              From {accepted.length} accepted proposal{accepted.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <QuickLink to="/discover" icon={Compass} label="Discover new leads" />
              <QuickLink to="/proposals" icon={FileText} label="Review proposals" />
              <QuickLink to="/tasks" icon={ListChecks} label="Open tasks" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Recent proposals</h2>
            <Link to="/proposals" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {proposals.isError ? (
            <div className="p-4 text-sm text-destructive">
              Could not load proposals — check the error banner above.
            </div>
          ) : recentProposals.length === 0 ? (
            <EmptyState
              title="No proposals yet"
              why="Generate one from a business page after running an investigation — the AI drafts it from collected evidence only."
            />
          ) : (
            <div className="divide-y">
              {recentProposals.map((p) => (
                <Link
                  key={p.id}
                  to="/proposals/$id"
                  params={{ id: p.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.title ?? p.mode}</p>
                    <p className="text-xs text-muted-foreground">{p.businesses?.name ?? "—"}</p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {p.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Open tasks</h2>
            <Link to="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {tasks.isError ? (
            <div className="p-4 text-sm text-destructive">
              Could not load tasks — check the error banner above.
            </div>
          ) : tasks.data?.length === 0 ? (
            <EmptyState
              title="Nothing to do"
              why="Tasks you create appear here. They are generated automatically from revenue leaks (Plan delivery) or created manually on the Tasks page."
            />
          ) : (
            <div className="divide-y">
              {tasks.data?.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.businesses?.name ?? "General"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "recently";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
