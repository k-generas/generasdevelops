import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { investigateBusiness } from "@/lib/discovery.functions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  INDUSTRIES,
  PROVINCES,
  classifyIndustry,
  industryLabel,
  normalizeDistrict,
  normalizeProvince,
  parseLocation,
  type IndustryKey,
  type Province,
} from "@/lib/rwanda";

export const Route = createFileRoute("/_authenticated/businesses")({
  head: () => ({
    meta: [
      { title: "Leads — GARE" },
      {
        name: "description",
        content: "Businesses discovered with no website or weak online presence.",
      },
    ],
  }),
  component: Businesses,
});

const WEBSITE_OPTIONS = ["no_site", "has_site", "all"] as const;
type WebsiteFilter = (typeof WEBSITE_OPTIONS)[number];

type LocationLike = {
  address: string | null;
  province?: string | null;
  district?: string | null;
};

function locationOf(b: LocationLike) {
  const parsed = parseLocation(b.address);
  return {
    province: normalizeProvince(b.province) ?? parsed.province,
    district: normalizeDistrict(b.district) ?? parsed.district,
  };
}

function Businesses() {
  const qc = useQueryClient();
  const investigate = useServerFn(investigateBusiness);
  const [website, setWebsite] = useState<WebsiteFilter>("no_site");
  const [province, setProvince] = useState<Province | "ALL">("ALL");
  const [industry, setIndustry] = useState<IndustryKey | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const investigated = useQuery({
    queryKey: ["businesses-investigated"],
    queryFn: async () => {
      const { data } = await supabase.from("investigations").select("business_id");
      return new Set((data ?? []).map((r) => r.business_id));
    },
  });

  const rows = useMemo(() => {
    return (businesses.data ?? []).filter((b) => {
      if (website === "no_site" && b.website) return false;
      if (website === "has_site" && !b.website) return false;
      const loc = locationOf(b);
      if (province !== "ALL" && loc.province !== province) return false;
      const ind =
        (b.industry as IndustryKey | null) ??
        classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
      if (industry !== "ALL" && ind !== industry) return false;
      if (q.trim()) {
        const s = `${b.name} ${b.category ?? ""} ${b.address ?? ""}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [businesses.data, website, province, industry, q]);

  async function runInvestigation(id: string) {
    setBusyId(id);
    try {
      await investigate({ data: { businessId: id, provider: "auto" } });
      qc.invalidateQueries({ queryKey: ["businesses"] });
      qc.invalidateQueries({ queryKey: ["businesses-investigated"] });
    } catch {
      // keep the list usable; the row simply stays un-investigated
    }
    setBusyId(null);
  }

  const noSite = rows.filter((b) => !b.website).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {businesses.data?.length ?? "…"} total · {noSite} without a website shown
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-44"
          />
          <select
            value={province}
            onChange={(e) => setProvince(e.target.value as Province | "ALL")}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            <option value="ALL">All provinces</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value as IndustryKey | "ALL")}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            <option value="ALL">All industries</option>
            {INDUSTRIES.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
          <select
            value={website}
            onChange={(e) => setWebsite(e.target.value as WebsiteFilter)}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            <option value="no_site">No website</option>
            <option value="has_site">Has website</option>
            <option value="all">Any website</option>
          </select>
        </div>
      </div>

      {businesses.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {businesses.data?.length
              ? "No businesses match these filters."
              : "No businesses yet. Run a discovery to find real leads."}
          </p>
          {!businesses.data?.length && (
            <Link to="/discover" className="mt-2 inline-block text-sm text-primary underline">
              Go to Discover
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="divide-y">
            {rows.map((b) => {
              const loc = locationOf(b);
              const ind =
                (b.industry as IndustryKey | null) ??
                classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <Link to="/businesses/$id" params={{ id: b.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        ind ? industryLabel(ind) : b.category,
                        loc.district ?? loc.province,
                        b.address,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </Link>
                  {!b.website && (
                    <Badge variant="outline" className="border-accent/40 text-accent">
                      no site
                    </Badge>
                  )}
                  {investigated.data?.has(b.id) && (
                    <Badge variant="outline" className="text-muted-foreground">
                      investigated
                    </Badge>
                  )}
                  {b.business_status === "CLOSED_PERMANENTLY" && (
                    <Badge variant="destructive">closed</Badge>
                  )}
                  <span className="w-9 shrink-0 text-right text-sm font-semibold text-primary">
                    {b.score ?? "—"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === b.id}
                    onClick={() => runInvestigation(b.id)}
                  >
                    {busyId === b.id ? "Investigating…" : "Run investigation"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
