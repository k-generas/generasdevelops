import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Facebook,
  Instagram,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";
import { SocialBusinessMatchPanel } from "@/components/SocialBusinessMatchPanel";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";
import {
  deleteSocialLead,
  discoverInstagramLeads,
  getSocialLeads,
  importSocialLeads,
  promoteSocialLead,
  refreshSocialLead,
  updateSocialLeadStatus,
} from "@/lib/social-leads.functions";
import {
  SOCIAL_LEAD_STATUS_LABELS,
  SOCIAL_LEAD_STATUS_VARIANTS,
  STORE_STATUS_LABELS,
  WEBSITE_STATUS_LABELS,
  socialLeadPlatformLabel,
  type SocialLeadStatus,
  type SocialLeadStoreStatus,
  type SocialLeadWebsiteStatus,
} from "@/lib/social-leads";
import { socialAccountTypeLabel } from "@/lib/social-business-match";

export const Route = createFileRoute("/_authenticated/social-leads")({
  head: () => ({
    meta: [
      { title: "Social Leads — GARE" },
      {
        name: "description",
        content:
          "Find active Instagram and Facebook sellers that have no owned online store and need one.",
      },
    ],
  }),
  component: SocialLeadsPage,
});

type LeadRow = Database["public"]["Tables"]["social_leads"]["Row"];

