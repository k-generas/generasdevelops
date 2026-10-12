import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runDiscovery } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Search History — GARE" },
      { name: "description", content: "Every discovery search, saved." },
    ],
  }),
  component: History,
});

function History() {
  const qc = useQueryClient();
  const rerun = useServerFn(runDiscovery);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ["runs-all", showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovery_runs")
        .select("*")
        .eq("archived", showArchived)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["runs-all"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="mr-auto text-2xl font-bold">Search History</h1>
        <Button size="sm" variant="outline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Show active" : "Show archived"}
        </Button>
      </div>
      {runs.data?.length === 0 && <p className="text-sm text-muted-foreground">No searches yet.</p>}
      <div className="divide-y rounded-lg border bg-card">
        {runs.data?.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <Link to="/history/$id" params={{ id: r.id }} className="font-medium hover:underline">
                {r.title ?? r.query}
              </Link>
              <p className="font-mono text-[11px] text-muted-foreground">
                {new Date(r.created_at).toLocaleString()} · {r.status} · {r.results_count} found ·{" "}
                {r.new_count} new{r.error ? ` · ${r.error.slice(0, 80)}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const t = prompt("Rename search", r.title ?? r.query);
                if (t) {
                  await supabase.from("discovery_runs").update({ title: t }).eq("id", r.id);
                  refresh();
                }
              }}
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                try {
                  await rerun({
                    data: {
                      query: r.query,
                      location: r.location ?? "",
                      maxResults: 20,
                      title: `${r.title ?? r.query} (rerun)`,
                      rerunOf: r.id,
                    },
                  });
                } catch (e) {
                  alert(e instanceof Error ? e.message : "Rerun failed");
                }
                setBusy(null);
                refresh();
              }}
            >
              {busy === r.id ? "Running…" : "Rerun"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase
                  .from("discovery_runs")
                  .update({ archived: !r.archived })
                  .eq("id", r.id);
                refresh();
              }}
            >
              {r.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (confirm("Delete this search record? Businesses it found are kept.")) {
                  await supabase.from("discovery_runs").delete().eq("id", r.id);
                  refresh();
                }
              }}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
