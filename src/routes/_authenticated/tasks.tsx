import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [{ title: "Tasks — GARE" }, { name: "description", content: "Open tasks and follow-ups." }] }),
  component: Tasks,
});

function Tasks() {
  const qc = useQueryClient();
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await supabase.from("tasks").select("*, businesses(name)").eq("status", "open").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <div className="divide-y rounded-lg border bg-card">
        {tasks.data?.map((t: any) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate">{t.title}</p>
              <p className="text-xs text-muted-foreground">{t.businesses?.name} · {t.source} · {new Date(t.created_at).toLocaleDateString()}</p>
            </div>
            {t.proposal_id && <Link to="/proposals/$id" params={{ id: t.proposal_id }} className="text-xs text-primary underline">Open proposal</Link>}
            <Button size="sm" variant="outline" onClick={async () => {
              await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", t.id);
              qc.invalidateQueries({ queryKey: ["tasks"] });
            }}>Done</Button>
          </div>
        ))}
        {tasks.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No open tasks.</p>}
      </div>
    </div>
  );
}
