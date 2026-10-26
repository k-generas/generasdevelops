import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Phone, Search, Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  OUTREACH_EVENT_TYPE,
  OUTREACH_STAGES,
  normalizeStage,
  readLocalStages,
  stageLabel,
  stagesFromEvents,
  type OutreachStage,
} from "@/lib/outreach-tracker";

export const Route = createFileRoute("/_authenticated/numbers")({
  head: () => ({
    meta: [
      { title: "Numbers — GARE" },
      { name: "description", content: "Look up businesses by phone number or company name" },
    ],
  }),
  component: NumbersPage,
});

type BusinessLite = {
  id: string;
  name: string;
  phone: string | null;
  cell: string | null;
  category: string | null;
  district: string | null;
  province: string | null;
  address: string | null;
  business_status?: string | null;
  outreach_stage?: string | null;
};

function normalizePhone(p: string | null | undefined): string {
  if (!p) return "";
  return p.replace(/\s+/g, "").replace(/[^+\d]/g, "");
}

function NumbersPage() {
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<OutreachStage | "ANY">("ANY");

  const businesses = useQuery({
    queryKey: ["numbers-businesses"],
    queryFn: async () => {
      const PAGE = 1000;
      const all: BusinessLite[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("businesses")
          .select("id,name,phone,cell,category,district,province,address,business_status")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) {
          // Fallback for older schemas
          const { data: d2, error: e2 } = await supabase
            .from("businesses")
            .select("id,name,phone,cell,category,district,province,address")
            .order("created_at", { ascending: false })
            .range(from, from + PAGE - 1);
          if (e2) throw e2;
          if (!d2 || d2.length === 0) break;
          all.push(...(d2 as BusinessLite[]));
          if (d2.length < PAGE) break;
          from += PAGE;
          continue;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });

  const outreachEvents = useQuery({
    queryKey: ["outreach-events-numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_activity_events")
        .select("business_id, details, created_at")
        .eq("event_type", OUTREACH_EVENT_TYPE)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
  });

  const dbStages = useMemo(
    () => stagesFromEvents(outreachEvents.data ?? []),
    [outreachEvents.data],
  );
  const localStages = useMemo(() => readLocalStages(), []);

  const stageOf = useCallback(
    (b: BusinessLite): OutreachStage =>
      localStages[b.id] ?? dbStages[b.id]?.stage ?? normalizeStage(b.outreach_stage),
    [localStages, dbStages],
  );

  const rows = useMemo(() => {
    const list = businesses.data ?? [];
    const nq = q.trim().toLowerCase();
    const np = normalizePhone(q);

    return list
      .flatMap((b) => {
        const stage = stageOf(b);
        const phones: Array<{ type: "phone" | "cell"; value: string }> = [];
        if (b.phone) phones.push({ type: "phone", value: b.phone });
        if (b.cell && b.cell !== b.phone) phones.push({ type: "cell", value: b.cell });
        if (phones.length === 0) return [];
        return phones.map((p) => ({
          key: `${b.id}-${p.type}`,
          business: b,
          number: p.value,
          numberNorm: normalizePhone(p.value),
          type: p.type,
          stage,
        }));
      })
      .filter((r) => {
        if (stageFilter !== "ANY" && r.stage !== stageFilter) return false;
        if (!nq && !np) return true;
        if (np && r.numberNorm.includes(np)) return true;
        if (nq) {
          const name = (r.business.name ?? "").toLowerCase();
          const cat = (r.business.category ?? "").toLowerCase();
          const addr = (r.business.address ?? "").toLowerCase();
          if (name.includes(nq) || cat.includes(nq) || addr.includes(nq)) return true;
        }
        return false;
      });
  }, [businesses.data, q, stageFilter, stageOf]);

  const counts = useMemo(() => {
    const all = (businesses.data ?? []).map((b) => ({ outreach_stage: stageOf(b) }));
    const c: Record<string, number> = { total: all.length };
    for (const s of OUTREACH_STAGES) c[s] = 0;
    for (const r of all) {
      const key = normalizeStage(r.outreach_stage);
      c[key] = (c[key] ?? 0) + 1;
    }
    return c;
  }, [businesses.data, stageOf]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Numbers lookup</h1>
        <p className="text-sm text-muted-foreground">
          Find which business/company a number belongs to and its outreach status
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type a phone number (+250..., 078...) or business/company name"
              className="pl-9"
            />
          </div>
          <Select
            value={stageFilter}
            onValueChange={(v) => setStageFilter(v as OutreachStage | "ANY")}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">All statuses ({counts["total"]})</SelectItem>
              {OUTREACH_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)} ({counts[s] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Results{" "}
            {rows.length > 0 && <span className="text-muted-foreground">({rows.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {businesses.isLoading
                  ? "Loading..."
                  : "No matches. Try a different number or name."}
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.key}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-muted p-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{r.number}</span>
                        <Badge variant="outline" className="text-xs">
                          {r.type}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="truncate">{r.business.name}</span>
                        {r.business.category && (
                          <span className="hidden sm:inline">• {r.business.category}</span>
                        )}
                      </div>
                      {(r.business.district || r.business.address) && (
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {[r.business.district, r.business.address].filter(Boolean).join(" • ")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                    <Badge
                      variant="outline"
                      className={cn(
                        r.stage === "won" &&
                          "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
                        r.stage === "negotiating" &&
                          "border-amber-500/40 text-amber-700 dark:text-amber-400",
                        r.stage === "replied" && "border-sky-500/40 text-sky-700 dark:text-sky-400",
                        r.stage === "messaged" && "border-primary/40 text-primary",
                        r.stage === "lost" && "border-destructive/40 text-destructive",
                      )}
                    >
                      {stageLabel(r.stage)}
                    </Badge>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/businesses" search={{ q: r.business.name }}>
                        {/* keep simple */}View lead
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
