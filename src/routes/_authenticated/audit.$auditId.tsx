import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/audit/$auditId")({
  head: () => ({ meta: [{ title: "Audit Report | GARE" }] }),
  component: AuditDetail,
});

function AuditDetail() {
  const { auditId: id } = Route.useParams();
  const audit = useQuery({
    queryKey: ["business_audit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_audits")
        .select("*, businesses(name, website)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (audit.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (audit.isError) return <p className="text-sm text-destructive">Failed to load audit</p>;
  const a: any = audit.data;
  const findings = a.findings_json || {};
  const evidence = a.evidence_log_json || [];
  const summary = a.summary_json || {};

  return (
    <div className="space-y-6">
      <header className="flex items-center">
        <div className="mr-auto">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Business Audit</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.businesses?.name || "Audit"}</h1>
          <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()} • {a.status}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link to="/businesses/$id" params={{ id: a.business_id }}>Back to business</Link></Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>Print / Save PDF</Button>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Overall Score</p>
          <span className="font-mono text-4xl font-semibold">{summary.overall_score ?? a.score_0_100 ?? "—"}/100</span>
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          <Badge variant="destructive">Critical: {summary.critical_count ?? 0}</Badge>
          <Badge variant="secondary">High: {summary.high_count ?? 0}</Badge>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Evidence Log</p>
        {evidence.length === 0 ? <p className="text-sm text-muted-foreground">No evidence recorded.</p> :
          <div className="divide-y">
            {evidence.map((e: any, i: number) => (
              <div key={i} className="py-2 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.check?.replace(/_/g," ")} <span className="text-muted-foreground">({e.category})</span></p>
                  <p className="text-xs text-muted-foreground">{e.evidence}</p>
                  <p className="text-xs text-muted-foreground">Source: {e.source} • {e.status} • conf {Math.round((e.confidence||0)*100)}%</p>
                </div>
                <Badge variant={e.severity==="CRITICAL"?"destructive":e.severity==="HIGH"?"secondary":"outline"}>{e.severity}</Badge>
              </div>
            ))}
          </div>}
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Recommendations</p>
        {(findings.recommendations || []).map((r: any, i: number) => (
          <div key={i} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium capitalize">{r.title}</p>
              <Badge variant="outline">{r.priority}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{r.rationale}</p>
            <p className="text-sm mt-1">{r.action} • Effort: {r.effort}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
