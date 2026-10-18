import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateOutreachPack } from "@/lib/proposals.functions";
import { OUTREACH_PACK_MODE, OUTREACH_PACK_CHANNELS } from "@/lib/outreach-pack";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ProviderChoice = "auto" | "openai" | "gemini" | "lovable";

type PackRow = {
  id: string;
  channel: string | null;
  title: string | null;
  body: string;
  status: string;
  created_at: string;
};

export function OutreachMessages({
  businessId,
  provider,
  enabled,
  generateToken,
  auto = true,
}: {
  businessId: string;
  provider: ProviderChoice;
  enabled: boolean;
  generateToken: number;
  // When false this instance only displays messages + offers a manual button;
  // it never auto-runs on token bumps. Used for the secondary modal instance.
  auto?: boolean;
}) {
  const qc = useQueryClient();
  const gen = useServerFn(generateOutreachPack);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const lastToken = useRef(0);
  const lastBusiness = useRef(businessId);

  const list = useQuery({
    queryKey: ["outreach-messages", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposals")
        .select("id,channel,title,body,status,created_at")
        .eq("business_id", businessId)
        .eq("mode", OUTREACH_PACK_MODE)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PackRow[];
    },
  });

  const run = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await gen({ data: { businessId, provider } });
      setMsg(
        `Wrote ${r.count} messages — ${r.byChannel.email} email · ${r.byChannel.whatsapp} WhatsApp · ${r.byChannel.sms} SMS.`,
      );
      qc.invalidateQueries({ queryKey: ["outreach-messages", businessId] });
      qc.invalidateQueries({ queryKey: ["biz-proposals", businessId] });
      qc.invalidateQueries({ queryKey: ["biz-events", businessId] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not write the messages.");
    }
    setBusy(false);
  }, [businessId, provider, gen, qc]);

  // Regenerate right after a successful investigation (the page bumps the token).
  useEffect(() => {
    if (lastBusiness.current !== businessId) {
      lastBusiness.current = businessId;
      lastToken.current = 0;
      return;
    }
    if (!enabled) return;
    if (!auto) return;
    if (generateToken > lastToken.current) {
      lastToken.current = generateToken;
      void run();
    }
  }, [generateToken, enabled, auto, run, businessId]);

  async function copy(id: string, body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  const rows = list.data ?? [];
  const byChannel = OUTREACH_PACK_CHANNELS.map((ch) => ({
    channel: ch,
    items: rows.filter((r) => (r.channel ?? "") === ch),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-mono text-xs uppercase tracking-[0.3em] text-primary">
          Outreach messages
        </p>
        {enabled && (
          <Button size="sm" variant="outline" onClick={run} disabled={busy}>
            {busy ? "Writing… (≈30s)" : rows.length ? "Regenerate messages" : "Write messages"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ready-to-copy first-contact messages — three versions each for Email, WhatsApp and SMS.
        Regenerating replaces this business&apos;s unsent drafts; anything already sent is kept.
      </p>

      {!enabled && (
        <p className="text-sm text-muted-foreground">
          No outreach messages for this business — it is either permanently closed or nothing in the
          report fits an offer.
        </p>
      )}

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      {enabled && rows.length === 0 && !busy && (
        <p className="text-sm text-muted-foreground">
          No messages yet. They are written automatically right after an investigation.
        </p>
      )}

      {byChannel.map((group) => (
        <div key={group.channel} className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {group.channel}
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map((m) => (
              <div key={m.id} className="flex flex-col gap-2 rounded border p-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium">{m.title ?? m.channel}</p>
                  <Badge variant="outline" className="text-xs">
                    {m.status}
                  </Badge>
                </div>
                <pre className="min-h-[80px] flex-1 whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
                  {m.body}
                </pre>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(m.id, m.body)}>
                    {copied === m.id ? "Copied" : "Copy"}
                  </Button>
                  <Link
                    to="/proposals/$id"
                    params={{ id: m.id }}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Open & send
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
