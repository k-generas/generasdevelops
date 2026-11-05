import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Link2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";
import {
  getSocialBusinessMatches,
  reviewSocialBusinessMatch,
  runSocialBusinessMatching,
  type SocialBusinessMatchView,
} from "@/lib/social-business-match.functions";
import {
  matchStatusLabel,
  matchStatusVariant,
  socialAccountTypeLabel,
  type SocialMatchStatus,
} from "@/lib/social-business-match";
import { socialLeadPlatformLabel } from "@/lib/social-leads";

const SIGNAL_LABEL: Record<string, string> = {
  phone: "Phone",
  domain: "Website domain",
  name: "Name",
  location: "Location",
};

function formatDate(value: string | null): string {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

function asMatchStatus(value: string): SocialMatchStatus {
  return value === "high_confidence" ||
    value === "possible" ||
    value === "conflicting" ||
    value === "confirmed" ||
    value === "rejected"
    ? value
    : "possible";
}

function gapStatusLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function MatchCard({
  match,
  onReview,
  busy,
  showBusiness,
}: {
  match: SocialBusinessMatchView;
  onReview: (input: { matchId: string; action: "confirm" | "reject" }) => void;
  busy: boolean;
  showBusiness: boolean;
}) {
  const status = asMatchStatus(match.status);
  const lead = match.social_lead;
  const gaps = Array.isArray(match.opportunity_gaps) ? match.opportunity_gaps : [];
  const solutions = Array.isArray(match.solution_fits) ? match.solution_fits : [];
  const signals = Array.isArray(match.signals) ? match.signals : [];
  const evidence = Array.isArray(match.evidence) ? match.evidence : [];
  const linked = lead.business_id === match.business_id;

  return (
    <article className="rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={matchStatusVariant(status)}>{matchStatusLabel(status)}</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              confidence {Math.round(Number(match.confidence) * 100)}%
            </span>
            {linked ? <Badge variant="outline">Linked in social lead</Badge> : null}
          </div>
          <p className="mt-2 font-medium">
            {socialLeadPlatformLabel(lead.platform)} @{lead.handle}
            {lead.display_name ? ` · ${lead.display_name}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <a
              href={lead.profile_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary underline"
            >
              Open profile <ExternalLink className="h-3 w-3" />
            </a>
            <span>{socialAccountTypeLabel(lead.account_type)}</span>
            <span>{lead.district ?? "Location unknown"}</span>
            <span>Matched {formatDate(match.matched_at)}</span>
          </div>
        </div>
        {showBusiness && match.business ? (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Business candidate</p>
            <Link
              to="/businesses/$id"
              params={{ id: match.business.id }}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline"
            >
              {match.business.name} <Link2 className="h-3 w-3" />
            </Link>
            <p className="text-xs text-muted-foreground">
              {match.business.district ?? "District unknown"}
            </p>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs">{match.reason}</p>

      {signals.length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Matching signals
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {signals.map((raw, index) => {
              const signal = raw as {
                kind?: string;
                business_value?: string | null;
                social_value?: string | null;
                strength?: number;
                note?: string;
              };
              return (
                <li
                  key={`${signal.kind ?? "signal"}-${index}`}
                  className="rounded border px-2 py-1"
                >
                  <span className="font-medium">{SIGNAL_LABEL[signal.kind ?? ""] ?? "Signal"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {Math.round(Number(signal.strength ?? 0) * 100)}% · {signal.note}
                  </span>
                  {signal.business_value || signal.social_value ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {signal.business_value ?? "—"} ↔ {signal.social_value ?? "—"}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {gaps.length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Opportunity gaps
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {gaps.map((raw, index) => {
              const gap = raw as {
                key?: string;
                label?: string;
                evidence?: string;
                verification_status?: string;
                confidence?: number;
              };
              return (
                <li key={gap.key ?? index} className="rounded border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{gap.label ?? gap.key ?? "Gap"}</span>
                    <Badge variant="outline">
                      {gapStatusLabel(gap.verification_status ?? "unknown")}
                    </Badge>
                    <span className="text-muted-foreground">
                      {Math.round(Number(gap.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{gap.evidence}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No opportunity gap is supported by the recorded flags. Do not infer one.
        </p>
      )}

      {solutions.length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Solution fit (hypotheses)
          </p>
          <ul className="mt-1 space-y-1">
            {solutions.map((raw, index) => {
              const fit = raw as {
                solution?: string;
                why?: string;
                confidence?: number;
                hypothesis?: boolean;
              };
              return (
                <li key={fit.solution ?? index} className="rounded border p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fit.solution ?? "Solution"}</span>
                    <Badge variant={fit.hypothesis ? "secondary" : "default"}>
                      {fit.hypothesis ? "hypothesis" : "supported"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {Math.round(Number(fit.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{fit.why}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {evidence.map((raw, index) => {
            const item = raw as {
              label?: string;
              value?: string | null;
              url?: string | null;
              observed_at?: string | null;
            };
            return item.url ? (
              <a
                key={`${item.label ?? "evidence"}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline"
              >
                {item.label ?? "Evidence"} <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span key={`${item.label ?? "evidence"}-${index}`} className="text-muted-foreground">
                {item.label ?? "Evidence"}: {item.value ?? "recorded"}
                {item.observed_at ? ` (${formatDate(item.observed_at)})` : ""}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {!linked ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onReview({ matchId: match.id, action: "confirm" })}
            disabled={busy}
          >
            <Check /> Confirm link
          </Button>
        ) : null}
        {status !== "rejected" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onReview({ matchId: match.id, action: "reject" })}
            disabled={busy}
          >
            <X /> {linked ? "Reject and unlink" : "Reject"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onReview({ matchId: match.id, action: "confirm" })}
            disabled={busy}
          >
            <Check /> Reconsider and link
          </Button>
        )}
      </div>
    </article>
  );
}

