import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOffers } from "@/lib/offers.hooks";
import { getRevenueLeaks } from "@/lib/leaks.functions";
import { deleteOfferKit, getOfferKits, saveOfferKit } from "@/lib/offer-kit.functions";
import {
  kitScopeSummary,
  OFFER_KIT_DISCLAIMER,
  problemKeysForOffer,
  resolveKit,
  suggestKit,
  type OfferKit,
} from "@/lib/offer-kit";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/offers")({
  head: () => ({
    meta: [
      { title: "Offer studio — GARE" },
      {
        name: "description",
        content: "Package your offers into repeatable scope and delivery templates.",
      },
    ],
  }),
  component: OffersPage,
});

function parseList(v: string): string[] {
  return v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function OffersPage() {
  const qc = useQueryClient();
  const offersQ = useOffers();
  const loadKits = useServerFn(getOfferKits);
  const loadLeaks = useServerFn(getRevenueLeaks);
  const upsertKit = useServerFn(saveOfferKit);
  const removeKit = useServerFn(deleteOfferKit);

  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<OfferKit | null>(null);

  const kitsQ = useQuery({ queryKey: ["offer-kits"], queryFn: () => loadKits() });
  const leaksQ = useQuery({ queryKey: ["revenue-leaks"], queryFn: () => loadLeaks() });

  const offers = useMemo(
    () => (offersQ.data?.offers ?? []).filter((o) => o.active && o.name.trim() !== ""),
    [offersQ.data],
  );
  const kits = useMemo(() => kitsQ.data ?? [], [kitsQ.data]);

  const openLeaksByProblem = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leaksQ.data ?? []) {
      if (l.status !== "open") continue;
      counts.set(l.problem_key, (counts.get(l.problem_key) ?? 0) + 1);
    }
    return counts;
  }, [leaksQ.data]);

  const saveMutation = useMutation({
    mutationFn: (kit: OfferKit) =>
      upsertKit({
        data: {
          offer: kit.offer,
          scope_includes: kit.scopeIncludes,
          scope_excludes: kit.scopeExcludes,
          deliverables: kit.deliverables,
          timeline_days: kit.timelineDays,
          revisions: kit.revisions,
          deposit_percent: kit.depositPercent,
          recurring: kit.recurring,
          notes: kit.notes,
          active: kit.active,
        },
      }),
    onSuccess: () => {
      setDraft(null);
      setMessage("Kit saved.");
      void qc.invalidateQueries({ queryKey: ["offer-kits"] });
    },
    onError: (e) => {
      const d = describeError(e, "Save offer kit");
      setMessage(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Package className="h-5 w-5" /> Offer studio
        </h1>
        <p className="text-sm text-muted-foreground">{OFFER_KIT_DISCLAIMER}</p>
      </header>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {(offersQ.isError || kitsQ.isError || leaksQ.isError) && (
        <ErrorBanner
          error={(offersQ.error ?? kitsQ.error ?? leaksQ.error) as Error}
          context="Offer studio"
          onRetry={() => {
            if (offersQ.isError) void offersQ.refetch();
            if (kitsQ.isError) void kitsQ.refetch();
            if (leaksQ.isError) void leaksQ.refetch();
          }}
        />
      )}

      {!kitsQ.isLoading && !kitsQ.isError && kitsQ.data?.length === 0 && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          No kits saved yet — each offer below shows a suggested starter derived from its category.
        </p>
      )}

      {offersQ.isError ? (
        <ErrorBanner
          error={offersQ.error}
          context="Offers"
          onRetry={() => void offersQ.refetch()}
        />
      ) : offersQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading offers…</p>
      ) : offers.length === 0 ? (
        <EmptyState
          title="No active offers"
          why="Offers are managed on the Settings page. Add one there (name, price, category), mark it active, then return here to package it into a delivery kit."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">Open Settings</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const stored = kits.find((k) => k.offer.toLowerCase() === o.name.toLowerCase());
            const kit = resolveKit(o.name, kits);
            const problems = problemKeysForOffer(o.name);
            const leakCount = problems.reduce((n, p) => n + (openLeaksByProblem.get(p) ?? 0), 0);
            const editing = draft?.offer === o.name;
            return (
              <article key={o.name} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{o.name}</h2>
                  {stored ? (
                    <Badge variant="secondary">saved kit</Badge>
                  ) : (
                    <Badge variant="outline">suggested starter</Badge>
                  )}
                  {kit.recurring && <Badge variant="outline">recurring</Badge>}
                  {leakCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {leakCount} open leak{leakCount === 1 ? "" : "s"} it addresses
                    </span>
                  )}
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraft(editing ? null : { ...kit })}
                    >
                      {editing ? "Close" : "Edit kit"}
                    </Button>
                    {stored && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          removeKit({ data: { offer: o.name } })
                            .then(() => {
                              setMessage("Kit removed.");
                              void qc.invalidateQueries({ queryKey: ["offer-kits"] });
                            })
                            .catch((e) =>
                              setMessage(e instanceof Error ? e.message : "Could not remove."),
                            )
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </span>
                </div>

                {!editing && <KitPreview kit={kit} />}

                {editing && draft && (
                  <KitForm
                    draft={draft}
                    setDraft={setDraft}
                    onReset={() => setDraft({ ...suggestKit(o.name) })}
                    onSave={() => saveMutation.mutate(draft)}
                    busy={saveMutation.isPending}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KitPreview({ kit }: { kit: OfferKit }) {
  const summary = kitScopeSummary(kit);
  if (summary === "" && kit.deliverables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No scope yet — edit to define what is included, excluded and delivered.
      </p>
    );
  }
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Scope</p>
        <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{summary || "—"}</pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground">Delivery checklist</p>
        <ol className="list-decimal pl-4 text-muted-foreground">
          {kit.deliverables.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function KitForm({
  draft,
  setDraft,
  onReset,
  onSave,
  busy,
}: {
  draft: OfferKit;
  setDraft: (k: OfferKit) => void;
  onReset: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  function set<K extends keyof OfferKit>(key: K, v: OfferKit[K]) {
    setDraft({ ...draft, [key]: v });
  }
  const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Included (one per line)</Label>
          <Textarea
            value={draft.scopeIncludes.join("\n")}
            onChange={(e) => set("scopeIncludes", parseList(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Not included (one per line)</Label>
          <Textarea
            value={draft.scopeExcludes.join("\n")}
            onChange={(e) => set("scopeExcludes", parseList(e.target.value))}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Delivery checklist (one step per line)</Label>
          <Textarea
            value={draft.deliverables.join("\n")}
            onChange={(e) => set("deliverables", parseList(e.target.value))}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <div className="space-y-1">
            <Label className="text-xs">Timeline (days)</Label>
            <Input
              type="number"
              value={draft.timelineDays ?? ""}
              onChange={(e) => set("timelineDays", numOrNull(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Revisions</Label>
            <Input
              type="number"
              value={draft.revisions ?? ""}
              onChange={(e) => set("revisions", numOrNull(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Deposit %</Label>
            <Input
              type="number"
              value={draft.depositPercent ?? ""}
              onChange={(e) => set("depositPercent", numOrNull(e.target.value))}
            />
          </div>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea
            value={draft.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.recurring}
          onChange={(e) => set("recurring", e.target.checked)}
        />
        Recurring engagement (retainer-style)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={onSave}>
          Save kit
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Reset to template
        </Button>
      </div>
    </div>
  );
}
