import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { investigateBusiness } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/businesses/$id")({
  head: () => ({
    meta: [
      { title: "Business investigation — GARE" },
      { name: "description", content: "Evidence-based investigation report for a discovered business." },
      { property: "og:title", content: "Business investigation — GARE" },
      { property: "og:description", content: "Evidence-based investigation report for a discovered business." },
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

  const biz = useQuery({
    queryKey: ["business", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const inv = useQuery({
    queryKey: ["investigation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("investigations").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      await investigate({ data: { businessId: id } });
      qc.invalidateQueries({ queryKey: ["investigation", id] });
      qc.invalidateQueries({ queryKey: ["business", id] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Investigation failed");
    }
    setBusy(false);
  }

  if (biz.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!biz.data) return <p>Not found.</p>;
  const b = biz.data;
  const report = inv.data?.report as Report | null | undefined;
  const raw = (inv.data?.findings ?? {}) as { socials?: Record<string, string>; visibility?: { score: number; breakdown: { label: string; points: number; max: number }[] } };
  const socials = Object.entries(raw.socials ?? {});
  const vis = raw.visibility;
  const f = (inv.data?.findings ?? {}) as { [k: string]: unknown } & Partial<Record<"reachable"|"status"|"https"|"load_ms"|"has_viewport_meta"|"has_contact_form"|"has_whatsapp_link"|"has_online_booking_or_shop"|"copyright_year"|"error", unknown>>;

  return (
    <div className="space-y-6">
      <Link to="/discover" className="text-xs text-muted-foreground hover:text-foreground">← Pipeline</Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{b.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{[b.category, b.address].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {b.phone && <span className="font-mono">{b.phone}</span>}
            {b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="text-primary underline">{b.website}</a> : <Badge variant="outline" className="border-primary text-primary">no website listed</Badge>}
            {b.maps_url && <a href={b.maps_url} target="_blank" rel="noreferrer" className="text-muted-foreground underline">Google Maps</a>}
            {b.rating != null && <span className="font-mono text-muted-foreground">★ {b.rating} · {b.review_count} reviews</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Opportunity score</p>
          <p className="font-mono text-5xl font-semibold text-accent">{b.score ?? "—"}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={busy}>{busy ? "Investigating… (≈30s)" : inv.data ? "Re-investigate" : "Run investigation"}</Button>
        {inv.data && <span className="text-xs text-muted-foreground">Last run {new Date(inv.data.created_at).toLocaleString()}</span>}
      </div>
      {err && <p className="rounded border border-destructive p-3 text-sm text-destructive">{err}</p>}

      {inv.data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-lg border bg-card p-5 lg:col-span-2 space-y-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Report</p>
            {report && (
              <>
                <p>{report.overview}</p>
                <div>
                  <h3 className="mb-2 font-semibold">Problems found</h3>
                  {report.problems.length === 0 ? <p className="text-sm text-muted-foreground">None supported by evidence.</p> : (
                    <ul className="space-y-3">
                      {report.problems.map((p, i) => (
                        <li key={i} className="rounded border p-3">
                          <div className="flex items-center gap-2"><Badge variant={p.severity === "high" ? "destructive" : "secondary"}>{p.severity}</Badge><span className="font-medium">{p.problem}</span></div>
                          <p className="mt-1 text-xs text-muted-foreground">Evidence: {p.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded border border-primary/50 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Recommended offer</p>
                  <p className="mt-1 text-lg font-semibold">{report.recommended_offer}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{report.offer_reasoning}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Next action</p>
                  <p className="mt-1">{report.next_action}</p>
                </div>
              </>
            )}
          </section>
          <aside className="space-y-4">
            {vis && (
              <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Visibility</p>
                  <span className="font-mono text-2xl font-semibold text-accent">{vis.score}<span className="text-xs text-muted-foreground">/100</span></span>
                </div>
                {vis.breakdown.map((x) => (
                  <div key={x.label} className="flex justify-between gap-2"><span className="text-muted-foreground">{x.label}</span><span className="font-mono">{x.points}/{x.max}</span></div>
                ))}
                <p className="pt-2 text-[11px] text-muted-foreground">Low visibility + good reviews = strongest opportunity.</p>
              </div>
            )}
            <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Social presence</p>
              {socials.length === 0 ? (
                <p className="text-muted-foreground">{b.website ? "No social profiles linked on their website." : "No website to check for social links."}</p>
              ) : socials.map(([k, url]) => (
                <div key={k} className="flex justify-between gap-2"><span className="capitalize text-muted-foreground">{k}</span><a href={url} target="_blank" rel="noreferrer" className="truncate font-mono text-primary underline">{url.replace(/^https?:\/\/(www\.)?/, "")}</a></div>
              ))}
            </div>
            <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Estimates</p>
              <Row k="Confidence" v={report?.confidence} />
              <Row k="Deal value" v={report?.estimated_deal_value_usd != null ? `~$${report.estimated_deal_value_usd}` : "unknown"} />
              <Row k="Conversion" v={report?.conversion_probability} />
              <Row k="Delivery effort" v={report?.delivery_effort} />
              <p className="pt-2 text-[11px] text-muted-foreground">Estimates are AI judgement, not revenue.</p>
            </div>
            <div className="rounded-lg border bg-card p-5 space-y-2 text-sm">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Website evidence</p>
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
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
function Row({ k, v }: { k: string; v?: string | null | undefined }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v ?? "—"}</span></div>;
}
