import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSystemStatus } from "@/lib/system.functions";
import { DEFAULT_CURRENCY, parseMinPrices, type MinPrices } from "@/lib/pricing";
import { offerNamesForFloors, sortOffers, type Offer } from "@/lib/offers";
import { useOffers } from "@/lib/offers.hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — GARE" },
      {
        name: "description",
        content: "Owner profile, offer catalog, pricing floors and integration status.",
      },
    ],
  }),
  component: Settings,
});

function Settings() {
  const status = useServerFn(getSystemStatus);
  const prefs = useQuery({
    queryKey: ["settings-prefs"],
    queryFn: async () =>
      (await supabase.from("user_preferences").select("min_prices").maybeSingle()).data,
  });
  const [prices, setPrices] = useState<MinPrices>({});
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sys = useQuery({ queryKey: ["system-status"], queryFn: () => status({}) });
  const offersQ = useOffers();

  const [catalog, setCatalog] = useState<Offer[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [offersReady, setOffersReady] = useState(false);
  const [offerMsg, setOfferMsg] = useState<string | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);

  useEffect(() => {
    if (prefs.data && !ready) {
      setPrices(parseMinPrices(prefs.data.min_prices));
      setReady(true);
    }
  }, [prefs.data, ready]);

  useEffect(() => {
    if (offersQ.data && !offersReady) {
      setCatalog(sortOffers(offersQ.data.offers));
      setOffersReady(true);
    }
  }, [offersQ.data, offersReady]);

  const floorNames = offerNamesForFloors(offersQ.data?.offers ?? []);

  async function save() {
    setBusy(true);
    setSaved(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          { owner_id: u.user.id, min_prices: prices, updated_at: new Date().toISOString() },
          { onConflict: "owner_id" },
        );
      if (error) throw error;
      setSaved("Saved. New proposals cannot be priced below these floors.");
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "Save failed");
    }
    setBusy(false);
  }

  function patchOffer(index: number, next: Partial<Offer>) {
    setCatalog((c) => c.map((o, i) => (i === index ? { ...o, ...next } : o)));
  }

  function addOffer() {
    setCatalog((c) => [
      ...c,
      {
        id: null,
        name: "",
        default_price: null,
        currency: DEFAULT_CURRENCY,
        deliverables: null,
        notes: null,
        active: true,
        position: c.length,
      },
    ]);
  }

  function removeOffer(index: number) {
    setCatalog((c) => {
      const target = c[index];
      if (target?.id) setRemoved((r) => (r.includes(target.id!) ? r : [...r, target.id!]));
      return c.filter((_, i) => i !== index);
    });
  }

  async function saveCatalog() {
    setOfferBusy(true);
    setOfferMsg(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      let inserted = 0;
      let updated = 0;
      for (let i = 0; i < catalog.length; i++) {
        const o = catalog[i];
        if (!o || !o.name.trim()) continue;
        const row = {
          owner_id: u.user.id,
          name: o.name.trim(),
          default_price: o.default_price,
          currency: o.currency || DEFAULT_CURRENCY,
          deliverables: o.deliverables,
          notes: o.notes,
          active: o.active,
          position: i,
          updated_at: new Date().toISOString(),
        };
        if (o.id) {
          const { error } = await supabase.from("offers").update(row).eq("id", o.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from("offers").insert(row);
          if (error) throw error;
          inserted++;
        }
      }
      if (removed.length) {
        const { error } = await supabase.from("offers").delete().in("id", removed);
        if (error) throw error;
      }
      const res = await offersQ.refetch();
      setCatalog(sortOffers(res.data?.offers ?? []));
      setOffersReady(true);
      setRemoved([]);
      setOfferMsg(
        `Saved (${inserted} added, ${updated} updated${removed.length ? `, ${removed.length} removed` : ""}).`,
      );
    } catch (e) {
      setOfferMsg(e instanceof Error ? e.message : "Save failed");
    }
    setOfferBusy(false);
  }

  const floorsMissing = offersQ.data ? !offersQ.data.persisted : false;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Owner &amp; pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls that protect your work. Enforced on the server, not just here.
        </p>
      </header>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Offer catalog</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The services you sell. Names here drive proposal drafting and the pricing floors
              below.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addOffer} type="button">
            <Plus className="h-4 w-4" /> Add offer
          </Button>
        </div>

        {floorsMissing && (
          <div className="flex items-start gap-2 border-b bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>
              The offers table does not exist yet, so built-in defaults are shown and edits will not
              save. Apply{" "}
              <code className="font-mono">drizzle/migrations/0004_offers_catalog.sql</code> to the
              shared database.
            </span>
          </div>
        )}

        <div className="space-y-3 p-4">
          {catalog.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No offers yet. Add one, or save to seed the built-in list.
            </p>
          )}
          {catalog.map((o, i) => (
            <div key={o.id ?? `new-${i}`} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={o.name}
                  placeholder="Offer name (e.g. Website Redesign)"
                  onChange={(e) => patchOffer(i, { name: e.target.value })}
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={o.active}
                    onChange={(e) => patchOffer(i, { active: e.target.checked })}
                  />
                  Active
                </label>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  aria-label="Remove offer"
                  onClick={() => removeOffer(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  placeholder="Default price"
                  value={o.default_price ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = v === "" ? null : Number(v);
                    patchOffer(i, {
                      default_price: n !== null && Number.isFinite(n) && n >= 0 ? n : null,
                    });
                  }}
                />
                <Input
                  value={o.currency}
                  placeholder={DEFAULT_CURRENCY}
                  onChange={(e) => patchOffer(i, { currency: e.target.value })}
                />
                <Input
                  value={o.deliverables ?? ""}
                  placeholder="Deliverables (what's included)"
                  onChange={(e) => patchOffer(i, { deliverables: e.target.value || null })}
                />
              </div>
              <Input
                className="mt-2"
                value={o.notes ?? ""}
                placeholder="Internal notes (not shown to the client)"
                onChange={(e) => patchOffer(i, { notes: e.target.value || null })}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-3">
          <Button onClick={saveCatalog} disabled={offerBusy || floorsMissing} type="button">
            {offerBusy ? "Saving…" : "Save catalog"}
          </Button>
          {offerMsg && <span className="text-sm text-muted-foreground">{offerMsg}</span>}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Minimum prices (pricing floors)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The engine refuses to draft a proposal priced below these amounts. Leave blank for no
            floor.
          </p>
        </div>
        <div className="divide-y">
          {offerNamesForFloors(catalog.length ? catalog : (offersQ.data?.offers ?? [])).map(
            (offer) => (
              <div key={offer} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm">{offer}</span>
                <span className="text-xs text-muted-foreground">{DEFAULT_CURRENCY}</span>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="no floor"
                  className="w-32 text-right"
                  value={prices[offer] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPrices((p) => {
                      const next = { ...p };
                      if (v === "") delete next[offer];
                      else {
                        const n = Number(v);
                        if (Number.isFinite(n) && n >= 0) next[offer] = n;
                      }
                      return next;
                    });
                  }}
                />
              </div>
            ),
          )}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-3">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save pricing floors"}
          </Button>
          {saved && <span className="text-sm text-muted-foreground">{saved}</span>}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Integrations</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What the engine can actually reach right now. Keys are never shown.
          </p>
        </div>
        <div className="divide-y">
          {sys.isPending ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Checking…</p>
          ) : (
            <>
              <StatusRow
                label="Google Maps (discovery)"
                ok={!!sys.data?.maps}
                hint="Needs LOVABLE_API_KEY + GOOGLE_MAPS_API_KEY"
              />
              <StatusRow label="AI · OpenAI" ok={!!sys.data?.ai.openai} hint="OPENAI_API_KEY" />
              <StatusRow label="AI · Gemini" ok={!!sys.data?.ai.gemini} hint="GEMINI_API_KEY" />
              <StatusRow label="AI · Lovable" ok={!!sys.data?.ai.lovable} hint="LOVABLE_API_KEY" />
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Not configured yet</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            These are intentionally off. Nothing is faked.
          </p>
        </div>
        <ul className="px-4 py-3 text-sm text-muted-foreground">
          <li>Payment provider (no real payments are processed)</li>
          <li>Email / WhatsApp sending (you record sends manually)</li>
        </ul>
      </section>
    </div>
  );
}

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-accent" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      <span className="flex-1 text-sm">{label}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{hint}</span>
    </div>
  );
}
