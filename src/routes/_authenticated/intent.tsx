import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getIntentBoard, type IntentBoardRow } from "@/lib/intent.functions";
import { INTENT_DISCLAIMER, INTENT_TIERS, type IntentTier } from "@/lib/intent";

export const Route = createFileRoute("/_authenticated/intent")({
  head: () => ({
    meta: [
      { title: "Buyer intent — GARE" },
      {
        name: "description",
        content: "Leads ranked by recorded intent signals, with evidence.",
      },
    ],
  }),
  component: IntentPage,
});

const TIER_VARIANT: Record<IntentTier, "destructive" | "secondary" | "outline"> = {
  hot: "destructive",
  warm: "secondary",
  cool: "outline",
  cold: "outline",
  unknown: "outline",
};

function IntentPage() {
  const load = useServerFn(getIntentBoard);
  const [tierFilter, setTierFilter] = useState<"all" | IntentTier>("all");
  const board = useQuery({ queryKey: ["intent-board"], queryFn: () => load() });

  const rows = useMemo(() => {
    const list = board.data?.rows ?? [];
    return tierFilter === "all" ? list : list.filter((r) => r.tier === tierFilter);
  }, [board.data, tierFilter]);

  const counts = board.data?.counts;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Flame className="h-5 w-5" /> Buyer intent
        </h1>
        <p className="text-sm text-muted-foreground">{INTENT_DISCLAIMER}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>{counts?.hot ?? 0} hot</span>
        <span>· {counts?.warm ?? 0} warm</span>
        <span>· {counts?.cool ?? 0} cool</span>
        <span>· {counts?.cold ?? 0} cold</span>
        <label className="ml-auto flex items-center gap-2">
          Tier
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as typeof tierFilter)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {INTENT_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {board.isLoading ? (
        <p className="text-sm text-muted-foreground">Scoring leads…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No leads to score yet. Intent is derived from saved businesses, their measured leaks,
          recorded activity and pipeline stage. Investigate leads and refresh revenue leaks first.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <IntentRow key={r.businessId} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function IntentRow({ row }: { row: IntentBoardRow }) {
  return (
    <article className="space-y-2 rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={TIER_VARIANT[row.tier]}>{row.tier}</Badge>
        <Link
          to="/businesses/$id"
          params={{ id: row.businessId }}
          className="font-medium hover:underline"
        >
          {row.name || "Unnamed"}
        </Link>
        {row.industry && <span className="text-muted-foreground">· {row.industry}</span>}
        {row.district && <span className="text-muted-foreground">· {row.district}</span>}
        <span className="ml-auto text-xs text-muted-foreground">
          intent {Math.round(row.score * 100)}%
        </span>
      </div>
      {row.reasons.length > 0 && (
        <ul className="list-disc pl-4 text-muted-foreground">
          {row.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {row.uncertainties.length > 0 && (
        <ul className="list-disc pl-4 text-amber-600 dark:text-amber-500">
          {row.uncertainties.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{row.limitation}</p>
    </article>
  );
}
