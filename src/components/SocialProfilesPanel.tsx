import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  removeSocialProfile,
  saveManualSocialProfile,
  scanBusinessSocialProfiles,
  type SocialScanSummary,
} from "@/lib/social-scan.functions";
import type { SocialProfile, SocialProfileStatus } from "@/lib/social-profiles";
import { socialProfilesQueryKey, useSocialProfiles } from "@/lib/use-social-profiles";

const STATUS_LABEL: Record<SocialProfileStatus, string> = {
  confirmed: "Public page confirmed",
  unverified: "Not checked yet",
  blocked: "Access blocked",
  inaccessible: "Unavailable",
};

const STATUS_VARIANT: Record<
  SocialProfileStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  confirmed: "default",
  unverified: "secondary",
  blocked: "destructive",
  inaccessible: "outline",
};

function displayHandle(profile: SocialProfile): string {
  if (!profile.handle) return profile.url.replace(/^https?:\/\/(www\.)?/, "");
  if (["instagram", "tiktok", "x"].includes(profile.platform)) {
    return `@${profile.handle.replace(/^@/, "")}`;
  }
  return profile.handle;
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString();
}

function summaryText(result: SocialScanSummary): string {
  const parts = [
    `${result.scanned} checked`,
    `${result.confirmed} confirmed`,
    `${result.blocked} blocked`,
    `${result.inaccessible} unavailable`,
  ];
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.errors.length > 0) parts.push(`${result.errors.length} URL error(s)`);
  return parts.join(" · ");
}

export function SocialProfilesPanel({
  businessId,
  className = "",
}: {
  businessId: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const profilesQuery = useSocialProfiles(businessId);
  const saveProfile = useServerFn(saveManualSocialProfile);
  const scanProfiles = useServerFn(scanBusinessSocialProfiles);
  const removeProfile = useServerFn(removeSocialProfile);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: socialProfilesQueryKey(businessId) });
    qc.invalidateQueries({ queryKey: ["business", businessId] });
  };

  const scanMutation = useMutation({
    mutationFn: () => scanProfiles({ data: { businessId } }),
    onSuccess: (result) => {
      setError(null);
      setLastSummary(summaryText(result));
      refresh();
    },
    onError: setError,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmed = url.trim();
      await saveProfile({ data: { businessId, url: trimmed } });
      return scanProfiles({ data: { businessId, urls: [trimmed] } });
    },
    onSuccess: (result) => {
      setUrl("");
      setError(null);
      setLastSummary(summaryText(result));
      refresh();
    },
    onError: setError,
  });

  const removeMutation = useMutation({
    mutationFn: (sourceId: string) => removeProfile({ data: { businessId, sourceId } }),
    onSuccess: () => {
      setError(null);
      setLastSummary(null);
      refresh();
    },
    onError: setError,
  });

  const profiles = profilesQuery.data ?? [];
  const busy = scanMutation.isPending || addMutation.isPending || removeMutation.isPending;

  return (
    <section className={`rounded-lg border bg-card p-5 text-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Social presence
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Public profile checks only. Login, consent and security walls are recorded as blocked,
            never as “not found”.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => scanMutation.mutate()}
          disabled={busy}
        >
          <RefreshCw className={scanMutation.isPending ? "animate-spin" : ""} />
          {scanMutation.isPending ? "Checking…" : "Scan profiles"}
        </Button>
      </div>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) addMutation.mutate();
        }}
      >
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://instagram.com/your-business"
          aria-label="Public social profile URL"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={!url.trim() || busy}>
          <Plus />
          {addMutation.isPending ? "Adding…" : "Add & check"}
        </Button>
      </form>

      {lastSummary && <p className="mt-2 text-xs text-muted-foreground">{lastSummary}</p>}
      {error ? <ErrorBanner error={error} context="Social profile check" className="mt-3" /> : null}
      {profilesQuery.isError ? (
        <ErrorBanner
          error={profilesQuery.error}
          context="Social profiles"
          onRetry={() => void profilesQuery.refetch()}
          className="mt-3"
        />
      ) : null}

      {profilesQuery.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading social profiles…</p>
      ) : profiles.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No social profiles recorded. Add a public profile URL, or run the website investigation
          first so links can be detected.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {profiles.map((profile) => (
            <li key={profile.sourceId} className="rounded border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{profile.platformLabel}</span>
                    <Badge variant={STATUS_VARIANT[profile.status]}>
                      {STATUS_LABEL[profile.status]}
                    </Badge>
                    {!profile.persisted && <Badge variant="outline">Not saved</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {profile.url ? (
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-primary underline"
                      >
                        {displayHandle(profile)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">No valid URL stored</span>
                    )}
                    <span className="text-muted-foreground">
                      {profile.method === "manual" ? "Added manually" : "Found on website"}
                    </span>
                    <span className="text-muted-foreground">
                      Checked {formatDate(profile.lastCheckedAt)}
                    </span>
                  </div>
                  {profile.excerpt && (
                    <p className="mt-1 text-xs text-muted-foreground">{profile.excerpt}</p>
                  )}
                </div>
                {profile.persisted && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Remove ${profile.platformLabel} profile`}
                    title={`Remove ${profile.platformLabel} profile`}
                    disabled={busy}
                    onClick={() => removeMutation.mutate(profile.sourceId)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