export function SocialBusinessMatchPanel({
  businessId,
  socialLeadId,
  className = "",
}: {
  businessId?: string;
  socialLeadId?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getSocialBusinessMatches);
  const run = useServerFn(runSocialBusinessMatching);
  const review = useServerFn(reviewSocialBusinessMatch);
  const queryKey = ["social-business-matches", businessId ?? "all", socialLeadId ?? "all"] as const;

  const matchesQuery = useQuery({
    queryKey,
    queryFn: () =>
      load({
        data: {
          ...(businessId ? { businessId } : {}),
          ...(socialLeadId ? { socialLeadId } : {}),
        },
      }),
  });

  const runMutation = useMutation({
    mutationFn: () =>
      run({
        data: {
          ...(businessId ? { businessId } : {}),
          ...(socialLeadId ? { socialLeadId } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["social-business-matches"] });
      void qc.invalidateQueries({ queryKey: ["social-leads"] });
      void qc.invalidateQueries({ queryKey: ["business"] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (input: { matchId: string; action: "confirm" | "reject" }) =>
      review({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["social-business-matches"] });
      void qc.invalidateQueries({ queryKey: ["social-leads"] });
      void qc.invalidateQueries({ queryKey: ["business"] });
    },
  });

  const matches = matchesQuery.data?.matches ?? [];
  const summary = matchesQuery.data?.summary;
  const busy = runMutation.isPending || reviewMutation.isPending;
  const error = matchesQuery.error ?? runMutation.error ?? reviewMutation.error;

  return (
    <section className={`rounded-lg border bg-card p-5 text-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Social business matches
          </p>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Public social profiles compared with existing Google Places records using phone, website
            domain, name and location. Uncertain matches stay unlinked until you confirm them.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => runMutation.mutate()}
          disabled={busy}
        >
          <RefreshCw className={runMutation.isPending ? "animate-spin" : ""} />
          {runMutation.isPending ? "Matching…" : "Find matches"}
        </Button>
      </div>

      {matchesQuery.data?.tableReady === false ? (
        <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium">Matching database setup required</p>
          <p className="mt-1 text-muted-foreground">
            Apply <code>supabase/migrations/20261105000000_social_business_matches.sql</code>, then
            run the match scan again.
          </p>
          {matchesQuery.data.tableError ? (
            <p className="mt-1 font-mono text-muted-foreground">{matchesQuery.data.tableError}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <ErrorBanner error={error} context="Social business matching" className="mt-3" />
      ) : null}

      {runMutation.isSuccess ? (
        <div className="mt-3 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          Compared {runMutation.data.leadsScanned} social profile(s) with{" "}
          {runMutation.data.businessesCompared} Google business record(s). Saved{" "}
          {runMutation.data.candidatesSaved} candidate(s), auto-linked {runMutation.data.autoLinked}
          . No paid API calls were made.
          {runMutation.data.errors.length > 0
            ? ` ${runMutation.data.errors.length} issue(s): ${runMutation.data.errors[0]}`
            : ""}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {[
            ["High confidence", summary.high_confidence],
            ["Possible", summary.possible],
            ["Conflicting", summary.conflicting],
            ["Confirmed", summary.confirmed],
            ["Rejected", summary.rejected],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border px-2 py-1.5">
              <p className="text-muted-foreground">{label}</p>
              <p className="mt-0.5 font-mono text-base">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {matchesQuery.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading social matches…</p>
      ) : matches.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title={
              businessId
                ? "No social profile candidates for this business"
                : socialLeadId
                  ? "No business candidates for this social profile"
                  : "No social business matches yet"
            }
            why={
              matchesQuery.data?.tableReady === false
                ? "Apply the additive matching migration before running the scan."
                : "Run the match scan to compare recorded public profiles with existing Google business records. No paid API calls are used."
            }
            action={
              <Button type="button" size="sm" onClick={() => runMutation.mutate()} disabled={busy}>
                <RefreshCw /> Find matches
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onReview={(input) => reviewMutation.mutate(input)}
              busy={busy}
              showBusiness={!businessId}
            />
          ))}
        </div>
      )}

      {matchesQuery.data?.lastCheckedAt ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Last match scan {formatDate(matchesQuery.data.lastCheckedAt)}.
        </p>
      ) : null}
    </section>
  );
}
