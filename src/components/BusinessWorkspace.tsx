import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateProposal, PROPOSAL_MODES } from "@/lib/proposals.functions";
import { activeOfferNames } from "@/lib/offers";
import { useOffers } from "@/lib/offers.hooks";
import { PROPOSAL_CHANNELS, channelGuidance } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Fallback shown only if the owner's catalog is empty/unavailable.
const FALLBACK_OFFERS = [
  "Website Development",
  "Website Redesign",
  "Website Performance Improvement",
  "Business Automation",
  "Custom Software",
  "DukaLinka",
  "Digital Product",
  "Digital Service",
];
const PROVIDERS = ["auto", "openai", "gemini", "lovable"] as const;
type ProviderChoice = (typeof PROVIDERS)[number];
const sel = "rounded border bg-background px-2 py-1.5 text-sm";

export function BusinessWorkspace({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const gen = useServerFn(generateProposal);
  const offersQ = useOffers();
  const offerOptions = activeOfferNames(offersQ.data?.offers ?? []);
  const offerChoices = offerOptions.length > 0 ? offerOptions : FALLBACK_OFFERS;
  const [mode, setMode] = useState<string>(PROPOSAL_MODES[0]);
  const [channel, setChannel] = useState("Email");
  const [language, setLanguage] = useState("English");
  const [tone, setTone] = useState("Professional");
  const [offer, setOffer] = useState("");
  const [provider, setProvider] = useState<ProviderChoice>("auto");
  const [price, setPrice] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const proposals = useQuery({
    queryKey: ["biz-proposals", businessId],
    queryFn: async () =>
      (
        await supabase
          .from("proposals")
          .select("id,title,mode,status,channel,created_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const events = useQuery({
    queryKey: ["biz-events", businessId],
    queryFn: async () =>
      (
        await supabase
          .from("business_activity_events")
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });
  const notes = useQuery({
    queryKey: ["biz-notes", businessId],
    queryFn: async () =>
      (
        await supabase
          .from("business_notes")
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const invs = useQuery({
    queryKey: ["biz-invs", businessId],
    queryFn: async () =>
      (
        await supabase
          .from("investigations")
          .select("id,created_at,score,recommended_offer,website_reachable,website_load_ms")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  async function onGenerate() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await gen({
        data: {
          businessId,
          mode,
          channel,
          language,
          tone,
          offer: offer || undefined,
          price: price ? Number(price) : null,
          currency: "USD",
          extra: extra || undefined,
          provider,
        },
      });
      setMsg(
        r.staleDays == null
          ? "Drafted without an investigation — run one for evidence-based personalisation."
          : r.staleDays > 30
            ? `Drafted, but the investigation is ${r.staleDays} days old — consider re-investigating.`
            : "Draft saved.",
      );
      qc.invalidateQueries({ queryKey: ["biz-proposals", businessId] });
      qc.invalidateQueries({ queryKey: ["biz-events", businessId] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Generation failed");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="space-y-4 rounded-lg border bg-card p-5 lg:col-span-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Proposal Studio</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={sel} value={mode} onChange={(e) => setMode(e.target.value)}>
            {PROPOSAL_MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className={sel} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {PROPOSAL_CHANNELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className={sel} value={language} onChange={(e) => setLanguage(e.target.value)}>
            {["English", "French", "Kinyarwanda", "Swahili"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className={sel} value={tone} onChange={(e) => setTone(e.target.value)}>
            {["Professional", "Friendly", "Direct", "Formal"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className={sel} value={offer} onChange={(e) => setOffer(e.target.value)}>
            <option value="">No specific offer</option>
            {offerChoices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            className={sel}
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderChoice)}
            title="Which AI provider writes the draft"
          >
            <option value="auto">AI: Auto (fallback)</option>
            <option value="openai">AI: OpenAI</option>
            <option value="gemini">AI: Gemini</option>
            <option value="lovable">AI: Lovable</option>
          </select>
          <Input
            placeholder="Price in USD (optional)"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <Textarea
          placeholder="Optional: extra instructions, or paste the client's question/objection"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Copy-paste ready for {channel}. {channelGuidance(channel)}
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={onGenerate} disabled={busy}>
            {busy ? "Writing… (≈30s)" : "Generate draft"}
          </Button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
        <div className="divide-y rounded border">
          {proposals.data?.map((p) => (
            <Link
              key={p.id}
              to="/proposals/$id"
              params={{ id: p.id }}
              className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{p.title ?? p.mode}</span>
              <span className="text-xs text-muted-foreground">
                {p.channel} · {new Date(p.created_at).toLocaleDateString()}
              </span>
              <span className="rounded border px-1.5 font-mono text-xs">{p.status}</span>
            </Link>
          ))}
          {proposals.data?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No proposals yet. An outreach pack is written automatically after each investigation.
            </p>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border bg-card p-5 text-sm">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Investigation history
          </p>
          {invs.data?.map((i) => (
            <div key={i.id} className="flex justify-between py-1 font-mono text-xs">
              <span>{new Date(i.created_at).toLocaleDateString()}</span>
              <span>
                score {i.score ?? "—"} ·{" "}
                {i.website_reachable ? `${i.website_load_ms}ms` : "site down/none"}
              </span>
            </div>
          ))}
          {invs.data?.length === 0 && <p className="text-muted-foreground">None yet.</p>}
        </div>
        <div className="rounded-lg border bg-card p-5 text-sm">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">Notes</p>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              await supabase
                .from("business_notes")
                .insert({ business_id: businessId, body: note.trim() });
              setNote("");
              qc.invalidateQueries({ queryKey: ["biz-notes", businessId] });
            }}
          >
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
            />
            <Button size="sm" type="submit">
              Add
            </Button>
          </form>
          {notes.data?.map((n) => (
            <p key={n.id} className="mt-2 border-l-2 border-primary pl-2">
              {n.body}
              <span className="block text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </p>
          ))}
        </div>
        <div className="rounded-lg border bg-card p-5 text-sm">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">Timeline</p>
          {events.data?.map((ev) => (
            <div key={ev.id} className="border-l py-1 pl-3">
              <p>{ev.summary}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {new Date(ev.created_at).toLocaleString()}
              </p>
            </div>
          ))}
          {events.data?.length === 0 && (
            <p className="text-muted-foreground">No recorded activity yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
