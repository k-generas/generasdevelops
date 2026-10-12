import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/history/$id")({
  head: () => ({
    meta: [
      { title: "Search results — GARE" },
      { name: "description", content: "Saved results of a discovery search." },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { id } = Route.useParams();
  const run = useQuery({
    queryKey: ["run", id],
    queryFn: async () =>
      (await supabase.from("discovery_runs").select("*").eq("id", id).single()).data,
  });
  const rows = useQuery({
    queryKey: ["run-results", id],
    queryFn: async () =>
      (
        await supabase
          .from("search_run_results")
          .select("was_new, businesses(id,name,address,website,score,status)")
          .eq("run_id", id)
      ).data ?? [],
  });
  const r = run.data;
  return (
    <div className="space-y-4">
      <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">
        ← Search History
      </Link>
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
        {rows.data?.map(
          (x) =>
            x.businesses && (
              <Link
                key={x.businesses.id}
                to="/businesses/$id"
                params={{ id: x.businesses.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{x.businesses.name}</span>
                {x.was_new && <span className="font-mono text-[10px] text-accent">new</span>}
                <span className="font-mono text-xs text-muted-foreground">
                  {x.businesses.status}
                </span>
                <span className="w-10 text-right font-mono text-accent">
                  {x.businesses.score ?? "—"}
                </span>
              </Link>
            ),
        )}
        {rows.data?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No linked results.</p>
        )}
      </div>
    </div>
  );
}
