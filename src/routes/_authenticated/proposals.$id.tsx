import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  OUTREACH_CHANNELS,
  nowLocalInput,
  outreachSummary,
  readOutreachDetails,
} from "@/lib/outreach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nextInvoiceNumber } from "@/lib/invoices";

const STATUSES = [
  "DRAFT",
  "READY_TO_SEND",
  "SENT",
  "REPLIED",
  "NEGOTIATING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

export const Route = createFileRoute("/_authenticated/proposals/$id")({
  head: () => ({
    meta: [
      { title: "Proposal editor — GARE" },
      { name: "description", content: "Edit, version and track a proposal." },
    ],
  }),
  component: Editor,
});

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const prop = useQuery({
    queryKey: ["proposal", id],
    queryFn: async () =>
      (await supabase.from("proposals").select("*, businesses(id,name)").eq("id", id).single())
        .data,
  });
  const versions = useQuery({
    queryKey: ["pversions", id],
    queryFn: async () =>
      (
        await supabase
          .from("proposal_versions")
          .select("*")
          .eq("proposal_id", id)
          .order("version", { ascending: false })
      ).data ?? [],
  });
  const outreach = useQuery({
    queryKey: ["proposal-outreach", id],
    queryFn: async () =>
      (
        await supabase
          .from("business_activity_events")
          .select("id,event_type,summary,details,created_at")
          .eq("ref_table", "proposals")
          .eq("ref_id", id)
          .in("event_type", ["proposal_sent", "proposal_outreach"])
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const [body, setBody] = useState<string | null>(null);
  const [saved, setSaved] = useState("saved");
  const [channel, setChannel] = useState<string>("Email");
  const [response, setResponse] = useState("");
  const [when, setWhen] = useState(() => nowLocalInput());
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [outcomeReason, setOutcomeReason] = useState("");
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelTouched = useRef(false);
  const p = prop.data;

  useEffect(() => {
    if (p && body === null) setBody(p.body);
  }, [p, body]);

  useEffect(() => {
    if (p?.channel && !channelTouched.current) setChannel(p.channel);
  }, [p?.channel]);

  useEffect(() => {
    if (p && outcomeReason === "") setOutcomeReason(p.outcome ?? "");
  }, [p, outcomeReason]);

  function onEdit(v: string) {
    setBody(v);
    setSaved("saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("proposals")
        .update({ body: v, updated_at: new Date().toISOString() })
        .eq("id", id);
      setSaved(error ? `save failed: ${error.message}` : "saved");
    }, 800);
  }

  async function log(summary: string, event_type: string) {
    if (p?.business_id)
      await supabase.from("business_activity_events").insert({
        business_id: p.business_id,
        event_type,
        summary,
        ref_table: "proposals",
        ref_id: id,
      });
  }

  async function recordOutreach() {
    if (!p) return;
    const ch = channel.trim() || p.channel || "Email";
    const at = when ? new Date(when).toISOString() : new Date().toISOString();
    setOutreachBusy(true);
    try {
      await supabase
        .from("proposals")
        .update({ status: "SENT", sent_at: at, sent_channel: ch })
        .eq("id", id);
      await supabase.from("business_activity_events").insert({
        business_id: p.business_id,
        event_type: "proposal_outreach",
        summary: outreachSummary(ch, response),
        ref_table: "proposals",
        ref_id: id,
        details: { channel: ch, response: response.trim() || null, at },
      });
      await supabase
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("dedupe_key", `send-proposal-${id}`)
        .eq("status", "open");
      setResponse("");
      setWhen(nowLocalInput());
      qc.invalidateQueries({ queryKey: ["proposal", id] });
      qc.invalidateQueries({ queryKey: ["proposal-outreach", id] });
      qc.invalidateQueries({ queryKey: ["biz-events", p.business_id] });
    } finally {
      setOutreachBusy(false);
    }
  }

  async function saveOutcome() {
    if (!p) return;
    setOutcomeBusy(true);
    try {
      await supabase
        .from("proposals")
        .update({ outcome: outcomeReason.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", id);
      await log(`Outcome recorded: ${outcomeReason.trim() || "cleared"}`, "proposal_outcome");
      qc.invalidateQueries({ queryKey: ["proposal", id] });
    } finally {
      setOutcomeBusy(false);
    }
  }

  async function createInvoice() {
    if (!p) return;
    setInvBusy(true);
    try {
      const { data: existing } = await supabase.from("invoices").select("number");
      const number = nextInvoiceNumber(
        (existing ?? []).map((r) => r.number),
        new Date().getFullYear(),
      );
      const { error } = await supabase.from("invoices").insert({
        number,
        business_id: p.business_id,
        proposal_id: p.id,
        currency: p.currency ?? "USD",
        amount: p.price ?? 0,
        status: "DRAFT",
        issued_at: new Date().toISOString(),
        notes: p.title ?? p.offer ?? p.mode ?? null,
      });
      if (error) throw error;
      await log(`Invoice ${number} created`, "invoice_created");
      navigate({ to: "/invoices" });
    } catch (e) {
      window.alert(
        (e instanceof Error ? e.message : "Could not create invoice.") +
          "\n\nIf this keeps failing, apply migration 0005_invoices.sql.",
      );
    }
    setInvBusy(false);
  }

  if (!p) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const why = (p.why ?? []) as unknown as { statement: string; kind: string; evidence: string }[];

  return (
    <div className="space-y-4">
      <Link to="/proposals" className="text-xs text-muted-foreground hover:text-foreground">
        ← Proposals
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">{p.title ?? p.mode}</h1>
          <p className="text-xs text-muted-foreground">
            <Link to="/businesses/$id" params={{ id: p.business_id }} className="underline">
              {p.businesses?.name}
            </Link>{" "}
            · {p.mode} · {p.channel} · {p.language} · v{p.current_version}
            {p.sent_at && ` · sent ${new Date(p.sent_at).toLocaleString()} via ${p.sent_channel}`}
          </p>
        </div>
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={p.status}
          onChange={async (e) => {
            await supabase.from("proposals").update({ status: e.target.value }).eq("id", id);
            await log(`Proposal status → ${e.target.value}`, "proposal_status");
            qc.invalidateQueries({ queryKey: ["proposal", id] });
          }}
        >
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={createInvoice} disabled={invBusy}>
          {invBusy ? "Creating…" : "Create invoice"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate({ to: "/orders" })}>
          Create order
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <Textarea
            className="min-h-[420px] font-mono text-sm"
            value={body ?? ""}
            onChange={(e) => onEdit(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto font-mono text-[11px] text-muted-foreground">{saved}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(body ?? "")}
            >
              Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const v = p.current_version + 1;
                await supabase
                  .from("proposal_versions")
                  .insert({ proposal_id: id, version: v, body: body ?? "", note: "Manual save" });
                await supabase.from("proposals").update({ current_version: v }).eq("id", id);
                await log(`Proposal edited · version ${v} saved`, "proposal_edited");
                qc.invalidateQueries({ queryKey: ["proposal", id] });
                qc.invalidateQueries({ queryKey: ["pversions", id] });
              }}
            >
              Save as new version
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(
                    `<pre style="font-family:Georgia,serif;white-space:pre-wrap;max-width:720px;margin:40px auto;font-size:15px">${(body ?? "").replace(/</g, "&lt;")}</pre>`,
                  );
                  w.print();
                }
              }}
            >
              Print / PDF
            </Button>
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
              Why this message?
            </p>
            {why.length === 0 ? (
              <p className="text-muted-foreground">No research statements recorded.</p>
            ) : (
              why.map((w, i) => (
                <div key={i} className="mb-3">
                  <span className="font-mono text-[10px] uppercase text-accent">
                    {w.kind.replace(/_/g, " ")}
                  </span>
                  <p>{w.statement}</p>
                  <p className="text-xs text-muted-foreground">Evidence: {w.evidence}</p>
                </div>
              ))
            )}
          </div>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
              Outreach
            </p>
            <div className="space-y-2">
              <select
                className="w-full rounded border bg-background px-2 py-1 text-sm"
                value={channel}
                onChange={(e) => {
                  channelTouched.current = true;
                  setChannel(e.target.value);
                }}
              >
                {OUTREACH_CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <Textarea
                placeholder="Optional: what did they say? (objection, interest, next step)"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
              <Button size="sm" onClick={recordOutreach} disabled={outreachBusy}>
                {outreachBusy ? "Recording…" : "Record outreach"}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {outreach.data?.map((e) => {
                const od = readOutreachDetails(e.details);
                return (
                  <div key={e.id} className="border-l-2 border-primary pl-2">
                    <span className="font-mono text-[10px] uppercase text-accent">
                      {od.channel ?? e.event_type}
                    </span>
                    <p>{e.summary}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                );
              })}
              {outreach.data?.length === 0 && (
                <p className="text-muted-foreground">No outreach recorded yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
              Outcome
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              Set the status above to ACCEPTED or REJECTED, then note why. This feeds your win rate
              on the dashboard.
            </p>
            <Textarea
              placeholder="Why? (price, timing, no response, went with someone else…)"
              value={outcomeReason}
              onChange={(e) => setOutcomeReason(e.target.value)}
            />
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={saveOutcome}
              disabled={outcomeBusy}
            >
              {outcomeBusy ? "Saving…" : "Save outcome reason"}
            </Button>
          </div>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
              Versions
            </p>
            {versions.data?.map((v) => (
              <div key={v.id} className="flex items-center justify-between py-1">
                <span className="font-mono text-xs">
                  v{v.version} · {new Date(v.created_at).toLocaleString()} · {v.note}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Restore v${v.version} into the editor?`)) onEdit(v.body);
                  }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
