import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { investigateBusiness } from "@/lib/discovery.functions";
import { BusinessWorkspace } from "@/components/BusinessWorkspace";
import { ValidationPlanner } from "@/components/ValidationPlanner";
import { OutreachMessages } from "@/components/OutreachMessages";
import { BusinessIntelModal } from "@/components/BusinessIntelModal";
import type { IntelBusinessRow, IntelInvestigationRow } from "@/components/BusinessIntelModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { freshnessDays } from "@/lib/evidence";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/businesses/$id")({
  head: () => ({
    meta: [
      { title: "Business investigation — GARE" },
      {
        name: "description",
        content: "Evidence-based investigation report for a discovered business.",
      },
      { property: "og:title", content: "Business investigation — GARE" },
      {
        property: "og:description",
        content: "Evidence-based investigation report for a discovered business.",
      },
    ],
  }),
  component: BusinessPage,
});

type Report = {
  overview: string;
  problems: { problem: string; evidence: string; severity: string }[];
  recommended_offer: string;
  offer_reasoning: string;
  score: number;
  confidence: string;
  estimated_deal_value_usd: number | null;
  conversion_probability: string;
  delivery_effort: string;
  next_action: string;
};

function BusinessPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const investigate = useServerFn(investigateBusiness);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [provider, setProvider] = useState<"auto" | "openai" | "gemini" | "lovable">("auto");
  // Bumped after a successful investigation to trigger outreach drafting.
  const [packToken, setPackToken] = useState(0);
  // Full-report modal, opened right after a run and re-openable any time.
  const [modalOpen, setModalOpen] = useState(false);

  const biz = useQuery({
    queryKey: ["business", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  // Remember where the owner was, so the dashboard can offer "continue".
  useEffect(() => {
    void supabase
      .from("businesses")
      .update({ last_opened_at: new Date().toISOString() })
      .eq("id", id);
  }, [id]);
  const inv = useQuery({
    queryKey: ["investigation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investigations")
        .select("*")
        .eq("business_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function run() {
    // Open the report modal immediately so the business is visible even if the
    // run later fails (e.g. missing AI/Maps keys). It fills in as data arrives.
    setModalOpen(true);
    setBusy(true);
    setErr(null);
    try {
      const r = await investigate({ data: { businessId: id, provider } });
      // Draft the multi-channel outreach pack when the business fits an offer.
      if (!r.permanentlyClosed && !String(r.recommendedOffer ?? "").startsWith("No offer")) {
        setPackToken((t) => t + 1);
      }
      qc.invalidateQueries({ queryKey: ["biz-proposals", id] });
      qc.invalidateQueries({ queryKey: ["biz-events", id] });
      qc.invalidateQueries({ queryKey: ["investigation", id] });
      qc.invalidateQueries({ queryKey: ["business", id] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Investigation failed");
    }
    setBusy(false);
  }

  if (biz.isLoading) return <p className="text-sm text-muted-foreground">Loading business…</p>;
  if (biz.isError)
    return (
      <div className="space-y-3">
        <ErrorBanner error={biz.error} context="Business" onRetry={() => void biz.refetch()} />
        <Button asChild variant="outline" size="sm">
          <Link to="/businesses">Back to leads</Link>
        </Button>
      </div>
    );
  if (!biz.data)
    return (
      <div className="space-y-3">
        <EmptyState
          title="Business not found"
          why="This business record does not exist — it may have been deleted, or the link is wrong."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/businesses">Back to leads</Link>
            </Button>
          }
        />
      </div>
    );
  const b = biz.data;
  const closedPermanent = b.business_status === "CLOSED_PERMANENTLY";
  const closedTemporary = b.business_status === "CLOSED_TEMPORARILY";
  const recent = (Array.isArray(b.recent_reviews) ? b.recent_reviews : []) as {
    rating: number | null;
    text: string | null;
    author: string | null;
    publish_time: string | null;
  }[];
  const hours = (b.opening_hours ?? {}) as { weekday_descriptions?: string[] | null };
  const report = inv.data?.report as Report | null | undefined;
  const raw = (inv.data?.findings ?? {}) as {
    socials?: Record<string, string>;
    visibility?: { score: number; breakdown: { label: string; points: number; max: number }[] };
  };
  const socials = Object.entries(raw.socials ?? {});
  const vis = raw.visibility;
  const f = (inv.data?.findings ?? {}) as { [k: string]: unknown } & Partial<
    Record<
      | "reachable"
      | "status"
      | "https"
      | "load_ms"
      | "has_viewport_meta"
      | "has_contact_form"
      | "has_whatsapp_link"
      | "has_online_booking_or_shop"
      | "copyright_year"
      | "error",
      unknown
    >
  >;

  return (
    <div className="space-y-6">
      <Link to="/discover" className="text-xs text-muted-foreground hover:text-foreground">
        ← Pipeline
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{b.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[b.category, b.address].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {closedPermanent ? (
              <Badge variant="destructive">Permanently closed on Google</Badge>
            ) : closedTemporary ? (
              <Badge variant="destructive">Temporarily closed</Badge>
            ) : b.open_now === true ? (
              <Badge variant="secondary">Open now</Badge>
            ) : b.open_now === false ? (
              <Badge variant="outline">Closed now</Badge>
            ) : b.business_status ? (
              <Badge variant="outline">{b.business_status.replace(/_/g, " ").toLowerCase()}</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                activity not checked
              </Badge>
            )}
            {b.last_activity_at ? (
              <Badge variant="outline">
                last activity {relativeTime(b.last_activity_at)}
                {b.reviews_last_90d != null
                  ? ` · ${b.reviews_last_90d} review${b.reviews_last_90d === 1 ? "" : "s"} in 90 days`
                  : ""}
              </Badge>
            ) : b.activity_checked_at ? (
              <Badge variant="outline" className="text-muted-foreground">
                no reviews yet · may be new or inactive
              </Badge>
            ) : null}
            {(() => {
              const stamps = [b.website_checked_at, b.activity_checked_at].filter(
                (s): s is string => !!s,
              );
              if (!stamps.length) return null;
              const newest = stamps.slice().sort().at(-1)!;
              const days = freshnessDays(newest);
              const stale = days > 30;
              return (
                <Badge
                  variant="outline"
                  className={
                    stale
                      ? "border-amber-500/50 text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground"
                  }
                >
                  evidence {days === 0 ? "checked today" : `${days}d old`}
                  {stale ? " · refresh recommended" : ""}
                </Badge>
              );
            })()}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {b.phone && (
              <a
                href={`tel:${b.phone.replace(/\s+/g, "")}`}
                className="font-mono text-primary underline"
              >
                {b.phone}
              </a>
            )}
            {b.website ? (
              <span className="flex items-center gap-2">
                <a
                  href={b.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  {b.website}
                </a>
                {b.website_source === "domain_match" && (
                  <Badge variant="outline">found by double-check · please confirm</Badge>
                )}
                {b.website_source === "place_details" && (
                  <Badge variant="outline">found by double-check</Badge>
                )}
              </span>
            ) : b.website_checked_at ? (
              <Badge variant="outline" className="border-primary text-primary">
                no website found (double-checked{" "}
                {new Date(b.website_checked_at).toLocaleDateString()})
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                not listed on Google · run investigation to double-check
              </Badge>
            )}
            {(b.emails ?? []).map((e) => (
              <a key={e} href={`mailto:${e}`} className="font-mono text-primary underline">
                {e}
              </a>
            ))}
            {b.maps_url && (
              <a
                href={b.maps_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground underline"
              >
                Google Maps
              </a>
            )}
            {b.rating != null && (
              <span className="font-mono text-muted-foreground">
                ★ {b.rating} · {b.review_count} reviews
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Opportunity score
          </p>
          <p className="font-mono text-5xl font-semibold text-accent">{b.score ?? "—"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy}>
          {busy ? "Investigating… (≈30s)" : inv.data ? "Re-investigate" : "Run investigation"}
        </Button>
        <select
          className="rounded border bg-background px-2 py-1.5 text-sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value as "auto" | "openai" | "gemini" | "lovable")}
          title="Which AI provider analyses the evidence"
        >
          <option value="auto">AI: Auto (fallback)</option>
          <option value="openai">AI: OpenAI</option>
          <option value="gemini">AI: Gemini</option>
          <option value="lovable">AI: Lovable</option>
        </select>
        <Button variant="outline" onClick={() => setModalOpen(true)}>
          View full report
        </Button>
        {inv.data && (
          <span className="text-xs text-muted-foreground">
            Last run {new Date(inv.data.created_at).toLocaleString()}
          </span>
        )}
      </div>
      {inv.isError && (
        <ErrorBanner
          error={inv.error}
          context="Investigation report"
          onRetry={() => void inv.refetch()}
        />
      )}
      {err && (
        <p className="rounded border border-destructive bg-card p-3 text-sm text-destructive">
          {describeError(err, "Investigation").title}: {err} —{" "}
          {describeError(err, "Investigation").fix}
        </p>
      )}

      {(b.activity_checked_at || recent.length > 0 || hours.weekday_descriptions) && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-card p-5 text-sm">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
              Activity & hours
            </p>
            <Row
              k="Google status"
              v={b.business_status ? b.business_status.replace(/_/g, " ").toLowerCase() : null}
            />
            <Row k="Open now" v={b.open_now == null ? null : b.open_now ? "yes" : "no"} />
            <Row
              k="Last activity (review)"
              v={
                b.last_activity_at
                  ? `${relativeTime(b.last_activity_at)} · ${new Date(b.last_activity_at).toLocaleDateString()}`
                  : null
              }
            />
            <Row
              k="Reviews in last 90 days"
              v={b.reviews_last_90d == null ? null : String(b.reviews_last_90d)}
            />
            <Row
              k="Activity checked"
              v={b.activity_checked_at ? new Date(b.activity_checked_at).toLocaleString() : null}
            />
            <Row k="Phone" v={b.phone} />
            <Row k="Public email" v={b.emails && b.emails.length ? b.emails.join(", ") : null} />
            {hours.weekday_descriptions && hours.weekday_descriptions.length > 0 && (
              <div className="pt-2">
                <p className="text-muted-foreground">Hours</p>
                {hours.weekday_descriptions.map((h) => (
                  <p key={h} className="text-xs text-muted-foreground">
                    {h}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2 rounded-lg border bg-card p-5 text-sm">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
              Recent Google reviews
            </p>
            {recent.length === 0 ? (
              <p className="text-muted-foreground">No reviews returned by Google.</p>
            ) : (
              recent.map((r, i) => (
                <div key={i} className="border-b pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.author ?? "Anonymous"}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.rating != null ? `★ ${r.rating}` : ""}
                      {r.publish_time ? ` · ${relativeTime(r.publish_time)}` : ""}
                    </span>
                  </div>
                  {r.text && <p className="mt-1 text-xs text-muted-foreground">{r.text}</p>}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {inv.data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-lg border bg-card p-5 lg:col-span-2 space-y-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Report</p>
            {report && (
              <>
                <p>{report.overview}</p>
                <div>
                  <h3 className="mb-2 font-semibold">Problems found</h3>
                  {report.problems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None supported by evidence.</p>
                  ) : (
                    <ul className="space-y-3">
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
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    Recommended offer
                  </p>
                  <p className="mt-1 text-lg font-semibold">{report.recommended_offer}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{report.offer_reasoning}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Next action
                  </p>
                  <p className="mt-1">{report.next_action}</p>
                </div>
              </>
            )}
          </section>
          <aside className="space-y-4">
            {vis && (
              <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
                    Visibility
                  </p>
                  <span className="font-mono text-2xl font-semibold text-accent">
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
                <p className="pt-2 text-[11px] text-muted-foreground">
                  Low visibility + good reviews = strongest opportunity.
                </p>
              </div>
            )}
            <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
                Social presence
              </p>
              {socials.length === 0 ? (
                <p className="text-muted-foreground">
                  {b.website
                    ? "No social profiles linked on their website."
                    : "No website to check for social links."}
                </p>
              ) : (
                socials.map(([k, url]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-primary underline"
                    >
                      {url.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Estimates</p>
              <Row k="Confidence" v={report?.confidence} />
              <Row
                k="Deal value"
                v={
                  report?.estimated_deal_value_usd != null
                    ? `~$${report.estimated_deal_value_usd}`
                    : "unknown"
                }
              />
              <Row k="Conversion" v={report?.conversion_probability} />
              <Row k="Delivery effort" v={report?.delivery_effort} />
              <p className="pt-2 text-[11px] text-muted-foreground">
                Estimates are AI judgement, not revenue.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
                Website evidence
              </p>
              <Row k="Reachable" v={fmt(f.reachable)} />
              <Row k="HTTP status" v={fmt(f.status)} />
              <Row k="HTTPS" v={fmt(f.https)} />
              <Row k="Load time" v={f.load_ms != null ? `${f.load_ms} ms` : "—"} />
              <Row k="Mobile viewport" v={fmt(f.has_viewport_meta)} />
              <Row k="Contact form" v={fmt(f.has_contact_form)} />
              <Row k="WhatsApp link" v={fmt(f.has_whatsapp_link)} />
              <Row k="Booking / shop" v={fmt(f.has_online_booking_or_shop)} />
              <Row k="Latest © year" v={fmt(f.copyright_year)} />
              {typeof f.error === "string" && <p className="text-xs text-destructive">{f.error}</p>}
            </div>
          </aside>
        </div>
      )}
      <OutreachMessages
        businessId={id}
        provider={provider}
        enabled={
          !!report && !closedPermanent && !(report.recommended_offer ?? "").startsWith("No offer")
        }
        generateToken={packToken}
      />
      <ValidationPlanner
        businessId={id}
        businessName={b.name}
        storedPlan={b.validation_plan}
        onSaved={() => qc.invalidateQueries({ queryKey: ["business", id] })}
      />
      <BusinessWorkspace businessId={id} />
      <BusinessIntelModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        business={b as unknown as IntelBusinessRow}
        investigation={(inv.data ?? null) as unknown as IntelInvestigationRow | null}
        provider={provider}
        investigating={busy}
        error={err}
        outreachEnabled={
          !!report && !closedPermanent && !(report.recommended_offer ?? "").startsWith("No offer")
        }
      />
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "unknown";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
function Row({ k, v }: { k: string; v?: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v ?? "—"}</span>
    </div>
  );
}
