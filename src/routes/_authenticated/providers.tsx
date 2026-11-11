import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ExternalLink, PlugZap, ShieldAlert } from "lucide-react";
import { getSystemStatus } from "@/lib/system.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  providerCategoryLabel,
  providerStatuses,
  providerSummary,
  type ProviderCategory,
  type ProviderRuntimeStatus,
  type ProviderStatus,
} from "@/lib/provider-registry";

export const Route = createFileRoute("/_authenticated/providers")({
  head: () => ({
    meta: [
      { title: "Providers - GARE" },
      {
        name: "description",
        content:
          "Truthful runtime status and compliance notes for every discovery, AI and verification provider.",
      },
    ],
  }),
  component: ProvidersPage,
});

const CATEGORY_ORDER: ProviderCategory[] = [
  "places",
  "website",
  "ai",
  "professional",
  "registry",
  "social",
  "verification",
  "news",
];

const STATUS_LABEL: Record<ProviderRuntimeStatus, string> = {
  available: "available",
  configured_unverified: "configured, unverified",
  unavailable: "unavailable",
  blocked: "blocked",
  review_required: "review required",
};

function statusVariant(
  status: ProviderRuntimeStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "available") return "default";
  if (status === "blocked") return "destructive";
  if (status === "review_required") return "outline";
  return "secondary";
}

function ProvidersPage() {
  const statusFn = useServerFn(getSystemStatus);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCategory | "">("");
  const [status, setStatus] = useState<ProviderRuntimeStatus | "">("");

  const system = useQuery({
    queryKey: ["system-status"],
    queryFn: () => statusFn(),
  });

  const statuses = useMemo(() => {
    if (!system.data) return [];
    return providerStatuses(system.data);
  }, [system.data]);

  const summary = useMemo(() => providerSummary(statuses), [statuses]);

  const filtered = statuses.filter((s) => {
    if (category && s.provider.category !== category) return false;
    if (status && s.status !== status) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.provider.name.toLowerCase().includes(q) ||
      s.provider.capabilities.join(" ").toLowerCase().includes(q) ||
      s.provider.coverage.toLowerCase().includes(q)
    );
  });

  const grouped = CATEGORY_ORDER.map((c) => ({
    category: c,
    rows: filtered.filter((s) => s.provider.category === c),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <PlugZap className="h-5 w-5" /> Provider status
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          This page reports what the current server environment can actually use. Configured does
          not always mean verified: AI keys can exist while billing or quota is exhausted, and no
          provider is contacted from this page.
        </p>
      </header>

      {system.isError && (
        <ErrorBanner
          error={system.error as Error}
          context="Provider status"
          onRetry={() => void system.refetch()}
        />
      )}

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Providers" value={summary.total} />
        <Stat label="Available" value={summary.available} tone="ok" />
        <Stat label="Configured" value={summary.configuredUnverified} />
        <Stat label="Unavailable" value={summary.unavailable} />
        <Stat label="Review" value={summary.reviewRequired} tone="warn" />
        <Stat label="Blocked" value={summary.blocked} tone="danger" />
      </section>

      <section className="flex flex-wrap gap-2 rounded-lg border bg-card p-3">
        <Input
          className="w-full sm:w-64"
          placeholder="Search provider or capability..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="rounded border bg-background px-2 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProviderCategory | "")}
        >
          <option value="">All categories</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {providerCategoryLabel(c)}
            </option>
          ))}
        </select>
        <select
          className="rounded border bg-background px-2 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProviderRuntimeStatus | "")}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {filtered.length} shown
        </span>
      </section>

      {system.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading runtime status...</p>
      ) : grouped.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No providers match these filters.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {providerCategoryLabel(group.category)}
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.rows.map((s) => (
                <ProviderCard key={s.provider.id} status={s} />
              ))}
            </div>
          </section>
        ))
      )}

      <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" /> Safety rules
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>LinkedIn automation is blocked. Use the platform manually.</li>
          <li>No scraping behind logins, CAPTCHAs or paywalls.</li>
          <li>Paid providers stay off until the owner activates billing and limits.</li>
          <li>Practising outreach requires a lawful basis, channel terms and suppression check.</li>
        </ul>
      </section>
    </div>
  );
}

function ProviderCard({ status: s }: { status: ProviderStatus }) {
  return (
    <article className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{s.provider.name}</h3>
        <Badge variant={statusVariant(s.status)}>{STATUS_LABEL[s.status]}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{s.provider.costModel}</span>
      </div>
      <p className="text-sm text-muted-foreground">{s.reason}</p>
      <div className="flex flex-wrap gap-1">
        {s.provider.capabilities.map((c) => (
          <Badge key={c} variant="secondary" className="font-normal">
            {c}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{s.provider.coverage}</p>
      <p className="text-xs">
        {s.provider.automatedCollection ? "Automated collection" : "Manual / interpretation only"}
        {s.provider.requiresCredentials &&
          s.provider.credentialKeys.length > 0 &&
          ` - keys: ${s.provider.credentialKeys.join(", ")}`}
      </p>
      <p className="text-xs text-muted-foreground">{s.provider.complianceNotes}</p>
      {s.provider.documentation && (
        <Button asChild variant="outline" size="sm">
          <a href={s.provider.documentation} target="_blank" rel="noreferrer">
            Documentation <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "danger" && value > 0
          ? "text-destructive"
          : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
