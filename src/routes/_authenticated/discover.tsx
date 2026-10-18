import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runDiscovery } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { scanHealth, type Source } from "@/lib/sources";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Discover — GARE" },
      { name: "description", content: "Find and queue real businesses from Google Maps." },
      { property: "og:title", content: "Discover — GARE" },
      { property: "og:description", content: "Find and queue real businesses from Google Maps." },
    ],
  }),
  component: Discover,
});

function Discover() {
  const qc = useQueryClient();
  const discover = useServerFn(runDiscovery);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "no_site" | "investigated" | "closed">("all");
  const [error, setError] = useState<string | null>(null);

  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const r = await discover({ data: { query, location, maxResults: 20 } });
      setResult(`Found ${r.found} · ${r.added} new · ${r.duplicates} already known`);
      if (r.found === 0) {
        setError(
          "The search returned no results. Try a broader query (e.g. 'restaurants' instead of a specific name), a different location, or check the source health below.",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        `${msg} — Check Settings → Integrations for a valid Maps/Places key. Each run is a paid Google request, so also verify quota/billing. Then try again.`,
      );
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["businesses"] });
    qc.invalidateQueries({ queryKey: ["runs"] });
  }

  const isClosed = (b: { business_status: string | null }) =>
    b.business_status === "CLOSED_PERMANENTLY" || b.business_status === "CLOSED_TEMPORARILY";
  const list = (businesses.data ?? []).filter((b) =>
    filter === "no_site"
      ? !b.website
      : filter === "investigated"
        ? b.status === "investigated"
        : filter === "closed"
          ? isClosed(b)
          : true,
  );
  const total = businesses.data?.length ?? 0;
  const noSite = businesses.data?.filter((b) => !b.website && b.website_checked_at).length ?? 0;
  const noSiteUnverified =
    businesses.data?.filter((b) => !b.website && !b.website_checked_at).length ?? 0;
  const investigated = businesses.data?.filter((b) => b.status === "investigated").length ?? 0;
  const closedCount = businesses.data?.filter(isClosed).length ?? 0;

  const runsList = runs.data ?? [];
  const lastAttempt = runsList[0]?.created_at ?? null;
  const lastOk = runsList.find((r) => r.status !== "failed")?.created_at ?? null;
  const lastFailed = runsList.find((r) => r.status === "failed");
  const gmapsSource: Source = {
    id: "google-maps",
    kind: "map",
    name: "Google Maps (Places API)",
    url: null,
    enabled: true,
    configured: !!lastAttempt,
    last_ok_at: lastOk,
    last_attempt_at: lastAttempt,
    error: lastFailed?.error ?? null,
    fresh_ok: false,
  };
  const gmapsHealth = scanHealth(gmapsSource, 7);

  return (
    <div className="space-y-8">
      {(businesses.isError || runs.isError) && (
        <ErrorBanner
          error={(businesses.error ?? runs.error) as Error}
          context="Discover"
          onRetry={() => {
            if (businesses.isError) void businesses.refetch();
            if (runs.isError) void runs.refetch();
          }}
        />
      )}
      <section className="grid gap-4 sm:grid-cols-5">
        <Stat label="Businesses" value={total} />
        <Stat
          label="No website (confirmed)"
          value={noSite}
          hint="Only counted after investigation double-checks"
        />
        <Stat
          label="No website (unverified)"
          value={noSiteUnverified}
          hint="Discovered on Google Maps, not yet double-checked"
        />
        <Stat label="Investigated" value={investigated} />
        <Stat label="Revenue (real payments)" value="$0" hint="No payment system connected yet" />
      </section>

      <section className="rounded-lg border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">01 · Discover</p>
        <form onSubmit={onRun} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="What kind of business? e.g. restaurants, salons, hardware shops"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            minLength={2}
          />
          <Input
            placeholder="Where? e.g. Kigali, Rwanda"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="sm:max-w-xs"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Searching…" : "Run discovery"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Up to 20 real results per run from Google Maps. Each run is a paid Google request, so
          search deliberately.
        </p>
        {result && <p className="mt-3 font-mono text-sm">{result}</p>}
        {error && (
          <p className="mt-3 rounded-md border border-destructive/40 bg-card px-3 py-2 font-mono text-sm text-destructive">
            {error}
          </p>
        )}
        {!!runs.data?.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {runs.data.map((r) => (
              <span
                key={r.id}
                className="rounded border px-2 py-1 font-mono text-xs text-muted-foreground"
              >
                {r.query}
                {r.location ? ` @ ${r.location}` : ""} ·{" "}
                {r.status === "failed" ? "failed" : `+${r.new_count}`}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
          <span className="font-mono uppercase tracking-widest text-muted-foreground">
            Source health
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono ${
              gmapsHealth.ok
                ? "border border-emerald-600/40 text-emerald-700 dark:text-emerald-300"
                : "border border-amber-600/40 text-amber-700 dark:text-amber-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                gmapsHealth.ok ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {gmapsSource.name} · {gmapsHealth.reason}
          </span>
          {lastFailed?.error && (
            <span className="font-mono text-destructive" title={lastFailed.error}>
              last error: {lastFailed.error.slice(0, 60)}
            </span>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto font-mono text-xs uppercase tracking-[0.3em] text-primary">
            02 · Pipeline
            <span className="ml-2 text-muted-foreground normal-case tracking-normal">
              {list.length} shown
            </span>
          </p>
          {(["all", "no_site", "investigated", "closed"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All"
                : f === "no_site"
                  ? "No website"
                  : f === "investigated"
                    ? "Investigated"
                    : "Closed"}
            </Button>
          ))}
        </div>
        {businesses.isError ? (
          <ErrorBanner
            error={businesses.error}
            context="Pipeline"
            onRetry={() => void businesses.refetch()}
          />
        ) : businesses.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyState
            title="No businesses in this view"
            why={
              total === 0
                ? "No businesses have been discovered yet. Run a search above — only real Google Maps results are stored."
                : "You have businesses, but none match the current filter. Switch the filter back to All to see everything."
            }
            action={
              total > 0 ? (
                <Button size="sm" variant="outline" onClick={() => setFilter("all")}>
                  Show all
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((b) => {
              const closedPermanently = b.business_status === "CLOSED_PERMANENTLY";
              const closedTemporarily = b.business_status === "CLOSED_TEMPORARILY";
              const hasMeta =
                !b.website || closedPermanently || closedTemporarily || b.rating != null;
              return (
                <Link
                  key={b.id}
                  to="/businesses/$id"
                  params={{ id: b.id }}
                  className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium">{b.name}</p>
                    <span className="shrink-0 font-mono text-base font-semibold text-accent">
                      {b.score ?? "—"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[b.category, b.address].filter(Boolean).join(" · ")}
                  </p>
                  {hasMeta && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {!b.website &&
                        (b.website_checked_at ? (
                          <Badge variant="outline" className="border-primary text-primary">
                            no website · checked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            no website · unchecked
                          </Badge>
                        ))}
                      {closedPermanently && <Badge variant="destructive">closed</Badge>}
                      {closedTemporarily && <Badge variant="destructive">temp. closed</Badge>}
                      {b.rating != null && (
                        <span className="font-mono text-xs text-muted-foreground">
                          ★ {b.rating} ({b.review_count ?? 0})
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
