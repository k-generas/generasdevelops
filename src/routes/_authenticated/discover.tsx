import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runDiscovery } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
  const [filter, setFilter] = useState<"all" | "no_site" | "investigated">("all");

  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("discovery_runs").select("*").order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await discover({ data: { query, location, maxResults: 20 } });
      setResult(`Found ${r.found} · ${r.added} new · ${r.duplicates} already known`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Discovery failed");
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["businesses"] });
    qc.invalidateQueries({ queryKey: ["runs"] });
  }

  const list = (businesses.data ?? []).filter((b) =>
    filter === "no_site" ? !b.website && !!b.website_checked_at : filter === "investigated" ? b.status === "investigated" : true,
  );
  const total = businesses.data?.length ?? 0;
  const noSite = businesses.data?.filter((b) => !b.website && b.website_checked_at).length ?? 0;
  const investigated = businesses.data?.filter((b) => b.status === "investigated").length ?? 0;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-4">
        <Stat label="Businesses" value={total} />
        <Stat label="No website (confirmed)" value={noSite} hint="Only counted after investigation double-checks" />
        <Stat label="Investigated" value={investigated} />
        <Stat label="Revenue (real payments)" value="$0" hint="No payment system connected yet" />
      </section>

      <section className="rounded-lg border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">01 · Discover</p>
        <form onSubmit={onRun} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input placeholder="What kind of business? e.g. restaurants, salons, hardware shops" value={query} onChange={(e) => setQuery(e.target.value)} required minLength={2} />
          <Input placeholder="Where? e.g. Kigali, Rwanda" value={location} onChange={(e) => setLocation(e.target.value)} className="sm:max-w-xs" />
          <Button type="submit" disabled={busy}>{busy ? "Searching…" : "Run discovery"}</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Up to 20 real results per run from Google Maps. Each run is a paid Google request, so search deliberately.</p>
        {result && <p className="mt-3 font-mono text-sm">{result}</p>}
        {!!runs.data?.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {runs.data.map((r) => (
              <span key={r.id} className="rounded border px-2 py-1 font-mono text-[11px] text-muted-foreground">
                {r.query}{r.location ? ` @ ${r.location}` : ""} · {r.status === "failed" ? "failed" : `+${r.new_count}`}
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <p className="mr-auto font-mono text-xs uppercase tracking-[0.3em] text-primary">02 · Pipeline</p>
          {(["all", "no_site", "investigated"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "no_site" ? "No website" : "Investigated"}
            </Button>
          ))}
        </div>
        {businesses.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No businesses yet. Run a discovery above — only real Google Maps results are stored.
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {list.map((b) => (
              <Link key={b.id} to="/businesses/$id" params={{ id: b.id }} className="flex items-center gap-4 px-4 py-3 hover:bg-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[b.category, b.address].filter(Boolean).join(" · ")}</p>
                </div>
                {!b.website && (b.website_checked_at
                  ? <Badge variant="outline" className="border-primary text-primary">no website (double-checked)</Badge>
                  : <Badge variant="outline" className="text-muted-foreground">not on Google · unchecked</Badge>)}
                {b.rating != null && <span className="font-mono text-xs text-muted-foreground">★ {b.rating} ({b.review_count ?? 0})</span>}
                <span className="w-12 text-right font-mono text-lg font-semibold text-accent">{b.score ?? "—"}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
