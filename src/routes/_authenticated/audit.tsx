import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Business Audits | GARE" }] }),
  component: AuditIndex,
});

function AuditIndex() {
  const audits = useQuery({
    queryKey: ["business_audits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_audits")
        .select("id,business_id,status,score_0_100,created_at,completed_at,businesses(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center">
        <div className="mr-auto">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Business Audit</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Digital Audits</h1>
        </div>
        <Button asChild size="sm"><Link to="/businesses">Run from a business</Link></Button>
      </header>
      <div className="divide-y rounded-xl border bg-card">
        {audits.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading...</p> :
         audits.data?.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No audits yet. Open a business and run a Business Audit.</p> :
         audits.data?.map((a: any) => (
           <div key={a.id} className="flex items-center gap-3 px-4 py-3">
             <div className="min-w-0 flex-1">
               <p className="text-sm">{a.businesses?.name ?? a.business_id}</p>
               <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()} • {a.status}</p>
             </div>
             {a.score_0_100 != null && <Badge variant="outline">Score {a.score_0_100}</Badge>}
             <Button asChild size="sm" variant="outline"><Link to="/audit/$auditId" params={{ auditId: a.id }}>View</Link></Button>
           </div>
         ))}
      </div>
    </div>
  );
}
