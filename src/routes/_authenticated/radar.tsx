import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { investigateBusiness } from "@/lib/discovery.functions";
import { runRwandaScan } from "@/lib/rwanda-discovery.functions";
import {
  getMonitoringSettings,
  runMonitoringNow,
  saveMonitoringSettings,
} from "@/lib/monitoring.functions";
import { generateProposal } from "@/lib/proposals.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OpportunityClusters } from "@/components/OpportunityClusters";
import { OpportunityMap } from "@/components/OpportunityMap";
import { OpportunitySignalsPanel } from \"@/components/OpportunitySignalsPanel\";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { useOffers } from "@/lib/offers.hooks";
import { ALL_DISTRICTS, provinceOfDistrict, type IndustryKey } from "@/lib/rwanda";
import { coverageReport } from "@/lib/source-registry";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import type { IntelFindings } from "@/lib/business-intel";
import {
  RADAR_CATEGORIES,
  RADAR_MONITORING,
  RADAR_RADIUS_KM,
  RADAR_SERVICES,
  buildDensityClusters,
  businessDistrict,
  categoryIndustries,
  categoryLabel,
  centerFor,
  defaultRadarSettings,
  monitoringPolicy,
  opportunityFor,
  radarFreshness,
  readRadarSettings,
  serviceLabel,
  splitNewAndKnown,
  type RadarBusiness,
  type RadarCategoryKey,
  type RadarMonitoringKey,
  type RadarOpportunity,
  type RadarServiceKey,
  type RadarSettings,
} from "@/lib/radar";

export const Route = createFileRoute("/_authenticated/radar")({
  head: () => ({
    meta: [
      { title: "Opportunity Radar — GARE" },
      {
        name: "description",
        content:
          "Location-aware opportunity radar: nearby businesses, observable gaps, evidence-backed scoring and one-click handoff into your pipeline.",
      },
    ],
  }),
  component: RadarPage,
});

const SETTINGS_KEY = "gare.radar.settings";

function loadSettings(): RadarSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? readRadarSettings(JSON.parse(raw)) : defaultRadarSettings();
  } catch {
    return defaultRadarSettings();
  }
}

function RadarPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scan = useServerFn(runRwandaScan);
  const investigate = useServerFn(investigateBusiness);
  const draft = useServerFn(generateProposal);
  const loadMonitoring = useServerFn(getMonitoringSettings);
  const saveMonitoring = useServerFn(saveMonitoringSettings);
  const runDailyNow = useServerFn(runMonitoringNow);
  const { data: offersResult } = useOffers();
  const offers = useMemo(() => offersResult?.offers ?? [], [offersResult]);

  const [settings, setSettings] = useState<RadarSettings>(() => loadSettings());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [view, setView] = useState<"clusters" | "map" | "signals">("clusters");
  const [gapFilter, setGapFilter] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    loadMonitoring()
      .then((row) => {
        if (cancelled || !row) return;
        setSettings((s) => ({
          ...s,
          district: row.district ?? s.district,
          category: (row.category as RadarCategoryKey) ?? s.category,
          monitoring: row.enabled ? "daily" : s.monitoring,
        }));
        if (row.last_run_at) {
          setAutoNote(
            `Daily target saved · last run ${new Date(row.last_run_at).toLocaleString()}`,
          );
        }
      })
      .catch(() => {
        /* not signed in or offline — local settings still work */
      });
    return () => {
      cancelled = true;
    };
  }, [loadMonitoring]);

  // Keep the saved daily target in sync when its area/focus changes.
  useEffect(() => {
    if (settings.monitoring !== "daily" || !settings.district) return;
    const t = setTimeout(() => {
      saveMonitoring({
        data: {
          enabled: true,
          district: settings.district,
          category: settings.category,
          maxQueries: 10,
        },
      }).catch(() => {
        /* best effort — the toggle already reports hard failures */
      });
    }, 800);
    return () => clearTimeout(t);
  }, [settings.monitoring, settings.district, settings.category, saveMonitoring]);

  const businesses = useQuery({
    queryKey: ["radar-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as RadarBusiness[];
    },
  });

  const investigations = useQuery({
    queryKey: ["radar-investigations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("investigations")
        .select("business_id,findings,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      return (data ?? []) as {
        business_id: string;
        findings: IntelFindings | null;
        created_at: string;
      }[];
    },
  });

  const pipeline = useQuery({
    queryKey: ["radar-pipeline"],
    queryFn: async () => {
      const { data } = await supabase.from("proposals").select("business_id");
      return new Set((data ?? []).map((r) => r.business_id as string));
    },
  });

  const findingsMap = useMemo(() => {
    const map = new Map<string, { findings: IntelFindings | null; at: string }>();
    for (const row of investigations.data ?? []) {
      if (!map.has(row.business_id))
        map.set(row.business_id, { findings: row.findings, at: row.created_at });
    }
    return map;
  }, [investigations.data]);

  const radarOffers = useMemo(
    () =>
      offers.filter((o) => o.active).map((o) => ({ name: o.name, default_price: o.default_price })),
    [offers],
  );

  const center = useMemo(
    () => centerFor(businesses.data ?? [], settings, (b) => businessDistrict(b as RadarBusiness)),
    [businesses.data, settings],
  );

  const opportunities = useMemo(() => {
    const now = new Date();
    const list: RadarOpportunity[] = [];
    for (const b of businesses.data ?? []) {
      const inv = findingsMap.get(b.id);
      const o = opportunityFor({
        business: b,
        findings: inv?.findings ?? null,
        investigationAt: inv?.at ?? null,
        settings,
        offers: radarOffers,
        center,
        inPipeline: pipeline.data?.has(b.id) ?? false,
        now,
      });
      if (o) list.push(o);
    }
    return list.sort((a, b) => b.priority - a.priority || b.confidence - a.confidence);
  }, [businesses.data, findingsMap, settings, radarOffers, center, pipeline.data]);

  const shown = useMemo(
    () =>
      gapFilter
        ? opportunities.filter((o) => o.gaps.some((g) => g.key === gapFilter))
        : opportunities,
    [opportunities, gapFilter],
  );

  const clusters = useMemo(() => buildDensityClusters(shown), [shown]);
  const { fresh, known } = useMemo(() => splitNewAndKnown(shown), [shown]);
  const mapPoints = useMemo(
    () =>
      shown
        .filter((o) => o.latitude != null && o.longitude != null)
        .map((o) => ({
          id: o.id,
          label: o.name,
          lat: o.latitude as number,
          lng: o.longitude as number,
          priority: o.priority,
          needsVerification: o.needsVerification,
        })),
    [shown],
  );
  const needsVerification = useMemo(() => shown.filter((o) => o.needsVerification).length, [shown]);

  const coverage = useMemo(() => coverageReport(), []);
  const monitoring = monitoringPolicy(settings.monitoring);

  function patch(patchSettings: Partial<RadarSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  async function runScan() {
    if (!settings.district) {
      setNote({ ok: false, text: "Pick a district first — each run is bounded to one district." });
      return;
    }
    setScanBusy(true);
    setScanResult(null);
    setNote(null);
    try {
      const industries: IndustryKey[] = categoryIndustries(settings.category) ?? ["other"];
      const result = await scan({
        data: {
          industries,
          districts: [settings.district],
          maxQueries: 10,
          title: `Radar scan · ${settings.district}`,
        },
      });
      setScanResult(
        `Ran ${result.queries} ${result.queries === 1 ? "query" : "queries"} · ${result.found} found · ${result.added} new · est. $${result.estimatedCostUsd}${result.truncated ? " (capped)" : ""}${result.failedQueries ? ` · ${result.failedQueries} failed` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["radar-businesses"] });
    } catch (e) {
      setNote({ ok: false, text: `Scan failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setScanBusy(false);
    }
  }

  async function changeMonitoring(key: RadarMonitoringKey) {
    if (key === "daily" && !settings.district) {
      setNote({ ok: false, text: "Pick a district before enabling the daily scan." });
      return;
    }
    setSettings((s) => ({ ...s, monitoring: key }));
    setAutoBusy(true);
    setNote(null);
    try {
      const row = await saveMonitoring({
        data: {
          enabled: key === "daily",
          district: settings.district,
          category: settings.category,
          maxQueries: 10,
        },
      });
      setAutoNote(
        key === "daily"
          ? `Daily automatic scan on · ${row.district ?? "all districts"} · ${categoryLabel(settings.category)}`
          : "Automatic daily scan off.",
      );
    } catch (e) {
      setNote({
        ok: false,
        text: `Could not save target: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setAutoBusy(false);
    }
  }

  async function runDailyScanNow() {
    setAutoBusy(true);
    setNote(null);
    setAutoNote(null);
    try {
      const out = await runDailyNow();
      if (out.status === "failed") {
        setAutoNote(`Daily scan failed: ${out.error}`);
      } else {
        setAutoNote(
          `Daily scan finished · ${out.result?.found ?? 0} found · ${out.added} new · see Updates.`,
        );
        qc.invalidateQueries({ queryKey: ["radar-businesses"] });
      }
    } catch (e) {
      setNote({
        ok: false,
        text: `Daily scan failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setAutoBusy(false);
    }
  }

  async function runInvestigation(id: string) {
    setBusyId(id);
    setNote(null);
    try {
      await investigate({ data: { businessId: id, provider: "auto" } });
      setNote({ ok: true, text: "Investigation complete — evidence refreshed." });
      qc.invalidateQueries({ queryKey: ["radar-businesses"] });
      qc.invalidateQueries({ queryKey: ["radar-investigations"] });
    } catch (e) {
      setNote({
        ok: false,
        text: `Investigation failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    setBusyId(null);
  }

  async function draftProposal(o: RadarOpportunity) {
    const offer = o.matches[0]?.offer;
    setBusyId(o.id);
    setNote(null);
    try {
      const res = await draft({
        data: {
          businessId: o.id,
          mode: "First-contact message",
          provider: "auto",
          ...(offer ? { offer } : {}),
        },
      });
      await navigate({ to: "/proposals/$id", params: { id: res.proposalId } });
    } catch (e) {
      setNote({
        ok: false,
        text: `Drafting failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      setBusyId(null);
    }
  }

  function exportCsv() {
    const rows = shown.map((o) => ({
      name: o.name,
      district: o.district ?? "",
      province: o.province ?? "",
      industry: o.industryLabel,
      distance_km: o.distanceKm != null ? o.distanceKm.toFixed(1) : "",
      priority: o.priority.toFixed(2),
      confidence: o.confidence.toFixed(2),
      needs_verification: o.needsVerification,
      in_pipeline: o.inPipeline,
      gaps: o.gaps.map((g) => `${g.label} (${g.severity})`).join("; "),
      offers: o.matches.map((m) => m.offer).join("; "),
      phone: o.phone ?? "",
      website: o.website ?? "",
      last_checked: o.lastCheckedAt ?? "",
    }));
    downloadCsv(
      rowsToCsv(rows),
      `radar-opportunities-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const loading = businesses.isLoading;
  const monitored = monitoringPolicy(settings.monitoring);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Local Opportunity Radar</h1>
        <p className="text-sm text-muted-foreground">
          Businesses near your chosen area whose unmet needs are already visible in the evidence we
          hold — scored, and ready to hand into your pipeline.
        </p>
        <p className="text-xs text-muted-foreground">
          Sources: {coverage.active.length} live · {coverage.pending.length} pending ·{" "}
          {coverage.blocked.length} blocked. {coverage.note}
        </p>
      </header>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Search area</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={settings.district ?? ""}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  district: e.target.value || null,
                  centerLat: null,
                  centerLng: null,
                }))
              }
            >
              <option value="">All districts</option>
              {ALL_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Industry focus</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={settings.category}
              onChange={(e) =>
                setSettings((s) => ({ ...s, category: e.target.value as RadarCategoryKey }))
              }
            >
              {RADAR_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Service fit</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={settings.service}
              onChange={(e) =>
                setSettings((s) => ({ ...s, service: e.target.value as RadarServiceKey }))
              }
            >
              {RADAR_SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Monitoring</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={settings.monitoring}
              disabled={autoBusy}
              onChange={(e) => void changeMonitoring(e.target.value as RadarMonitoringKey)}
            >
              {RADAR_MONITORING.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1 text-sm">
            <span className="font-medium">Radius</span>
            <div className="flex flex-wrap gap-1">
              {RADAR_RADIUS_KM.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={settings.radiusKm === r ? "default" : "outline"}
                  onClick={() => setSettings((s) => ({ ...s, radiusKm: r }))}
                >
                  {r} km
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md border bg-background/40 p-3">
          <p className="text-sm font-medium">Automatic daily scan</p>
          <p className="text-xs text-muted-foreground">
            Set <span className="font-medium">Monitoring</span> to “Daily scan” above to save this
            target (area + industry focus). Once the daily job is scheduled, it is scanned every day
            and what it found appears in Updates. You can also run it right now.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={autoBusy || !settings.district}
              onClick={runDailyScanNow}
            >
              {autoBusy ? "Working…" : "Run daily scan now"}
            </Button>
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link to="/updates">View updates</Link>
            </Button>
          </div>
          {autoNote && <p className="text-xs text-muted-foreground">{autoNote}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={scanBusy} onClick={runScan}>
            {scanBusy ? "Scanning…" : "Run radar scan"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {settings.district
              ? `One district · ${categoryLabel(settings.category)} · up to 10 paid Google queries`
              : "Pick a district to enable a bounded scan."}
          </span>
        </div>
        {scanResult && <p className="text-xs text-muted-foreground">{scanResult}</p>}
        <p className="text-xs text-muted-foreground">{monitoring.note}</p>
      </section>

      {(businesses.isError || investigations.isError || pipeline.isError) && (
        <ErrorBanner
          error={(businesses.error ?? investigations.error ?? pipeline.error) as Error}
          context="Radar"
          onRetry={() => {
            if (businesses.isError) void businesses.refetch();
            if (investigations.isError) void investigations.refetch();
            if (pipeline.isError) void pipeline.refetch();
          }}
        />
      )}

      {note && (
        <p
          className={`rounded-md border p-3 text-sm ${note.ok ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400" : "border-destructive/50 text-destructive"}`}
        >
          {note.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{shown.length} opportunities</span>
        <Badge variant="secondary">{fresh.length} new</Badge>
        <Badge variant="secondary">{known.length} in pipeline</Badge>
        <Badge variant={shown.some((o) => o.needsVerification) ? "destructive" : "outline"}>
          {shown.filter((o) => o.needsVerification).length} need verification
        </Badge>
        <Badge variant="outline">{clusters.length} clusters</Badge>
        <span className="text-xs text-muted-foreground">
          Centre:{" "}
          {center
            ? `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)} · ${settings.radiusKm} km`
            : "none yet — no stored coordinates in this area"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={view === "clusters" ? "default" : "outline"}
          onClick={() => setView("clusters")}
        >
          Density clusters
        <Button size="sm" variant={view === "signals" ? "default" : "outline"} onClick={() => setView("signals")}>Opportunity Signals</Button>
        </Button>
        <Button
          size="sm"
          variant={view === "map" ? "default" : "outline"}
          onClick={() => setView("map")}
        >
          Map
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCsv(
              rowsToCsv(
                shown.map((o) => ({
                  name: o.name,
                  district: o.district ?? "",
                  industry: o.industryLabel,
                  priority: o.priority.toFixed(3),
                  confidence: o.confidence.toFixed(3),
                  needs_verification: o.needsVerification,
                  distance_km: o.distanceKm == null ? "" : o.distanceKm.toFixed(1),
                  gaps: o.gaps.map((g) => g.label).join("; "),
                  offers: o.matches.map((m) => m.offer).join("; "),
                })),
              ),
              "radar-opportunities.csv",
            )
          }
        >
          Export CSV
        </Button>
        {gapFilter && (
          <Button size="sm" variant="ghost" onClick={() => setGapFilter(null)}>
            Clear gap filter
          </Button>
        )}
      </div>

      {view === "clusters" ? (
        <OpportunityClusters clusters={clusters} onSelect={(k) => setGapFilter(k)} />
      ) : (
        <OpportunityMap points={mapPoints} center={center} radiusKm={settings.radiusKm} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Opportunities <span className="text-muted-foreground">({shown.length})</span>
        </h2>

        <p className="text-xs text-muted-foreground">
          Service filter: {serviceLabel(settings.service)} · {monitoring.label} — {monitoring.note}
        </p>

        {businesses.isError ? (
          <ErrorBanner
            error={businesses.error}
            context="Opportunities"
            onRetry={() => void businesses.refetch()}
          />
        ) : businesses.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading businesses…</p>
        ) : shown.length === 0 ? (
          <EmptyState
            title="No opportunities match these filters"
            why="A lead only appears when there is an observable gap in the evidence we hold — never just because it is nearby. Try a wider radius, a different industry focus, or run a radar scan for this district to gather evidence first."
            action={
              <Button size="sm" variant="outline" disabled={scanBusy} onClick={runScan}>
                {scanBusy ? "Scanning…" : "Run radar scan now"}
              </Button>
            }
          />
        ) : (
          shown.map((o) => (
            <OpportunityCard
              key={o.id}
              o={o}
              busy={busyId === o.id}
              onInvestigate={runInvestigation}
              onDraft={draftProposal}
            />
          ))
        )}
      </section>
    </div>
  );
}

function OpportunityCard({
  o,
  busy,
  onInvestigate,
  onDraft,
}: {
  o: RadarOpportunity;
  busy: boolean;
  onInvestigate: (id: string) => void;
  onDraft: (o: RadarOpportunity) => void;
}) {
  const freshness = radarFreshness(o.observedAt);
  const best = o.matches[0];
  return (
    <article className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/businesses/$id" params={{ id: o.id }} className="font-semibold hover:underline">
          {o.name}
        </Link>
        <Badge>priority {(o.priority * 100).toFixed(0)}%</Badge>
        <Badge variant="outline">confidence {(o.confidence * 100).toFixed(0)}%</Badge>
        {o.needsVerification && <Badge variant="destructive">needs verification</Badge>}
        {o.inPipeline && <Badge variant="secondary">in pipeline</Badge>}
        {o.distanceKm != null && (
          <span className="text-xs text-muted-foreground">{o.distanceKm.toFixed(1)} km away</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {o.industryLabel} · {o.district ?? "Unknown district"}
        {o.province ? ` · ${provinceOfDistrict(o.district ?? "") ?? o.province}` : ""} ·{" "}
        {freshness.label}
        {best ? ` · best fit: ${best.offer}` : " · no offer match yet"}
      </p>

      <div className="flex flex-wrap gap-1">
        {o.gaps.map((g) => (
          <Badge key={g.key} variant="outline" title={g.evidence}>
            {g.label} · {g.severity}
          </Badge>
        ))}
      </div>

      {o.matches.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {o.matches.slice(0, 3).map((m) => (
            <li key={m.offer}>
              {m.offer} · {(m.confidence * 100).toFixed(0)}%{m.recurring ? " · recurring" : ""}
              {m.hypothesis ? " · hypothesis" : ""}
            </li>
          ))}
        </ul>
      )}

      {o.reasons.length > 0 && (
        <p className="text-xs text-muted-foreground">Why: {o.reasons.slice(0, 2).join(" · ")}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onInvestigate(o.id)}>
          {busy ? "Working…" : "Investigate"}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/businesses/$id" params={{ id: o.id }}>
            Open lead
          </Link>
        </Button>
        {best && (
          <Button size="sm" disabled={busy} onClick={() => onDraft(o)}>
            {busy ? "Working…" : `Draft outreach`}
          </Button>
        )}
      </div>
    </article>
  );
}
