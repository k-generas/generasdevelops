import { useMemo, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { OutreachMessages } from "@/components/OutreachMessages";
import { useOffers } from "@/lib/offers.hooks";
import { activeOfferNames } from "@/lib/offers";
import { industryLabel } from "@/lib/rwanda";
import { type MatchExplanation } from "@/lib/service-match";
import {
  businessIndustry,
  companySize,
  recommendServices,
  type IntelFindings,
} from "@/lib/business-intel";

type ProviderChoice = "auto" | "openai" | "gemini" | "lovable";

// Loose shapes: the page passes the raw Supabase rows, which may predate the
// Rwanda-intelligence migration (0008), so every enriched field is optional.
export type IntelBusinessRow = {
  id?: string;
  name: string;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  emails?: string[] | null;
  maps_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  score?: number | null;
  business_status?: string | null;
  open_now?: boolean | null;
  opening_hours?: { weekday_descriptions?: string[] | null } | null;
  website_check?: { confidence?: string | null; source?: string | null } | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  industry?: string | null;
  employees_min?: number | null;
  employees_max?: number | null;
  founded_date?: string | null;
  legal_name?: string | null;
  tin?: string | null;
};

export type IntelInvestigationRow = {
  created_at: string;
  findings?: unknown;
  report?: unknown;
};

type Report = {
  overview: string;
  problems: { problem: string; evidence: string; severity: string }[];
  recommended_offer: string;
  offer_reasoning: string;
  confidence: string;
  estimated_deal_value_usd: number | null;
  conversion_probability: string;
  delivery_effort: string;
  next_action: string;
};

type Findings = IntelFindings & {
  socials?: Record<string, string>;
  visibility?: { score: number; breakdown: { label: string; points: number; max: number }[] };
  error?: string;
};

export function BusinessIntelModal({
  open,
  onOpenChange,
  business,
  investigation,
  provider,
  outreachEnabled,
  investigating = false,
  error = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  business: IntelBusinessRow;
  investigation: IntelInvestigationRow | null;
  provider: ProviderChoice;
  outreachEnabled: boolean;
  investigating?: boolean;
  error?: string | null;
}) {
  const offersQ = useOffers();
  const offerNames = useMemo(
    () => activeOfferNames(offersQ.data?.offers ?? []),
    [offersQ.data?.offers],
  );
  const findings = (investigation?.findings ?? {}) as Findings;
  const report = (investigation?.report ?? null) as Report | null;

  const recommendations = useMemo<MatchExplanation[]>(() => {
    if (!investigation) return [];
    const findings = (investigation.findings ?? {}) as Findings;
    return recommendServices(
      {
        business,
        findings,
        websiteCheck: business.website_check,
        observedAt: investigation.created_at,
      },
      offerNames,
    );
  }, [investigation, business, offerNames]);

  const socials = Object.entries(findings.socials ?? {});
  const vis = findings.visibility;
  const hours = business.opening_hours?.weekday_descriptions ?? null;
  const industry = businessIndustry(business);
  const size = companySize(business);
  const status = business.business_status
    ? business.business_status.replace(/_/g, " ").toLowerCase()
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader className="pr-6">
          <DialogTitle>{business.name}</DialogTitle>
          <DialogDescription>
            {[business.category, business.address].filter(Boolean).join(" · ") || "Business report"}
            {business.score != null ? ` · opportunity score ${business.score}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Business profile — everything we hold. */}
        <Section title="Business profile">
          <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <Row k="Legal name" v={business.legal_name} />
            <Row k="TIN" v={business.tin} />
            <Row k="Category" v={business.category} />
            <Row k="Sector" v={business.sector} />
            <Row k="Industry" v={industry ? industryLabel(industry) : business.industry} />
            <Row k="Company size" v={size === "unknown" ? null : size} />
            <Row
              k="Employees"
              v={
                business.employees_min == null && business.employees_max == null
                  ? null
                  : `${business.employees_min ?? "?"}–${business.employees_max ?? "?"}`
              }
            />
            <Row k="Founded" v={business.founded_date} />
            <Row k="Province" v={business.province} />
            <Row k="District" v={business.district} />
            <Row k="Address" v={business.address} />
            <Row k="Google status" v={status} />
            <Row
              k="Open now"
              v={business.open_now == null ? null : business.open_now ? "yes" : "no"}
            />
            <Row
              k="Rating"
              v={
                business.rating != null
                  ? `★ ${business.rating} (${business.review_count ?? 0})`
                  : null
              }
            />
            <Row k="Phone" v={business.phone} />
            <Row k="Public email" v={business.emails?.length ? business.emails.join(", ") : null} />
            <Row k="Website" v={business.website} />
            <Row
              k="Website check"
              v={
                business.website_check?.confidence
                  ? `${business.website_check.confidence}${business.website_check.source ? ` (${business.website_check.source})` : ""}`
                  : null
              }
            />
          </div>
          {business.maps_url && (
            <a
              href={business.maps_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
            >
              Open on Google Maps
            </a>
          )}
          {hours && hours.length > 0 && (
            <div className="pt-1">
              <p className="text-muted-foreground">Hours</p>
              {hours.map((h) => (
                <p key={h} className="text-xs text-muted-foreground">
                  {h}
                </p>
              ))}
            </div>
          )}
          {socials.length > 0 && (
            <div className="pt-1">
              <p className="text-muted-foreground">Social presence</p>
              {socials.map(([k, url]) => (
                <div key={k} className="flex justify-between gap-2 text-xs">
                  <span className="capitalize text-muted-foreground">{k}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-primary underline"
                  >
                    {url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Investigation report. */}
        <Section title="Investigation report">
          {error && (
            <p className="rounded border border-destructive p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {investigating && (
            <p className="text-sm text-muted-foreground">
              Investigating… (≈30s). The report appears here when it finishes.
            </p>
          )}
          {investigation ? (
            <>
              {report ? (
                <div className="space-y-4 text-sm">
                  <p>{report.overview}</p>
                  <div>
                    <h4 className="mb-2 font-semibold">Problems found</h4>
                    {report.problems.length === 0 ? (
                      <p className="text-muted-foreground">None supported by evidence.</p>
                    ) : (
                      <ul className="space-y-2">
                        {report.problems.map((p, i) => (
                          <li key={i} className="rounded border p-3">
                            <div className="flex items-center gap-2">
                              <Badge variant={p.severity === "high" ? "destructive" : "secondary"}>
                                {p.severity}
                              </Badge>
                              <span className="font-medium">{p.problem}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Evidence: {p.evidence}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded border border-primary/50 p-4">
                    <p className="font-mono text-xs uppercase tracking-widest text-primary">
                      Recommended offer (AI)
                    </p>
                    <p className="mt-1 text-lg font-semibold">{report.recommended_offer}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{report.offer_reasoning}</p>
                  </div>
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <Row k="Confidence" v={report.confidence} />
                    <Row
                      k="Deal value"
                      v={
                        report.estimated_deal_value_usd != null
                          ? `~$${report.estimated_deal_value_usd}`
                          : "unknown"
                      }
                    />
                    <Row k="Conversion" v={report.conversion_probability} />
                    <Row k="Delivery effort" v={report.delivery_effort} />
                  </div>
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      Next action
                    </p>
                    <p className="mt-1">{report.next_action}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No report was stored for this run.</p>
              )}

              {(vis || findings.reachable != null) && (
                <div className="grid gap-4 pt-2 sm:grid-cols-2">
                  {vis && (
                    <div className="space-y-1.5 rounded border p-3 text-sm">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-xs uppercase tracking-widest text-primary">
                          Visibility
                        </span>
                        <span className="font-mono text-xl font-semibold text-accent">
                          {vis.score}
                          <span className="text-xs text-muted-foreground">/100</span>
                        </span>
                      </div>
                      {vis.breakdown.map((x) => (
                        <div key={x.label} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{x.label}</span>
                          <span className="font-mono">
                            {x.points}/{x.max}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5 rounded border p-3 text-sm">
                    <p className="font-mono text-xs uppercase tracking-widest text-primary">
                      Website evidence
                    </p>
                    <Row k="Reachable" v={fmt(findings.reachable)} />
                    <Row k="HTTP status" v={fmt(findings.status)} />
                    <Row
                      k="Load time"
                      v={findings.load_ms != null ? `${findings.load_ms} ms` : null}
                    />
                    <Row k="Mobile viewport" v={fmt(findings.has_viewport_meta)} />
                    <Row k="Contact form" v={fmt(findings.has_contact_form)} />
                    <Row k="Booking / shop" v={fmt(findings.has_online_booking_or_shop)} />
                    <Row k="Latest © year" v={fmt(findings.copyright_year)} />
                    {typeof findings.error === "string" && (
                      <p className="text-xs text-destructive">{findings.error}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            !investigating &&
            !error && (
              <p className="text-sm text-muted-foreground">
                Not investigated yet. Run the investigation to fill this in.
              </p>
            )
          )}
        </Section>

        {/* Recommendations from the owner's own offers. */}
        <Section title="Recommended services (from your offers)">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {investigation
                ? "No observed problem maps to one of your active offers."
                : "Available once the business has been investigated."}
            </p>
          ) : (
            <ul className="space-y-3">
              {recommendations.map((m) => (
                <li key={m.offer} className="rounded border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.offer}</span>
                    <Badge variant={m.hypothesis ? "secondary" : "default"}>
                      {m.hypothesis ? "hypothesis" : "supported"}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      confidence {Math.round(m.confidence * 100)}%
                    </span>
                    {m.recurring && <Badge variant="outline">recurring</Badge>}
                    <Badge variant="outline">{m.effort} effort</Badge>
                  </div>
                  <p className="mt-2">{m.whyRelevant}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Observed: {m.observedProblem}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Likely buyer: {m.likelyBuyerRole}
                  </p>
                  <p className="mt-1 text-xs text-primary">{m.nextAction}</p>
                  {m.uncertainties.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-amber-400">
                      {m.uncertainties.map((u) => (
                        <li key={u}>{u}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Outreach messages (renders its own titled section). */}
        <OutreachMessages
          businessId={business.id ?? ""}
          provider={provider}
          enabled={outreachEnabled}
          generateToken={0}
          auto={false}
        />
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">{title}</p>
      {children}
    </section>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function Row({ k, v }: { k: string; v?: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-mono">{v ?? "—"}</span>
    </div>
  );
}
