import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { investigateBusiness } from "@/lib/discovery.functions";
import { runRwandaScan } from "@/lib/rwanda-discovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buildScanPlan, MAX_QUERIES_PER_RUN } from "@/lib/rwanda-scan";
import {
  DISTRICTS,
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
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

type LocationLike = {
  address: string | null;
  province?: string | null;
  district?: string | null;
};

// Prefer the stored province/district (migration 0008) and fall back to parsing
// the free-text address when those columns are not present.
function locationOf(b: LocationLike) {
  const parsed = parseLocation(b.address);
  return {
    province: normalizeProvince(b.province) ?? parsed.province,
    district: normalizeDistrict(b.district) ?? parsed.district,
  };
}

export const Route = createFileRoute("/_authenticated/rwanda")({
  head: () => ({
    meta: [
      { title: "Rwanda Intel — GARE" },
      {
        name: "description",
        content:
          "All companies and factories across Rwanda: what they do, contacts, locations, websites, workforce, founding, hiring and best-fit services.",
      },
    ],
  }),
  component: RwandaIntel,
});

const WEBSITE_OPTIONS = ["all", "no_site", "has_site"] as const;
type WebsiteFilter = (typeof WEBSITE_OPTIONS)[number];

function RwandaIntel() {
  const qc = useQueryClient();
  const scan = useServerFn(runRwandaScan);
  const investigate = useServerFn(investigateBusiness);

  // ---- scan presets -------------------------------------------------------
  const [industries, setIndustries] = useState<IndustryKey[]>(["manufacturing"]);
  const [scopeMode, setScopeMode] = useState<"national" | "province" | "districts">("national");
  const [province, setProvince] = useState<Province>("Kigali City");
  const [districts, setDistricts] = useState<string[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const preview = buildScanPlan(
    {
      industries,
      scope:
        scopeMode === "national"
          ? { kind: "national" }
          : scopeMode === "districts"
            ? { kind: "districts", districts }
            : { kind: "provinces", provinces: [province] },
    },
    MAX_QUERIES_PER_RUN,
  );

  function toggleIndustry(k: IndustryKey) {
    setIndustries((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }
  function toggleDistrict(d: string) {
    setDistricts((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function onRunScan(e: React.FormEvent) {
    e.preventDefault();
    if (industries.length === 0) {
      setScanResult("Pick at least one industry.");
      return;
    }
    setScanBusy(true);
    setScanResult(null);
    try {
      const r = await scan({
        data: {
          industries,
          national: scopeMode === "national",
          province: scopeMode === "province" ? province : undefined,
          districts: scopeMode === "districts" ? districts : undefined,
          maxQueries: MAX_QUERIES_PER_RUN,
        },
      });
      const firstErr = r.perQuery.find((x) => x.error)?.error;
      setScanResult(
        `Ran ${r.queries} queries · ${r.found} found · ${r.added} new · est. $${r.estimatedCostUsd}${r.truncated ? " (capped)" : ""}${r.failedQueries ? ` · ${r.failedQueries} failed${firstErr ? `: ${firstErr}` : ""}` : ""}`,
      );
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : "Rwanda scan failed");
    }
    setScanBusy(false);
    qc.invalidateQueries({ queryKey: ["rwanda-companies"] });
    qc.invalidateQueries({ queryKey: ["businesses"] });
  }

  // ---- companies ----------------------------------------------------------
  const [status, setStatus] = useState<string>("ALL");
  const [website, setWebsite] = useState<WebsiteFilter>("all");
  const [provinceF, setProvinceF] = useState<Province | "ALL">("ALL");
  const [industryF, setIndustryF] = useState<IndustryKey | "ALL">("ALL");
  const [hiringOnly, setHiringOnly] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const companies = useQuery({
    queryKey: ["rwanda-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Latest hiring/activity event per business. The table may not exist before
  // migration 0008; in that case we simply show nothing.
  const signals = useQuery({
    queryKey: ["rwanda-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_events")
        .select("business_id,event_kind,title,last_seen_at,source_date")
        .order("last_seen_at", { ascending: false })
        .limit(2000);
      if (error) return {} as Record<string, { kind: string; title: string; at: string }>;
      const map: Record<string, { kind: string; title: string; at: string }> = {};
      for (const e of data ?? []) {
        if (e.business_id && !map[e.business_id]) {
          map[e.business_id] = {
            kind: e.event_kind,
            title: e.title,
            at: e.source_date ?? e.last_seen_at,
          };
        }
      }
      return map;
    },
  });

  const rows = useMemo(() => {
    return (companies.data ?? []).filter((b) => {
      if (status !== "ALL" && b.business_status !== status) return false;
      if (website === "no_site" && b.website) return false;
      if (website === "has_site" && !b.website) return false;
      const loc = locationOf(b);
      if (provinceF !== "ALL" && loc.province !== provinceF) return false;
      const ind =
        (b.industry as IndustryKey | null) ??
        classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
      if (industryF !== "ALL" && ind !== industryF) return false;
      if (hiringOnly && !signals.data?.[b.id]) return false;
      if (q.trim()) {
        const s = `${b.name} ${b.category ?? ""} ${b.address ?? ""}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [companies.data, signals.data, status, website, provinceF, industryF, hiringOnly, q]);

  const noSite = rows.filter((b) => !b.website).length;

  async function runInvestigation(id: string) {
    setBusyId(id);
    try {
      await investigate({ data: { businessId: id, provider: "auto" } });
      qc.invalidateQueries({ queryKey: ["rwanda-companies"] });
      qc.invalidateQueries({ queryKey: ["rwanda-signals"] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    } catch {
      // surfaced below via the row staying un-investigated; keep the list usable
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rwanda Intel</h1>
        <p className="text-sm text-muted-foreground">
          Every company and factory discovered across Rwanda — what they do, contacts, locations,
          websites, workforce, founding, hiring and best-fit services.
        </p>
      </div>

      {companies.isError && (
        <ErrorBanner
          error={companies.error}
          context="Rwanda companies"
          onRetry={() => void companies.refetch()}
        />
      )}

      <section className="rounded-lg border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Scan Rwanda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bounded, de-duplicated Maps searches by industry and area. Capped at {MAX_QUERIES_PER_RUN}{" "}
          paid queries per run.
        </p>
        <form onSubmit={onRunScan} className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => toggleIndustry(i.key)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  industries.includes(i.key)
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(["national", "province", "districts"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={scopeMode === m ? "default" : "outline"}
                onClick={() => setScopeMode(m)}
              >
                {m === "national" ? "All Rwanda" : m === "province" ? "By province" : "By district"}
              </Button>
            ))}
            {scopeMode === "province" && (
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value as Province)}
                className="rounded border bg-background px-2 py-1.5 text-sm"
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </div>

          {scopeMode === "districts" && (
            <div className="flex flex-wrap gap-1">
              {DISTRICTS[province].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDistrict(d)}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    districts.includes(d)
                      ? "border-primary text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={scanBusy}>
              {scanBusy ? "Scanning…" : "Run Rwanda scan"}
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              {preview.queries.length} queries · est. ${preview.estimatedCostUsd}
              {preview.truncated ? " · capped" : ""}
            </span>
          </div>
        </form>
        {scanResult && <p className="mt-3 font-mono text-sm">{scanResult}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies…"
            className="w-52"
          />
          <select
            value={provinceF}
            onChange={(e) => setProvinceF(e.target.value as Province | "ALL")}
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
            value={industryF}
            onChange={(e) => setIndustryF(e.target.value as IndustryKey | "ALL")}
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
            <option value="all">Any website</option>
            <option value="no_site">No website</option>
            <option value="has_site">Has website</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="OPERATIONAL">Operational</option>
            <option value="CLOSED_PERMANENTLY">Closed permanently</option>
            <option value="CLOSED_TEMPORARILY">Closed temporarily</option>
          </select>
          <label className="flex items-center gap-1 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={hiringOnly}
              onChange={(e) => setHiringOnly(e.target.checked)}
            />
            Hiring signals
          </label>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {companies.data?.length ?? "…"} companies · {noSite} without a website
          </span>
        </div>

        {companies.isError ? (
          <ErrorBanner
            error={companies.error}
            context="Companies"
            onRetry={() => void companies.refetch()}
          />
        ) : companies.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={companies.data?.length ? "No companies match these filters" : "No companies yet"}
            why={
              companies.data?.length
                ? "You have saved companies, but the current filters exclude all of them. Change the province, industry, website or status filters above."
                : "Nothing has been scanned yet. Use the scan form above to search Google Maps by industry and area — results are de-duplicated and bounded to a maximum number of paid queries."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Industry</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Website</th>
                  <th className="px-4 py-2">Contact</th>
                  <th className="px-4 py-2">Workers</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">Signal</th>
                  <th className="px-4 py-2">Services to offer</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((b) => {
                  const loc = locationOf(b);
                  const ind =
                    (b.industry as IndustryKey | null) ??
                    classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
                  const signal = signals.data?.[b.id];
                  const workers =
                    b.employees_min == null && b.employees_max == null
                      ? null
                      : b.employees_min != null && b.employees_max != null
                        ? `${b.employees_min}–${b.employees_max}`
                        : b.employees_min != null
                          ? `${b.employees_min}+`
                          : `≤${b.employees_max}`;
                  return (
                    <tr key={b.id} className="align-top hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          to="/businesses/$id"
                          params={{ id: b.id }}
                          className="font-medium hover:underline"
                        >
                          {b.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{b.category ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ind ? industryLabel(ind) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {loc.district ?? loc.province ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {b.website ? (
                          <a
                            href={b.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            site
                          </a>
                        ) : (
                          <Badge variant="outline" className="border-accent/40 text-accent">
                            no site
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {b.phone ? <div>{b.phone}</div> : null}
                        {b.emails && b.emails.length ? <div>{b.emails[0]}</div> : null}
                        {!b.phone && !(b.emails && b.emails.length) ? "—" : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{workers ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.founded_date ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {signal ? (
                          <span className="text-muted-foreground">
                            {signal.kind.replace(/_/g, " ")}
                            <span className="block">{signal.title}</span>
                          </span>
                        ) : b.last_activity_at ? (
                          <span className="text-muted-foreground">review activity</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {!b.website ? (
                          <Badge variant="outline">Website work</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === b.id}
                            onClick={() => runInvestigation(b.id)}
                          >
                            {busyId === b.id ? "Investigating…" : "Run investigation"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
