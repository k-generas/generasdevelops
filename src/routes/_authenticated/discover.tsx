import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runDiscovery } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scanHealth, type Source } from "@/lib/sources";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { BUSINESS_CATEGORIES } from "@/lib/business-categories";
import { LOCATION_PRESETS } from "@/lib/location-presets";

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
  const [batchLocs, setBatchLocs] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchLog, setBatchLog] = useState<string[]>([]);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);

  const queryIsPreset = BUSINESS_CATEGORIES.some((group) => group.items.includes(query));
  const locationIsPreset = LOCATION_PRESETS.some((preset) => preset.value === location);

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
      setResult(
        `Found ${r.found} · ${r.added} new · ${r.duplicates} already known · ${r.verifiedNoWebsite} verified with no website`,
      );
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

  const BATCH_LIMIT = 12;
  async function onBatchRun() {
    if (batchBusy || !query.trim() || batchLocs.length === 0) return;
    setBatchBusy(true);
    setBatchLog([]);
    setError(null);
    const locs = batchLocs.slice(0, BATCH_LIMIT);
    for (let i = 0; i < locs.length; i++) {
      const loc = locs[i];
      const label = loc || "Worldwide";
      setBatchLog((l) => [...l, `Scanning ${i + 1}/${locs.length} — ${label}…`]);
      try {
        const r = await discover({ data: { query, location: loc, maxResults: 20 } });
        setBatchLog((l) => [
          ...l,
          `  ${label}: ${r.found} found · ${r.added} new · ${r.duplicates} known · ${r.verifiedNoWebsite} no-website`,
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setBatchLog((l) => [...l, `  ${label}: failed — ${msg.slice(0, 120)}`]);
      }
    }
    setBatchLog((l) => [
      ...l,
      `Batch complete — ${batchLocs.length > BATCH_LIMIT ? `capped at ${BATCH_LIMIT} areas. ` : ""}Reloading leads…`,
    ]);
    setBatchBusy(false);
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
        <form onSubmit={onRun} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              value={query === "" ? "" : queryIsPreset ? query : "__custom__"}
              onValueChange={(v) => {
                if (v === "__custom__") {
                  setQuery("");
                  requestAnimationFrame(() => queryInputRef.current?.focus());
                  return;
                }
                setQuery(v);
              }}
            >
              <SelectTrigger className="sm:max-w-xs">
                <SelectValue placeholder="Pick a business type preset" />
              </SelectTrigger>
              <SelectContent className="max-h-96">
                <SelectItem value="__custom__">Custom — type my own</SelectItem>
                {BUSINESS_CATEGORIES.map((group) => (
                  <SelectGroup key={group.name}>
                    <SelectLabel>{group.name}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={locationIsPreset ? (location === "" ? "worldwide" : location) : "__custom__"}
              onValueChange={(v) => {
                if (v === "worldwide") {
                  setLocation("");
                  return;
                }
                if (v === "__custom__") {
                  setLocation("");
                  requestAnimationFrame(() => locationInputRef.current?.focus());
                  return;
                }
                setLocation(v);
              }}
            >
              <SelectTrigger className="sm:max-w-xs">
                <SelectValue placeholder="Pick a location preset" />
              </SelectTrigger>
              <SelectContent className="max-h-96">
                <SelectItem value="__custom__">Custom — type my own</SelectItem>
                {LOCATION_PRESETS.map((p) => (
                  <SelectGroup key={p.group ?? p.label}>
                    {p.group && <SelectLabel>{p.group}</SelectLabel>}
                    <SelectItem value={p.value === "" ? "worldwide" : p.value}>
                      {p.label}
                    </SelectItem>
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={queryInputRef}
              aria-label="Business type"
              placeholder="What kind of business? e.g. restaurants, salons, hardware shops"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              required
              minLength={2}
            />
            <Input
              ref={locationInputRef}
              aria-label="Location"
              placeholder="Where? e.g. Kigali, Rwanda or Gasabo, Rwanda"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              autoComplete="off"
              className="sm:max-w-xs"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Searching…" : "Run discovery"}
            </Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Presets and manual typing share the same fields — pick a preset to fill the box, then edit
          it freely (or choose “Custom — type my own”). Up to 20 real results per run from Google
          Maps. Each run is a paid Google request, so search deliberately.
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

      <section className="rounded-lg border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
          01b · Batch scan
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Repeats the discovery above across every selected area — pick a business type in step 01,
          choose locations, then run. Up to {BATCH_LIMIT} paid Google requests per batch, capped at
          20 real results each; results land in the Pipeline below.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={batchBusy}
            onClick={() =>
              setBatchLocs((prev) => {
                const all = LOCATION_PRESETS.map((p) => p.value);
                return all.every((v) => prev.includes(v)) ? [] : all;
              })
            }
          >
            {batchLocs.length >= LOCATION_PRESETS.length ? "Clear all" : "Select all locations"}
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {batchLocs.length} selected
            {batchLocs.length > BATCH_LIMIT ? ` · only first ${BATCH_LIMIT} will run` : ""}
          </span>
          <Button
            size="sm"
            disabled={batchBusy || !query.trim() || batchLocs.length === 0}
            onClick={() => void onBatchRun()}
          >
            {batchBusy ? "Scanning…" : `Run batch (${Math.min(batchLocs.length, BATCH_LIMIT)})`}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LOCATION_PRESETS.map((p) => {
            const value = p.value;
            const active = batchLocs.includes(value);
            return (
              <button
                key={`${p.group ?? ""}-${p.value}-${p.label}`}
                type="button"
                disabled={batchBusy}
                onClick={() =>
                  setBatchLocs((prev) =>
                    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
                  )
                }
                className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {!query.trim() && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Set a business type in step 01 first — the batch reuses that search text for every area.
          </p>
        )}
        {batchLog.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {batchLog.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
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