const DEFAULT_HASHTAGS = "kigali, rwanda, kigalibusiness, madeinrwanda";

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString();
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function scoreClass(score: number): string {
  if (score >= 70)
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (score >= 45) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recentMedia(row: LeadRow): Array<{
  caption?: string | null;
  permalink?: string | null;
  like_count?: number | null;
  comments_count?: number | null;
  timestamp?: string | null;
}> {
  const raw = asRecord(row.evidence)["recentMedia"];
  return Array.isArray(raw)
    ? raw.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
    : [];
}

function needsOf(row: LeadRow): string[] {
  return Array.isArray(row.needs)
    ? row.needs.filter((item): item is string => typeof item === "string")
    : [];
}

function scoreFactors(row: LeadRow): Array<[string, number]> {
  const factors = asRecord(row.score_factors);
  return [
    ["Demand", Number(factors["demand"] ?? 0)],
    ["Engagement", Number(factors["engagement"] ?? 0)],
    ["Activity", Number(factors["activity"] ?? 0)],
    ["Store gap", Number(factors["opportunity"] ?? 0)],
    ["Contact", Number(factors["contact"] ?? 0)],
    ["Local", Number(factors["local"] ?? 0)],
  ];
}

function PlatformIcon({ platform }: { platform: string }) {
  return platform === "facebook" ? (
    <Facebook className="h-4 w-4" />
  ) : (
    <Instagram className="h-4 w-4" />
  );
}

function SocialLeadsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const load = useServerFn(getSocialLeads);
  const importLeads = useServerFn(importSocialLeads);
  const discover = useServerFn(discoverInstagramLeads);
  const refresh = useServerFn(refreshSocialLead);
  const updateStatus = useServerFn(updateSocialLeadStatus);
  const remove = useServerFn(deleteSocialLead);
  const promote = useServerFn(promoteSocialLead);

  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [sort, setSort] = useState("score");
  const [detail, setDetail] = useState<LeadRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRaw, setImportRaw] = useState("");
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [hashtags, setHashtags] = useState(DEFAULT_HASHTAGS);
  const [limit, setLimit] = useState("20");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const leadsQuery = useQuery({
    queryKey: ["social-leads"],
    queryFn: () => load({}),
  });

  const rows = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data?.leads]);
  const connection = leadsQuery.data?.connection;
  const tableReady = connection?.tableReady ?? true;

  const refreshList = () => {
    setNotice(null);
    qc.invalidateQueries({ queryKey: ["social-leads"] });
  };

  const importMutation = useMutation({
    mutationFn: () =>
      importLeads({
        data: {
          raw: importRaw,
          liveLookup: Boolean(connection?.configured),
        },
      }),
    onSuccess: (result) => {
      setError(null);
      setImportOpen(false);
      setImportRaw("");
      const extra = result.errors.length
        ? ` ${result.errors.length} issue(s): ${result.errors[0]}`
        : "";
      setNotice(`Imported ${result.saved} profile(s).${extra}`);
      refreshList();
    },
    onError: setError,
  });

  const discoverMutation = useMutation({
    mutationFn: () =>
      discover({
        data: {
          hashtags: hashtags
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 5),
          limit: Number(limit),
        },
      }),
    onSuccess: (result) => {
      setError(null);
      setDiscoverOpen(false);
      setNotice(
        `Found ${result.found} public profile(s), saved ${result.saved}. ${
          result.errors.length ? `${result.errors.length} issue(s).` : ""
        }`,
      );
      refreshList();
    },
    onError: setError,
  });

  const refreshMutation = useMutation({
    mutationFn: (id: string) => refresh({ data: { id } }),
    onSuccess: (row) => {
      setError(null);
      setDetail(row);
      setNotice(`Refreshed @${row.handle}.`);
      refreshList();
    },
    onError: setError,
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: SocialLeadStatus }) =>
      updateStatus({
        data: {
          id: input.id,
          status: input.status as "new" | "reviewing" | "qualified" | "dismissed",
        },
      }),
    onSuccess: (row) => {
      setError(null);
      setDetail(row);
      setNotice(
        `@${row.handle} is now ${SOCIAL_LEAD_STATUS_LABELS[row.status as SocialLeadStatus] ?? row.status}.`,
      );
      refreshList();
    },
    onError: setError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      setError(null);
      setDetail(null);
      setNotice("Lead deleted.");
      refreshList();
    },
    onError: setError,
  });

  const promoteMutation = useMutation({
    mutationFn: (id: string) => promote({ data: { id } }),
    onSuccess: ({ businessId }) => {
      setError(null);
      setDetail(null);
      setNotice("Promoted to the business pipeline.");
      refreshList();
      void navigate({ to: "/businesses/$id", params: { id: businessId } });
    },
    onError: setError,
  });

  const districts = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.district).filter((value): value is string => Boolean(value))),
      ).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const minimum = Number(minScore);
    const result = rows.filter((row) => {
      if (row.lead_score < minimum) return false;
      if (websiteFilter !== "all" && row.website_status !== websiteFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (districtFilter !== "all" && row.district !== districtFilter) return false;
      if (!term) return true;
      return [row.handle, row.display_name, row.biography, row.category, row.district]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });

    return result.sort((a, b) => {
      if (sort === "recent") {
        return String(b.last_post_at ?? "").localeCompare(String(a.last_post_at ?? ""));
      }
      if (sort === "followers") return (b.followers_count ?? 0) - (a.followers_count ?? 0);
      return b.lead_score - a.lead_score;
    });
  }, [rows, search, minScore, websiteFilter, statusFilter, districtFilter, sort]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => {
      const days = daysSince(row.last_post_at);
      return days !== null && days <= 30;
    }).length;
    const noStore = rows.filter((row) =>
      ["none", "whatsapp_only", "link_hub"].includes(row.store_status),
    ).length;
    const high = rows.filter((row) => row.lead_score >= 60).length;
    return { total: rows.length, high, noStore, active };
  }, [rows]);

  const exportCsv = () => {
    const data = filtered.map((row) => ({
      platform: row.platform,
      handle: row.handle,
      name: row.display_name ?? "",
      profile_url: row.profile_url,
      category: row.category ?? "",
      district: row.district ?? "",
      followers: row.followers_count ?? "",
      media_count: row.media_count ?? "",
      last_post_at: row.last_post_at ?? "",
      website: row.website ?? "",
      website_status: row.website_status,
      store_status: row.store_status,
      lead_score: row.lead_score,
      contact_phone: row.contact_phone ?? "",
      contact_whatsapp: row.contact_whatsapp ?? "",
      needs: needsOf(row).join(" | "),
      status: row.status,
    }));
    downloadCsv(rowsToCsv(data), "social-leads.csv");
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Social sellers
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Instagram & Facebook leads</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Active social sellers with no owned online store. Use the evidence and score to decide
            who needs a DUKALINKA store and WhatsApp ordering. This is a public-profile lead engine,
            not a complete Instagram directory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={!tableReady}
          >
            <Upload /> Import profiles
          </Button>
          <Button
            size="sm"
            onClick={() => setDiscoverOpen(true)}
            disabled={!tableReady || !connection?.configured}
          >
            <Sparkles /> Discover Instagram
          </Button>
        </div>
      </header>

      {tableReady ? null : (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium">Database setup required</p>
          <p className="mt-1 text-muted-foreground">
            The <code>social_leads</code> table is not available yet. Apply{" "}
            <code>supabase/migrations/20261104000000_social_leads.sql</code> with{" "}
            <code>npm run db:migrate</code>, or ask Lovable to apply the migration.
          </p>
          {connection?.tableError ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">{connection.tableError}</p>
          ) : null}
        </section>
      )}

      {connection && !connection.configured ? (
        <section className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-4 text-sm">
          <p className="font-medium">Instagram API is not connected yet</p>
          <p className="mt-1 text-muted-foreground">
            Add <code>{connection.missing.join("</code> and <code>")}</code> in Lovable secrets.
            Imports still work; live followers, posts and website discovery need the Meta app.
          </p>
        </section>
      ) : null}

      {error ? <ErrorBanner error={error} context="Social leads" onRetry={refreshList} /> : null}
      {notice ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          {notice}
        </div>
      ) : null}
      {leadsQuery.isError ? (
        <ErrorBanner
          error={leadsQuery.error}
          context="Social leads"
          onRetry={() => void leadsQuery.refetch()}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Leads", stats.total, "Public profiles saved"],
          ["High demand", stats.high, "Score 60+"],
          ["No store signal", stats.noStore, "Best DUKALINKA fit"],
          ["Active 30d", stats.active, "Posted recently"],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search handle, name, bio, category"
              className="pl-8"
              aria-label="Search social leads"
            />
          </label>
          <select
            value={minScore}
            onChange={(event) => setMinScore(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Minimum score"
          >
            <option value="0">Any score</option>
            <option value="40">Score 40+</option>
            <option value="60">Score 60+</option>
            <option value="75">Score 75+</option>
          </select>
          <select
            value={websiteFilter}
            onChange={(event) => setWebsiteFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Website status"
          >
            <option value="all">Any website</option>
            <option value="none">No website</option>
            <option value="dead">Website down</option>
            <option value="link_hub">Link hub only</option>
            <option value="whatsapp">WhatsApp link</option>
            <option value="live">Website live</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            aria-label="Lead status"
          >
            <option value="all">Any status</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="qualified">Qualified</option>
            <option value="promoted">Promoted</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={districtFilter}
              onChange={(event) => setDistrictFilter(event.target.value)}
              className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm"
              aria-label="District"
            >
              <option value="all">Any district</option>
              {districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm"
              aria-label="Sort"
            >
              <option value="score">Best score</option>
              <option value="recent">Recent post</option>
              <option value="followers">Most followers</option>
            </select>
          </div>
        </div>
      </section>

      {leadsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading social leads…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No social leads yet" : "No leads match these filters"}
          why={
            rows.length === 0
              ? connection?.configured
                ? "Run Discover Instagram with local hashtags, or import profile URLs you already have."
                : "Import profile URLs now, then connect the Meta API for live followers, posts and website checks."
              : "Raise the score range or clear a filter to see more profiles."
          }
          action={
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload /> Import
              </Button>
              <Button
                size="sm"
                onClick={() => setDiscoverOpen(true)}
                disabled={!connection?.configured}
              >
                <Sparkles /> Discover
              </Button>
            </div>
          }
        />
      ) : (
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Profile</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Audience</th>
                  <th className="px-3 py-2 font-medium">Activity</th>
                  <th className="px-3 py-2 font-medium">Store gap</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const days = daysSince(row.last_post_at);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b align-top last:border-0 hover:bg-muted/40"
                      onClick={() => setDetail(row)}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-muted-foreground">
                            <PlatformIcon platform={row.platform} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className="truncate">{row.display_name || row.handle}</span>
                              {row.category ? (
                                <span className="hidden text-xs font-normal text-muted-foreground lg:inline">
                                  · {row.category}
                                </span>
                              ) : null}
                            </div>
                            <a
                              href={row.profile_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex items-center gap-1 font-mono text-xs text-primary underline"
                            >
                              @{row.handle}
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.district ?? "Location unknown"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold ${scoreClass(row.lead_score)}`}
                        >
                          {row.lead_score}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p>{formatNumber(row.followers_count)} followers</p>
                        <p className="text-muted-foreground">
                          {formatNumber(row.media_count)} posts
                        </p>
                        {row.engagement_rate !== null ? (
                          <p className="text-muted-foreground">{row.engagement_rate}% eng.</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p>{formatDate(row.last_post_at)}</p>
                        <p
                          className={
                            days !== null && days <= 14
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {days === null ? "Not checked" : days <= 0 ? "Today" : `${days}d ago`}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p>
                          {WEBSITE_STATUS_LABELS[row.website_status as SocialLeadWebsiteStatus]}
                        </p>
                        <p className="text-muted-foreground">
                          {STORE_STATUS_LABELS[row.store_status as SocialLeadStoreStatus]}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={SOCIAL_LEAD_STATUS_VARIANTS[row.status as SocialLeadStatus]}
                        >
                          {SOCIAL_LEAD_STATUS_LABELS[row.status as SocialLeadStatus] ?? row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" variant="ghost">
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {leadsQuery.data?.lastRun ? (
        <p className="text-xs text-muted-foreground">
          Last discovery: {leadsQuery.data.lastRun.query} · {leadsQuery.data.lastRun.status} ·{" "}
          {leadsQuery.data.lastRun.results_count} saved ·{" "}
          {formatDate(leadsQuery.data.lastRun.created_at)}
        </p>
      ) : null}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PlatformIcon platform={detail.platform} />
                  {detail.display_name || detail.handle}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    @{detail.handle}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {detail.category ?? "Uncategorised"} · {detail.district ?? "Location unknown"} ·{" "}
                  {socialLeadPlatformLabel(detail.platform)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-1 text-lg font-semibold ${scoreClass(detail.lead_score)}`}
                      >
                        {detail.lead_score}/100
                      </span>
                      <Badge
                        variant={SOCIAL_LEAD_STATUS_VARIANTS[detail.status as SocialLeadStatus]}
                      >
                        {SOCIAL_LEAD_STATUS_LABELS[detail.status as SocialLeadStatus] ??
                          detail.status}
                      </Badge>
                      <a
                        href={detail.profile_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                      >
                        Open profile <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {detail.biography || "No public biography."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Metric label="Followers" value={formatNumber(detail.followers_count)} />
                    <Metric label="Posts" value={formatNumber(detail.media_count)} />
                    <Metric
                      label="Engagement"
                      value={detail.engagement_rate !== null ? `${detail.engagement_rate}%` : "—"}
                    />
                    <Metric label="Last post" value={formatDate(detail.last_post_at)} />
                    <Metric
                      label="Website"
                      value={
                        WEBSITE_STATUS_LABELS[detail.website_status as SocialLeadWebsiteStatus]
                      }
                    />
                    <Metric
                      label="Store"
                      value={STORE_STATUS_LABELS[detail.store_status as SocialLeadStoreStatus]}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      What this business needs
                    </p>
                    {needsOf(detail).length ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {needsOf(detail).map((need) => (
                          <li key={need} className="flex gap-2">
                            <span className="text-primary">•</span>
                            <span>{need}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        No obvious gap detected. Review the profile before outreach.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Score breakdown
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {scoreFactors(detail).map(([label, value]) => (
                        <div key={label} className="rounded-md border px-2 py-1.5 text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="float-right font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Recent public posts
                    </p>
                    {recentMedia(detail).length ? (
                      <ul className="mt-2 space-y-2">
                        {recentMedia(detail)
                          .slice(0, 6)
                          .map((post, index) => (
                            <li
                              key={`${post.permalink ?? index}`}
                              className="rounded-md border p-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">
                                  {formatDate(post.timestamp ?? null)}
                                </span>
                                <span className="text-muted-foreground">
                                  {post.like_count ?? 0} likes · {post.comments_count ?? 0} comments
                                </span>
                              </div>
                              {post.caption ? (
                                <p className="mt-1 line-clamp-2">{post.caption}</p>
                              ) : null}
                              {post.permalink ? (
                                <a
                                  href={post.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-primary underline"
                                >
                                  View post <ArrowUpRight className="h-3 w-3" />
                                </a>
                              ) : null}
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        No public post data saved. Refresh after connecting Instagram.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">Contact & store</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline">{socialAccountTypeLabel(detail.account_type)}</Badge>
                      {detail.business_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void navigate({
                              to: "/businesses/$id",
                              params: { id: detail.business_id! },
                            })
                          }
                        >
                          Open linked business
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1 text-xs">
                      <p>
                        <span className="text-muted-foreground">Website:</span>{" "}
                        {detail.website ? (
                          <a
                            href={detail.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            {detail.website}
                          </a>
                        ) : (
                          "none found"
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Phone:</span>{" "}
                        {detail.contact_phone ?? "not found"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">WhatsApp:</span>{" "}
                        {detail.contact_whatsapp ?? "not found"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Source:</span>{" "}
                        {detail.source === "instagram_api" ? "Instagram API" : "Manual import"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Checked:</span>{" "}
                        {formatDate(detail.last_checked_at)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {detail.status !== "promoted" ? (
                      <Button
                        onClick={() => promoteMutation.mutate(detail.id)}
                        disabled={promoteMutation.isPending}
                      >
                        {promoteMutation.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Plus />
                        )}
                        Promote to business
                      </Button>
                    ) : detail.business_id ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void navigate({
                            to: "/businesses/$id",
                            params: { id: detail.business_id! },
                          })
                        }
                      >
                        Open in businesses
                      </Button>
                    ) : null}

                    <Button
                      variant="outline"
                      onClick={() => refreshMutation.mutate(detail.id)}
                      disabled={refreshMutation.isPending || detail.platform !== "instagram"}
                    >
                      {refreshMutation.isPending ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                      Refresh public data
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          statusMutation.mutate({ id: detail.id, status: "qualified" })
                        }
                        disabled={statusMutation.isPending}
                      >
                        Qualify
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          statusMutation.mutate({ id: detail.id, status: "reviewing" })
                        }
                        disabled={statusMutation.isPending}
                      >
                        Reviewing
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => statusMutation.mutate({ id: detail.id, status: "dismissed" })}
                      disabled={statusMutation.isPending}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`Delete @${detail.handle}?`)) {
                          removeMutation.mutate(detail.id);
                        }
                      }}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 /> Delete lead
                    </Button>
                  </div>
                </div>
              </div>

              <SocialBusinessMatchPanel socialLeadId={detail.id} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import social profiles</DialogTitle>
            <DialogDescription>
              Paste up to 20 Instagram or Facebook URLs/handles, one per line. If the Instagram API
              is connected, each profile is enriched immediately.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importRaw}
            onChange={(event) => setImportRaw(event.target.value)}
            placeholder={"https://instagram.com/shopname\n@anothershop\nhttps://facebook.com/page"}
            className="min-h-40 font-mono text-xs"
          />
          {!connection?.configured ? (
            <p className="text-xs text-muted-foreground">
              Instagram API is not connected, so imports will be saved without live stats. You can
              refresh them later.
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!importRaw.trim() || importMutation.isPending}
            >
              {importMutation.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Discover Instagram sellers</DialogTitle>
            <DialogDescription>
              Search public Instagram hashtags through Meta&apos;s official API. Coverage is limited
              to what the API exposes; this is not a complete directory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Hashtags</span>
              <Input
                value={hashtags}
                onChange={(event) => setHashtags(event.target.value)}
                placeholder="kigali, rwanda, madeinrwanda"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Up to 5 hashtags. Meta allows a limited number of unique hashtag searches per week.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Max profiles
              </span>
              <select
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
            </label>
            {!connection?.configured ? (
              <p className="text-xs text-muted-foreground">
                Add {connection?.missing.join(" and ")} in Lovable secrets before running discovery.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscoverOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => discoverMutation.mutate()}
              disabled={!connection?.configured || discoverMutation.isPending || !hashtags.trim()}
            >
              {discoverMutation.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Run discovery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5 text-xs">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
