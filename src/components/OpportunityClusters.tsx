import { Badge } from "@/components/ui/badge";
import { industryLabel } from "@/lib/rwanda";
import type { DensityCluster } from "@/lib/radar";

// Lightweight, dependency-free density view: one card per cluster of businesses
// that share an area + industry + verified gap. No map tiles, no API cost.
export function OpportunityClusters({
  clusters,
  onSelect,
}: {
  clusters: DensityCluster[];
  onSelect?: (gapKey: string) => void;
}) {
  if (clusters.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No repeatable clusters yet. A cluster appears when two or more businesses in the same area
        share a verified problem — that is where one packaged offer can win several deals.
      </p>
    );
  }
  const max = Math.max(...clusters.map((c) => c.count));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clusters.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onSelect?.(c.gapKey)}
          className="rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {c.industry ? industryLabel(c.industry) : "Mixed businesses"}
            </span>
            <Badge variant="secondary">{c.count}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {c.district ?? "Unknown district"} · {c.gapLabel}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((c.count / max) * 100)}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            avg priority {(c.avgPriority * 100).toFixed(0)}%
          </p>
        </button>
      ))}
    </div>
  );
}
