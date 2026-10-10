import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["DRAFT", "READY_TO_SEND", "SENT", "REPLIED", "NEGOTIATING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];

export const Route = createFileRoute("/_authenticated/proposals/$id")({
  head: () => ({ meta: [{ title: "Proposal editor — GARE" }, { name: "description", content: "Edit, version and track a proposal." }] }),
  component: Editor,
});

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const prop = useQuery({ queryKey: ["proposal", id], queryFn: async () => (await supabase.from("proposals").select("*, businesses(id,name)").eq("id", id).single()).data });
  const versions = useQuery({ queryKey: ["pversions", id], queryFn: async () => (await supabase.from("proposal_versions").select("*").eq("proposal_id", id).order("version", { ascending: false })).data ?? [] });
  const [body, setBody] = useState<string | null>(null);
  const [saved, setSaved] = useState("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const p = prop.data as any;

  useEffect(() => { if (p && body === null) setBody(p.body); }, [p, body]);

  function onEdit(v: string) {
    setBody(v); setSaved("saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from("proposals").update({ body: v, updated_at: new Date().toISOString() }).eq("id", id);
      setSaved(error ? `save failed: ${error.message}` : "saved");
    }, 800);
  }

  async function log(summary: string, event_type: string) {
    if (p?.business_id) await supabase.from("business_activity_events").insert({ business_id: p.business_id, event_type, summary, ref_table: "proposals", ref_id: id });
  }

  if (!p) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const why = (p.why ?? []) as { statement: string; kind: string; evidence: string }[];

  return (
    <div className="space-y-4">
      <Link to="/proposals" className="text-xs text-muted-foreground hover:text-foreground">← Proposals</Link>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">{p.title ?? p.mode}</h1>
          <p className="text-xs text-muted-foreground">
            <Link to="/businesses/$id" params={{ id: p.business_id }} className="underline">{p.businesses?.name}</Link> · {p.mode} · {p.channel} · {p.language} · v{p.current_version}
            {p.sent_at && ` · sent ${new Date(p.sent_at).toLocaleString()} via ${p.sent_channel}`}
          </p>
        </div>
        <select className="rounded border bg-background px-2 py-1 text-sm" value={p.status} onChange={async (e) => {
          await supabase.from("proposals").update({ status: e.target.value }).eq("id", id);
          await log(`Proposal status → ${e.target.value}`, "proposal_status");
          qc.invalidateQueries({ queryKey: ["proposal", id] });
        }}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <Textarea className="min-h-[420px] font-mono text-sm" value={body ?? ""} onChange={(e) => onEdit(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto font-mono text-[11px] text-muted-foreground">{saved}</span>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(body ?? "")}>Copy</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              const v = p.current_version + 1;
              await supabase.from("proposal_versions").insert({ proposal_id: id, version: v, body: body ?? "", note: "Manual save" });
              await supabase.from("proposals").update({ current_version: v }).eq("id", id);
              await log(`Proposal edited · version ${v} saved`, "proposal_edited");
              qc.invalidateQueries({ queryKey: ["proposal", id] }); qc.invalidateQueries({ queryKey: ["pversions", id] });
            }}>Save as new version</Button>
            <Button size="sm" variant="outline" onClick={() => {
              const w = window.open("", "_blank");
              if (w) { w.document.write(`<pre style="font-family:Georgia,serif;white-space:pre-wrap;max-width:720px;margin:40px auto;font-size:15px">${(body ?? "").replace(/</g, "&lt;")}</pre>`); w.print(); }
            }}>Print / PDF</Button>
            <Button size="sm" onClick={async () => {
              const ch = prompt("Which channel did you send it through? (Email, WhatsApp, Phone…)", p.channel ?? "Email");
              if (!ch) return;
              await supabase.from("proposals").update({ status: "SENT", sent_at: new Date().toISOString(), sent_channel: ch }).eq("id", id);
              await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("dedupe_key", `send-proposal-${id}`).eq("status", "open");
              await log(`Proposal recorded as sent via ${ch}`, "proposal_sent");
              qc.invalidateQueries({ queryKey: ["proposal", id] });
            }}>Record as sent</Button>
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">Why this message?</p>
            {why.length === 0 ? <p className="text-muted-foreground">No research statements recorded.</p> : why.map((w, i) => (
              <div key={i} className="mb-3">
                <span className="font-mono text-[10px] uppercase text-accent">{w.kind.replace(/_/g, " ")}</span>
                <p>{w.statement}</p>
                <p className="text-xs text-muted-foreground">Evidence: {w.evidence}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">Versions</p>
            {versions.data?.map((v) => (
              <div key={v.id} className="flex items-center justify-between py-1">
                <span className="font-mono text-xs">v{v.version} · {new Date(v.created_at).toLocaleString()} · {v.note}</span>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Restore v${v.version} into the editor?`)) onEdit(v.body); }}>Restore</Button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
