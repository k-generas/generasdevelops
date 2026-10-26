import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { investigateBusiness } from "@/lib/discovery.functions";
import { BusinessIntelModal } from "@/components/BusinessIntelModal";
import { type IntelBusinessRow, type IntelInvestigationRow } from "@/components/BusinessIntelModal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_DISTRICTS,
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
import { BUSINESS_CATEGORIES, leadMatchesCategoryPreset } from "@/lib/business-categories";
import { matchesBusinessSearch } from "@/lib/business-search";
import {
  OUTREACH_EVENT_TYPE,
  OUTREACH_STAGES,
  clearLocalStage,
  contactChannels,
  normalizeStage,
  outreachEventFor,
  readLocalStages,
  stageCounts,
  stageLabel,
  stagesFromEvents,
  writeLocalStage,
  type OutreachStage,
} from "@/lib/outreach-tracker";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";

export const Route = createFileRoute("/_authenticated/businesses/")({
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

const WEBSITE_OPTIONS = ["no_site", "unverified", "has_site", "all"] as const;
type WebsiteFilter = (typeof WEBSITE_OPTIONS)[number];

type LeadRow = {
  id: string;
  name: string;
  business_status?: string | null;
  website?: string | null;
};

type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];

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
  const [district, setDistrict] = useState<string>("ALL");
  const [industry, setIndustry] = useState<IndustryKey | "ALL">("ALL");
  const [categoryPreset, setCategoryPreset] = useState<string>("ALL");
  const [stageFilter, setStageFilter] = useState<OutreachStage | "ANY">("ANY");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stageBusyId, setStageBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // The business whose full-report modal is open (null = closed).
  const [modalBiz, setModalBiz] = useState<LeadRow | null>(null);
  const [localStages, setLocalStages] = useState<Record<string, OutreachStage>>({});

  // Stage changes are stored as events in business_activity_events, which the
  // hosted database already has. Newest event per business wins.
  const outreachEvents = useQuery({
    queryKey: ["outreach-events"],
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

  const stageOf = useMemo(
    () =>
      (b: { id: string; outreach_stage?: string | null }): OutreachStage =>
        localStages[b.id] ?? dbStages[b.id]?.stage ?? normalizeStage(b.outreach_stage),
    [localStages, dbStages],
  );

  useEffect(() => {
    const saved = readLocalStages();
    setLocalStages(saved);
    // Anything saved while the database was unreachable is written to the
    // history table on the next visit, so it is never lost.
    const entries = Object.entries(saved);
    if (entries.length === 0) return;
    let cancelled = false;
    void (async () => {
      let synced = 0;
      for (const [id, stage] of entries) {
        if (cancelled) return;
        const { error } = await supabase
          .from("business_activity_events")
          .insert(outreachEventFor(id, stage));
        if (!error) {
          clearLocalStage(id);
          synced++;
        }
      }
      if (!cancelled && synced > 0) {
        setLocalStages(readLocalStages());
        void qc.invalidateQueries({ queryKey: ["outreach-events"] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: async () => {
      // Read every discovered business from local storage so a search never
      // depends on Google Maps being reachable. PostgREST caps a single
      // response, so page through until the dataset is exhausted.
      const PAGE = 1000;
      const all: BusinessRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("businesses")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as BusinessRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    },
  });

  const modalInv = useQuery({
    queryKey: ["investigation", (modalBiz?.id as string) ?? null],
    enabled: !!modalBiz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investigations")
        .select("*")
        .eq("business_id", modalBiz!.id as string)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
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
      // "no_site" only counts businesses we actually verified as having no
      // website; "unverified" is everything else with an empty website field.
      if (website === "no_site" && (b.website || !b.website_checked_at)) return false;
      if (website === "unverified" && (b.website || b.website_checked_at)) return false;
      if (website === "has_site" && !b.website) return false;
      const loc = locationOf(b);
      if (province !== "ALL" && loc.province !== province) return false;
      if (district !== "ALL" && loc.district !== district) return false;
      const ind =
        (b.industry as IndustryKey | null) ??
        classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
      if (industry !== "ALL" && ind !== industry) return false;
      if (
        categoryPreset !== "ALL" &&
        !leadMatchesCategoryPreset(categoryPreset, b.name, b.category)
      )
        return false;
      const st = stageOf(b);
      if (stageFilter !== "ANY" && st !== stageFilter) return false;
      if (!matchesBusinessSearch(b, q)) return false;
      return true;
    });
  }, [
    businesses.data,
    website,
    province,
    district,
    industry,
    categoryPreset,
    stageFilter,
    q,
    stageOf,
  ]);

  // Counters always describe the whole saved list, not the current filters, so
  // "how many did I message" stays visible while browsing.
  const counts = useMemo(() => {
    const all = (businesses.data ?? []).map((b) => ({ outreach_stage: stageOf(b) }));
    return stageCounts(all);
  }, [businesses.data, stageOf]);

  async function setStage(b: BusinessRow, stage: OutreachStage) {
    setStageBusyId(b.id);
    setNote(null);
    // Always save locally first - this is the source of truth for now
    writeLocalStage(b.id, stage);
    setLocalStages((prev) => ({ ...prev, [b.id]: stage }));

    // Try to persist to events table (exists in DB) in background
    try {
      const { error } = await supabase
        .from("business_activity_events")
        .insert(outreachEventFor(b.id, stage));
      if (!error) {
        clearLocalStage(b.id);
        setLocalStages((prev) => {
          const next = { ...prev };
          delete next[b.id];
          return next;
        });
        void qc.invalidateQueries({ queryKey: ["outreach-events"] });
      }
      // If error, just keep it local - no user-facing error
    } catch {
      // Ignore all errors - local save is sufficient
    }
    setStageBusyId(null);
  }

  async function runInvestigation(b: LeadRow) {
    const id = b.id;
    const name = b.name;
    // Open the report modal immediately so the business is visible even if the
    // run later fails (e.g. missing AI/Maps keys).
    setModalBiz(b);
    setBusyId(id);
    setNote(null);
    try {
      await investigate({ data: { businessId: id, provider: "auto" } });
      qc.invalidateQueries({ queryKey: ["businesses"] });
      qc.invalidateQueries({ queryKey: ["businesses-investigated"] });
      qc.invalidateQueries({ queryKey: ["investigation", id] });
      setNote({ ok: true, text: `Investigation complete for ${name}.` });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setNote({ ok: false, text: `Investigation failed: ${text}` });
    }
    setBusyId(null);
  }

  const noSite = rows.filter((b) => !b.website && b.website_checked_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} shown of {businesses.data?.length ?? "…"} saved · {noSite} verified with
            no website
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <CountChip label="Scanned" value={counts.total} />
            <CountChip
              label="Messaged"
              value={counts.messaged}
              className={stageClass("messaged")}
            />
            <CountChip label="Replied" value={counts.replied} className={stageClass("replied")} />
            <CountChip
              label="Negotiating"
              value={counts.negotiating}
              className={stageClass("negotiating")}
            />
            <CountChip label="Won" value={counts.won} className={stageClass("won")} />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved leads…"
            className="w-52"
          />
          <Select
            value={stageFilter}
            onValueChange={(v) => setStageFilter(v as OutreachStage | "ANY")}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Any stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Any stage</SelectItem>
              {OUTREACH_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryPreset} onValueChange={(v) => setCategoryPreset(v)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All business types" />
            </SelectTrigger>
            <SelectContent className="max-h-96">
              <SelectItem value="ALL">All business types</SelectItem>
              {BUSINESS_CATEGORIES.map((group) => (
                <SelectGroup key={group.name}>
                  <SelectLabel>{group.name}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value as Province | "ALL");
              setDistrict("ALL");
            }}
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
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            <option value="ALL">All districts</option>
            {(province === "ALL" ? ALL_DISTRICTS : DISTRICTS[province]).map((d) => (
              <option key={d} value={d}>
                {d}
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
            <option value="no_site">No website (verified)</option>
            <option value="unverified">No website (unverified)</option>
            <option value="has_site">Has website</option>
            <option value="all">Any website</option>
          </select>
        </div>
      </div>

      {businesses.isError && (
        <ErrorBanner
          error={businesses.error}
          context="Loading leads"
          onRetry={() => void businesses.refetch()}
        />
      )}

      {note && (
        <p
          className={`rounded border p-3 text-sm ${
            note.ok
              ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
              : "border-destructive text-destructive"
          }`}
        >
          {note.text}
        </p>
      )}

      {businesses.isError ? (
        <p className="text-sm text-muted-foreground">
          The lead list could not be loaded — see the error above for the cause and how to fix it.
        </p>
      ) : businesses.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            businesses.data?.length ? "No businesses match these filters" : "No businesses yet"
          }
          why={
            businesses.data?.length
              ? "You have saved leads, but the current website/province/industry/search filters exclude all of them. Reset the filters above to see your list."
              : "Nothing has been discovered yet. Run a discovery search on the Discover page — only real Google Maps results are stored."
          }
          action={
            businesses.data?.length ? (
              <div className="flex justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWebsite("all");
                    setProvince("ALL");
                    setDistrict("ALL");
                    setIndustry("ALL");
                    setCategoryPreset("ALL");
                    setStageFilter("ANY");
                    setQ("");
                  }}
                >
                  Reset filters
                </Button>
              </div>
            ) : (
              <div className="flex justify-center">
                <Button asChild size="sm" variant="outline">
                  <Link to="/discover">Go to Discover</Link>
                </Button>
              </div>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const loc = locationOf(b);
            const ind =
              (b.industry as IndustryKey | null) ??
              classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
            const investigatedFlag = investigated.data?.has(b.id) ?? false;
            const closedFlag = b.business_status === "CLOSED_PERMANENTLY";
            const hasBadges = !b.website || investigatedFlag || closedFlag;
            const { phone, email, extraEmails } = contactChannels(b);
            const stage = stageOf(b);
            return (
              <div
                key={b.id}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/businesses/$id"
                    params={{ id: b.id }}
                    className="min-w-0 flex-1 truncate font-medium"
                  >
                    {b.name}
                  </Link>
                  <span className="shrink-0 text-sm font-semibold text-primary">
                    {b.score ?? "—"}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[ind ? industryLabel(ind) : b.category, loc.district ?? loc.province, b.address]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {(phone || email) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {phone && <span className="truncate">📞 {phone}</span>}
                    {email && (
                      <a
                        href={`mailto:${email}`}
                        className="truncate text-primary hover:underline"
                        title={email}
                      >
                        ✉ {email}
                        {extraEmails.length > 0 ? ` +${extraEmails.length}` : ""}
                      </a>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Select
                    value={stage}
                    disabled={stageBusyId === b.id}
                    onValueChange={(v) => setStage(b, v as OutreachStage)}
                  >
                    <SelectTrigger className={`h-7 w-36 text-xs ${stageClass(stage)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTREACH_STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {stageLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(dbStages[b.id]?.at || b.last_contacted_at) && stage !== "not_contacted" && (
                    <span className="truncate text-xs text-muted-foreground">
                      {new Date(dbStages[b.id]?.at || b.last_contacted_at!).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {hasBadges && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!b.website && b.website_checked_at && (
                      <Badge variant="outline" className="border-accent/40 text-accent">
                        no site
                      </Badge>
                    )}
                    {!b.website && !b.website_checked_at && (
                      <Badge variant="outline" className="text-muted-foreground">
                        unchecked
                      </Badge>
                    )}
                    {investigatedFlag && (
                      <Badge variant="outline" className="text-muted-foreground">
                        investigated
                      </Badge>
                    )}
                    {closedFlag && <Badge variant="destructive">closed</Badge>}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setModalBiz(b);
                      setNote(null);
                    }}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === b.id}
                    onClick={() => runInvestigation(b)}
                  >
                    {busyId === b.id ? "Investigating…" : "Run investigation"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalBiz && (
        <BusinessIntelModal
          open={!!modalBiz}
          onOpenChange={(o) => {
            if (!o) {
              setModalBiz(null);
              setNote(null);
            }
          }}
          business={modalBiz as unknown as IntelBusinessRow}
          investigation={(modalInv.data ?? null) as unknown as IntelInvestigationRow | null}
          provider="auto"
          investigating={busyId === (modalBiz.id as string)}
          error={note && !note.ok ? note.text : null}
          outreachEnabled={outreachEnabled(modalBiz, modalInv.data)}
        />
      )}
    </div>
  );
}

function CountChip({
  label,
  value,
  className = "",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
        className || "border-border text-muted-foreground"
      }`}
    >
      <span className={className ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function stageClass(stage: OutreachStage) {
  if (stage === "won") return "border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
  if (stage === "negotiating") return "border-amber-500/40 text-amber-700 dark:text-amber-400";
  if (stage === "replied") return "border-sky-500/40 text-sky-700 dark:text-sky-400";
  if (stage === "messaged") return "border-primary/40 text-primary";
  if (stage === "lost") return "border-destructive/40 text-destructive";
  return "";
}

function outreachEnabled(biz: LeadRow, inv: unknown): boolean {
  if (biz.business_status === "CLOSED_PERMANENTLY") return false;
  const report = (inv as { report?: { recommended_offer?: string } } | null)?.report;
  if (!report) return false;
  return !String(report.recommended_offer ?? "").startsWith("No offer");
}
