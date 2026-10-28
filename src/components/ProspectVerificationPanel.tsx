import { Badge } from "@/components/ui/badge";
import {
  buildProspectVerification,
  type CommercialPriority,
  type ProspectVerification,
  type VerificationBusiness,
  type VerificationFindings,
} from "@/lib/prospect-verification";
import { industryLabel } from "@/lib/rwanda";

const PRIORITY_CLASS: Record<CommercialPriority, string> = {
  A: "border-emerald-600 bg-emerald-600 text-white",
  B: "border-amber-500 bg-amber-500 text-black",
  C: "border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  MANUAL_REVIEW: "border-rose-600 bg-rose-600 text-white",
};

const PRIORITY_LABEL: Record<CommercialPriority, string> = {
  A: "A - strong fit, verify before outreach",
  B: "B - worth a closer look",
  C: "C - low priority",
  MANUAL_REVIEW: "Manual review required",
};

function words(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function Coverage({ report }: { report: ProspectVerification["website_coverage"] }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground">Website search coverage</span>
        <span className="font-mono text-xs">
          {report.score_0_100}/100 ({report.level})
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted">
        <div
          className="h-full rounded bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, report.score_0_100))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{report.note}</p>
    </div>
  );
}

export function ProspectVerificationPanel({
  business,
  findings,
  observedAt,
  className = "",
}: {
  business: VerificationBusiness;
  findings?: VerificationFindings | null;
  observedAt?: string | null;
  className?: string;
}) {
  const v = buildProspectVerification({
    business,
    findings: findings ?? null,
    observedAt: observedAt ?? null,
  });
  const industry = v.manufacturing_evidence.industry;

  return (
    <section className={`rounded-lg border bg-card p-5 text-sm ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Prospect verification
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Separate evidence status for website, presence, location, operating activity and search
            coverage. A digital gap is not proof of willingness to pay.
          </p>
        </div>
        <Badge className={PRIORITY_CLASS[v.commercial_priority]}>
          {PRIORITY_LABEL[v.commercial_priority]}
        </Badge>
      </div>

      <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row k="Website" v={words(v.website_status)} />
        <Row k="Online presence" v={words(v.online_presence_status)} />
        <Row k="Operating" v={words(v.operating_status)} />
        <Row k="Rwanda location" v={words(v.rwanda_location)} />
        <Row
          k="Manufacturing"
          v={
            industry
              ? `${words(v.manufacturing_evidence.status)} (${industryLabel(industry)})`
              : v.manufacturing_evidence.status
          }
        />
        <Row k="Identity confidence" v={`${v.identity_confidence_0_100}/100`} />
        <Row k="Commercial score" v={`${v.commercial_score_0_100}/100`} />
        <Row
          k="Last observed activity"
          v={
            v.last_observed_activity_at
              ? new Date(v.last_observed_activity_at).toLocaleDateString()
              : null
          }
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Coverage report={v.website_coverage} />
        <Coverage report={v.presence_coverage} />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Why this priority
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {v.priority_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Evidence
          </p>
          <p className="mt-1 text-xs">
            {v.website_status_reason} {v.online_presence_reason}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{v.operating_evidence}</p>
          <p className="mt-1 text-xs text-muted-foreground">{v.manufacturing_evidence.basis}</p>
        </div>

        {v.digital_gap.length > 0 && (
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Measured digital gaps
            </p>
            <ul className="mt-1 space-y-1">
              {v.digital_gap.map((g) => (
                <li key={g.key} className="rounded border p-2 text-xs">
                  <span className="font-medium">{g.label}</span>{" "}
                  <Badge variant={g.severity === "high" ? "destructive" : "secondary"}>
                    {g.severity}
                  </Badge>
                  <p className="mt-1 text-muted-foreground">{g.evidence}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {v.service_opportunity && (
          <div className="rounded border border-primary/50 p-3">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              Service opportunity
            </p>
            <p className="mt-1 font-medium">{v.service_opportunity.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{v.service_opportunity.basis}</p>
            <p className="mt-1 text-xs text-muted-foreground">{v.service_opportunity.limitation}</p>
          </div>
        )}

        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Next verification step
          </p>
          <p className="mt-1 text-xs">{v.next_verification_step}</p>
        </div>

        {v.contradictions.length > 0 && (
          <div className="rounded border border-rose-500/50 p-3">
            <p className="font-mono text-xs uppercase tracking-widest text-rose-600">
              Contradictions
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {v.contradictions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {v.uncertainties.length > 0 && (
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Uncertainties
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {v.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        <details className="rounded border p-3">
          <summary className="cursor-pointer text-xs font-medium">
            Evidence log ({v.evidence_log.length} recorded checks)
          </summary>
          <div className="mt-2 space-y-2">
            {v.evidence_log.map((e) => (
              <div key={`${e.check_id}-${e.checked_at}`} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{words(e.result)}</Badge>
                  <span className="font-medium">{e.query_or_check}</span>
                  <span className="text-muted-foreground">
                    {new Date(e.checked_at).toLocaleDateString()} | {e.source}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">{e.observation}</p>
              </div>
            ))}
          </div>
          {v.checks_failed.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-medium">Failed or partial checks</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {v.checks_failed.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {v.checks_not_performed.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="font-medium">Not performed (not treated as failures)</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {v.checks_not_performed.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v?: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs">{v ?? "unknown"}</span>
    </div>
  );
}
