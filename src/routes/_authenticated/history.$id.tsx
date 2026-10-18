import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

export const Route = createFileRoute("/_authenticated/history/$id")({
  head: () => ({
    meta: [
      { title: "Search results — GARE" },
      { name: "description", content: "Saved results of a discovery search." },
    ],
  }),
  component: RunPage,
});

type ResultRow = {
  id: string;
  name: string;
  address: string | null;
  website: string | null;
  score: number | null;
  status: string;
  was_new: boolean;
};

function RunPage() {
  const { id } = Route.useParams();
  const run = useQuery({
    queryKey: ["run", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_runs")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const rows = useQuery({
    queryKey: ["run-results", id],
    queryFn: async (): Promise<ResultRow[]> => {
      // Primary source: the link table (correct for reruns too). Some rows may be
      // missing for older runs, so fall back to businesses stamped with this run.
      const linkRes = await supabase
        .from("search_run_results")
        .select("was_new, businesses(id,name,address,website,score,status)")
        .eq("run_id", id)
        .limit(500);
      if (!linkRes.error && (linkRes.data?.length ?? 0) > 0) {
        const linked = (
          linkRes.data as unknown as {
            was_new: boolean;
            businesses: Omit<ResultRow, "was_new"> | null;
          }[]
        )
          .filter((x) => x.businesses)
          .map((x) => ({ ...(x.businesses as Omit<ResultRow, "was_new">), was_new: x.was_new }));
        if (linked.length > 0) return linked;
      }

      const bizRes = await supabase
        .from("businesses")
        .select("id,name,address,website,score,status")
        .eq("discovery_run_id", id)
        .order("score", { ascending: false, nullsFirst: false })
        .limit(200);
      if (bizRes.error) throw bizRes.error;
      return (bizRes.data ?? []).map((b) => ({ ...b, was_new: false }));
    },
  });
  const r = run.data;
  return (
    <div className="space-y-4">
      <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">
        ← Search History
      </Link>
      {run.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {run.isError && (
        <ErrorBanner error={run.error} context="Search record" onRetry={() => void run.refetch()} />
      )}
      {r && (
        <div>
          <h1 className="text-2xl font-bold">{r.title ?? r.query}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            Query “{r.query}”{r.location ? ` in ${r.location}` : ""} · ran{" "}
            {new Date(r.created_at).toLocaleString()} · {r.status} · {r.results_count} found ·{" "}
            {r.new_count} new
          </p>
          <p className="text-xs text-muted-foreground">
            These are the results as of that date. Use Rerun on Search History for fresh results.
          </p>
        </div>
      )}
      <div className="divide-y rounded-lg border bg-card">
        {rows.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading results…</p>}
        {rows.isError && (
          <div className="p-4">
            <ErrorBanner
              error={rows.error}
              context="Search results"
              onRetry={() => void rows.refetch()}
            />
          </div>
        )}
        {rows.data?.map((b) => (
          <Link
            key={b.id}
            to="/businesses/$id"
            params={{ id: b.id }}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
          >
            <span className="min-w-0 flex-1">{b.name}</span>
            {b.was_new && <span className="font-mono text-[10px] text-accent">new</span>}
            <span className="font-mono text-xs text-muted-foreground">{b.status}</span>
            <span className="w-10 text-right font-mono text-accent">{b.score ?? "—"}</span>
          </Link>
        ))}
        {rows.data?.length === 0 && (
          <EmptyState
            title="No linked results"
            why="This search may predate result-linking, or its businesses were deleted. Use Rerun on the Search History page to run it again with fresh results."
          />
        )}
      </div>
    </div>
  );
}
