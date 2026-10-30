import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpportunitySignals, updateOpportunitySignalStatus } from "@/lib/opportunity-signals.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SIGNAL_CATEGORY_LABELS, type OpportunitySignal } from "@/lib/opportunity-signals";
import { Link } from "@tanstack/react-router";

export function OpportunitySignalsPanel() {
  const qc = useQueryClient();
  const getSignals = useServerFn(getOpportunitySignals);
  const updateStatus = useServerFn(updateOpportunitySignalStatus);
  
  const [filter, setFilter] = useState<"all" | "new" | "high" | "validation" | "expired" | "converted">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  
  const { data, isLoading } = useQuery({
    queryKey: ["opportunity-signals"],
    queryFn: async () => {
      const result = await getSignals();
      return result.signals;
    },
  });
  
  const signals = data ?? [];
  
  const filtered = signals.filter((s) => {
    if (filter === "new" && s.status !== "NEW") return false;
    if (filter === "high" && s.priority !== "high" && s.priority !== "critical") return false;
    if (filter === "validation" && s.status !== "NEEDS_VALIDATION") return false;
    if (filter === "expired" && s.status !== "EXPIRED") return false;
    if (filter === "converted" && s.status !== "CONVERTED_TO_OPPORTUNITY") return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    return true;
  });
  
  const categories = Array.from(new Set(signals.map(s => s.category)));
  
  async function handleStatusChange(signalId: string, status: any) {
    await updateStatus({ data: { signal_id: signalId, status } });
    qc.invalidateQueries({ queryKey: ["opportunity-signals"] });
  }
  
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading signals...</p>;
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          All ({signals.length})
        </Button>
        <Button size="sm" variant={filter === "new" ? "default" : "outline"} onClick={() => setFilter("new")}>
          New ({signals.filter(s => s.status === "NEW").length})
        </Button>
        <Button size="sm" variant={filter === "high" ? "default" : "outline"} onClick={() => setFilter("high")}>
          High Priority ({signals.filter(s => s.priority === "high" || s.priority === "critical").length})
        </Button>
        <Button size="sm" variant={filter === "validation" ? "default" : "outline"} onClick={() => setFilter("validation")}>
          Needs Validation ({signals.filter(s => s.status === "NEEDS_VALIDATION").length})
        </Button>
        <Button size="sm" variant={filter === "expired" ? "default" : "outline"} onClick={() => setFilter("expired")}>
          Expired ({signals.filter(s => s.status === "EXPIRED").length})
        </Button>
        <Button size="sm" variant={filter === "converted" ? "default" : "outline"} onClick={() => setFilter("converted")}>
          Converted ({signals.filter(s => s.status === "CONVERTED_TO_OPPORTUNITY").length})
        </Button>
      </div>
      
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Category:</span>
          <Button size="sm" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => setCategoryFilter("all")}>
            All
          </Button>
          {categories.map(cat => (
            <Button key={cat} size="sm" variant={categoryFilter === cat ? "default" : "outline"} onClick={() => setCategoryFilter(cat)}>
              {SIGNAL_CATEGORY_LABELS[cat as keyof typeof SIGNAL_CATEGORY_LABELS]}
            </Button>
          ))}
        </div>
      )}
      
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No signals match filters.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((signal) => (
            <article key={signal.id} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={signal.priority === "critical" ? "destructive" : signal.priority === "high" ? "default" : "secondary"}>
                  {signal.priority}
                </Badge>
                <Badge variant="outline">{SIGNAL_CATEGORY_LABELS[signal.category]}</Badge>
                <Badge variant="outline">{signal.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  Confidence: {(signal.confidence_level * 100).toFixed(0)}%
                </span>
              </div>
              
              <p className="font-medium">{signal.description}</p>
              
              <div className="space-y-1 text-sm text-muted-foreground">
                <p><strong>Possible need:</strong> {signal.possible_business_need}</p>
                <p><strong>Relevant services:</strong> {signal.relevant_generas_service.join(", ")}</p>
                <p><strong>Suggested investigation:</strong> {signal.suggested_investigation}</p>
                <p><strong>Validation question:</strong> {signal.suggested_validation_question}</p>
                <p><strong>Source:</strong> {signal.evidence_source} {signal.source_url && <a href={signal.source_url} target="_blank" rel="noopener noreferrer" className="underline">[link]</a>}</p>
                <p><strong>Detected:</strong> {new Date(signal.detected_at).toLocaleDateString()}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link to="/businesses/$id" params={{ id: signal.business_id }}>View Business</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange(signal.id, "UNDER_REVIEW")}>
                  Mark Under Review
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange(signal.id, "NEEDS_VALIDATION")}>
                  Needs Validation
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleStatusChange(signal.id, "CONFIRMED")}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleStatusChange(signal.id, "DISMISSED")}>
                  Dismiss
                </Button>
                <Button size="sm" onClick={() => handleStatusChange(signal.id, "CONVERTED_TO_OPPORTUNITY")}>
                  Convert to Opportunity
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
