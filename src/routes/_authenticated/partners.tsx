import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createHandoff,
  deletePartner,
  getHandoffs,
  getOverflowCandidates,
  getPartners,
  savePartner,
  setHandoffStatus,
  type HandoffWithNames,
} from "@/lib/partners.functions";
import {
  HANDOFF_STATUSES,
  matchPartners,
  PARTNER_DISCLAIMER,
  PARTNER_KINDS,
  summarizeHandoffs,
  type HandoffStatus,
  type OverflowItem,
  type Partner,
  type PartnerKind,
  type PartnerMatch,
} from "@/lib/partners";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/partners")({
  head: () => ({
    meta: [
      { title: "Partners — GARE" },
      {
        name: "description",
        content: "Route the work you cannot deliver alone to partners you have recorded.",
      },
    ],
  }),
  component: PartnersPage,
});

const REASON_LABEL: Record<string, string> = {
  capacity: "exceeds your capacity",
  skills: "skills not yet demonstrated",
  manual: "offloaded manually",
};

type PartnerDraft = {
  id?: string | undefined;
  name: string;
  kind: PartnerKind;
  services: string;
  industries: string;
  districts: string;
  available_hours_per_week: string;
  rate: string;
  currency: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  notes: string;
  active: boolean;
};

function emptyDraft(): PartnerDraft {
  return {
    name: "",
    kind: "agency",
    services: "",
    industries: "",
    districts: "",
    available_hours_per_week: "0",
    rate: "0",
    currency: "USD",
    contact_email: "",
    contact_phone: "",
    source: "",
    notes: "",
    active: true,
  };
}

function draftFrom(p: Partner): PartnerDraft {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    services: p.services.join(", "),
    industries: p.industries.join(", "),
    districts: p.districts.join(", "),
    available_hours_per_week: String(p.availableHoursPerWeek),
    rate: String(p.rate),
    currency: p.currency,
    contact_email: p.contactEmail ?? "",
    contact_phone: p.contactPhone ?? "",
    source: p.source ?? "",
    notes: p.notes ?? "",
    active: p.active,
  };
}

function splitList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function PartnersPage() {
  const qc = useQueryClient();
  const loadPartners = useServerFn(getPartners);
  const loadOverflow = useServerFn(getOverflowCandidates);
  const loadHandoffs = useServerFn(getHandoffs);
  const upsertPartner = useServerFn(savePartner);
  const removePartner = useServerFn(deletePartner);
  const addHandoff = useServerFn(createHandoff);
  const changeHandoff = useServerFn(setHandoffStatus);

  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartnerDraft | null>(null);

  const partners = useQuery({ queryKey: ["partners"], queryFn: () => loadPartners() });
  const overflow = useQuery({ queryKey: ["overflow-candidates"], queryFn: () => loadOverflow() });
  const handoffs = useQuery({ queryKey: ["handoffs"], queryFn: () => loadHandoffs() });

  const partnerList = partners.data ?? [];
  const handoffSummary = useMemo(() => summarizeHandoffs(handoffs.data ?? []), [handoffs.data]);

  const saveMutation = useMutation({
    mutationFn: (d: PartnerDraft) =>
      upsertPartner({
        data: {
          ...(d.id ? { id: d.id } : {}),
          name: d.name,
          kind: d.kind,
          services: splitList(d.services),
          industries: splitList(d.industries),
          districts: splitList(d.districts),
          available_hours_per_week: Number(d.available_hours_per_week) || 0,
          rate: Number(d.rate) || 0,
          currency: d.currency || "USD",
          contact_email: d.contact_email || null,
          contact_phone: d.contact_phone || null,
          source: d.source || null,
          notes: d.notes || null,
          active: d.active,
        },
      }),
    onSuccess: () => {
      setDraft(null);
      setMessage("Partner saved.");
      void qc.invalidateQueries({ queryKey: ["partners"] });
    },
    onError: (e) => {
      const d = describeError(e, "Save partner");
      setMessage(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    },
  });

  const handoffMutation = useMutation({
    mutationFn: (input: {
      partner_id: string;
      business_id: string | null;
      leak_id: string | null;
      title: string;
      reason: string;
      service: string | null;
      delivery_value: number;
      owner_cut: number;
      currency: string;
    }) => addHandoff({ data: input }),
    onSuccess: () => {
      setMessage("Handoff created.");
      void qc.invalidateQueries({ queryKey: ["handoffs"] });
    },
    onError: (e) => {
      const d = describeError(e, "Create handoff");
      setMessage(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Handshake className="h-5 w-5" /> Partners
        </h1>
        <p className="text-sm text-muted-foreground">
          Work you cannot deliver alone, matched to partners you have recorded. {PARTNER_DISCLAIMER}
        </p>
      </header>

      {message && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {(partners.isError || overflow.isError || handoffs.isError) && (
        <ErrorBanner
          error={(partners.error ?? overflow.error ?? handoffs.error) as Error}
          context="Partners"
          onRetry={() => {
            if (partners.isError) void partners.refetch();
            if (overflow.isError) void overflow.refetch();
            if (handoffs.isError) void handoffs.refetch();
          }}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Overflow work</h2>
          <span className="text-xs text-muted-foreground">
            {overflow.data?.candidates.length ?? 0} item
            {(overflow.data?.candidates.length ?? 0) === 1 ? "" : "s"} you cannot fit
          </span>
        </div>
        {!overflow.data?.applied && overflow.data?.error && (
          <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
            {overflow.data.error}
          </p>
        )}
        {overflow.isError ? (
          <ErrorBanner
            error={overflow.error}
            context="Overflow"
            onRetry={() => void overflow.refetch()}
          />
        ) : overflow.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking capacity…</p>
        ) : (overflow.data?.candidates.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing to offload right now"
            why="Overflow appears when an open leak needs more hours than your remaining weekly capacity, or skills you have not marked as demonstrated. Set your weekly capacity on the Settings page and scan leaks on the Radar page to populate this."
          />
        ) : (
          (overflow.data?.candidates ?? []).map((c) => (
            <OverflowCard
              key={c.leakId ?? c.title}
              candidate={c}
              partners={partnerList}
              onCreate={(m, value, cut) =>
                handoffMutation.mutate({
                  partner_id: m.partner.id!,
                  business_id: c.businessId,
                  leak_id: c.leakId,
                  title: c.title,
                  reason: c.reasons.map((r) => REASON_LABEL[r] ?? r).join("; "),
                  service: c.service,
                  delivery_value: value,
                  owner_cut: cut,
                  currency: m.partner.currency,
                })
              }
              busy={handoffMutation.isPending}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Partner directory</h2>
          <span className="text-xs text-muted-foreground">{partnerList.length} recorded</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setDraft(emptyDraft())}
          >
            Add partner
          </Button>
        </div>

        {draft && (
          <PartnerForm
            draft={draft}
            setDraft={setDraft}
            onSave={() => saveMutation.mutate(draft)}
            onCancel={() => setDraft(null)}
            busy={saveMutation.isPending}
          />
        )}

        {partners.isError ? (
          <ErrorBanner
            error={partners.error}
            context="Partner directory"
            onRetry={() => void partners.refetch()}
          />
        ) : partners.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading partners…</p>
        ) : partnerList.length === 0 ? (
          <EmptyState
            title="No partners recorded yet"
            why="Add the agencies and freelancers you already trust — their services, industries and districts drive matching. Matches use only what you enter here; nothing is invented."
            action={
              <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft())}>
                Add your first partner
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {partnerList.map((p) => (
              <PartnerRow
                key={p.id}
                partner={p}
                onEdit={() => setDraft(draftFrom(p))}
                onDelete={() => {
                  removePartner({ data: { id: p.id! } })
                    .then(() => {
                      setMessage("Partner removed.");
                      void qc.invalidateQueries({ queryKey: ["partners"] });
                    })
                    .catch((e) => setMessage(e instanceof Error ? e.message : "Could not remove."));
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Handoffs</h2>
          <span className="text-xs text-muted-foreground">
            {handoffSummary.total} total · {handoffSummary.byStatus.accepted} accepted ·{" "}
            {handoffSummary.byStatus.delivered} delivered
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            delivery value {handoffSummary.deliveryValue.toFixed(0)} · your cut{" "}
            {handoffSummary.ownerCut.toFixed(0)}
          </span>
        </div>
        {handoffs.isError ? (
          <ErrorBanner
            error={handoffs.error}
            context="Handoffs"
            onRetry={() => void handoffs.refetch()}
          />
        ) : handoffs.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading handoffs…</p>
        ) : (handoffs.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No handoffs yet"
            why="Match an overflow item (above) to a partner to create one. A handoff tracks the delivery value and your cut."
          />
        ) : (
          <div className="space-y-2">
            {(handoffs.data ?? []).map((h) => (
              <HandoffRowView
                key={h.id}
                handoff={h}
                onChange={(status) =>
                  changeHandoff({ data: { id: h.id, status } })
                    .then(() => void qc.invalidateQueries({ queryKey: ["handoffs"] }))
                    .catch((e) => setMessage(e instanceof Error ? e.message : "Could not update."))
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OverflowCard({
  candidate,
  partners,
  onCreate,
  busy,
}: {
  candidate: OverflowItem & { businessName: string | null; severity: string; hypothesis: boolean };
  partners: Partner[];
  onCreate: (match: PartnerMatch, value: number, cut: number) => void;
  busy: boolean;
}) {
  const [showMatches, setShowMatches] = useState(false);
  const matches = useMemo(
    () => (showMatches ? matchPartners(candidate, partners) : []),
    [showMatches, candidate, partners],
  );

  return (
    <article className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={candidate.severity === "high" ? "destructive" : "secondary"}>
          {candidate.severity}
        </Badge>
        <h3 className="font-semibold">{candidate.title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {candidate.estimatedHours} h est.
        </span>
      </div>
      <p className="flex flex-wrap gap-2 text-xs">
        {candidate.reasons.map((r) => (
          <Badge key={r} variant="outline">
            {REASON_LABEL[r] ?? r}
          </Badge>
        ))}
        {candidate.service && (
          <span className="text-muted-foreground">offer: {candidate.service}</span>
        )}
        {candidate.district && (
          <span className="text-muted-foreground">· {candidate.district}</span>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {candidate.businessId && (
          <Button size="sm" variant="ghost" asChild>
            <Link to="/businesses/$id" params={{ id: candidate.businessId }}>
              Open lead
            </Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowMatches((v) => !v)}>
          {showMatches ? "Hide partners" : "Find partners"}
        </Button>
      </div>

      {showMatches &&
        (matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No partners recorded yet — add one below to match this work.
          </p>
        ) : (
          <div className="space-y-2">
            {matches.map((m) => (
              <MatchRow
                key={m.partner.id ?? m.partner.name}
                match={m}
                onCreate={onCreate}
                busy={busy}
              />
            ))}
          </div>
        ))}
    </article>
  );
}

function MatchRow({
  match,
  onCreate,
  busy,
}: {
  match: PartnerMatch;
  onCreate: (match: PartnerMatch, value: number, cut: number) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("0");
  const [cut, setCut] = useState("0");
  return (
    <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{match.partner.name}</span>
        <Badge variant="outline">{match.partner.kind}</Badge>
        {match.hypothesis && <Badge variant="secondary">hypothesis</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          {Math.round(match.score * 100)}% fit
        </span>
      </div>
      {match.reasons.length > 0 && (
        <p className="text-xs text-muted-foreground">{match.reasons.join(" ")}</p>
      )}
      {match.uncertainties.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Uncertain: {match.uncertainties.join(" ")}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div className="w-28 space-y-1">
          <Label className="text-[11px]">Delivery value</Label>
          <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-[11px]">Your cut</Label>
          <Input type="number" value={cut} onChange={(e) => setCut(e.target.value)} />
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onCreate(match, Number(value) || 0, Number(cut) || 0)}
        >
          Create handoff
        </Button>
      </div>
    </div>
  );
}

function PartnerForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: PartnerDraft;
  setDraft: (d: PartnerDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  function set<K extends keyof PartnerDraft>(key: K, v: PartnerDraft[K]) {
    setDraft({ ...draft, [key]: v });
  }
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{draft.id ? "Edit partner" : "Add partner"}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Kind</Label>
          <select
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value as PartnerKind)}
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            {PARTNER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Input value={draft.currency} onChange={(e) => set("currency", e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">Services (comma separated)</Label>
          <Input
            value={draft.services}
            placeholder="website development, seo, branding"
            onChange={(e) => set("services", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Industries</Label>
          <Input value={draft.industries} onChange={(e) => set("industries", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Districts (or "remote")</Label>
          <Input value={draft.districts} onChange={(e) => set("districts", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Available h / week</Label>
          <Input
            type="number"
            value={draft.available_hours_per_week}
            onChange={(e) => set("available_hours_per_week", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rate</Label>
          <Input type="number" value={draft.rate} onChange={(e) => set("rate", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Contact email</Label>
          <Input
            value={draft.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Contact phone</Label>
          <Input
            value={draft.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">How you know them (source)</Label>
          <Input
            value={draft.source}
            placeholder="referred by…, worked with on…"
            onChange={(e) => set("source", e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs">Notes</Label>
          <Textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => set("active", e.target.checked)}
        />
        Active (eligible for matching)
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !draft.name.trim()} onClick={onSave}>
          Save partner
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PartnerRow({
  partner,
  onEdit,
  onDelete,
}: {
  partner: Partner;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
      <span className="font-medium">{partner.name}</span>
      <Badge variant="outline">{partner.kind}</Badge>
      {!partner.active && <Badge variant="secondary">inactive</Badge>}
      {partner.services.length > 0 && (
        <span className="text-xs text-muted-foreground">{partner.services.join(", ")}</span>
      )}
      {partner.availableHoursPerWeek > 0 && (
        <span className="text-xs text-muted-foreground">{partner.availableHoursPerWeek} h/wk</span>
      )}
      <span className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          Delete
        </Button>
      </span>
    </article>
  );
}

function HandoffRowView({
  handoff,
  onChange,
}: {
  handoff: HandoffWithNames;
  onChange: (status: HandoffStatus) => void;
}) {
  return (
    <article className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
      <span className="font-medium">{handoff.partner_name ?? "Unknown"}</span>
      <span className="text-muted-foreground">→ {handoff.title}</span>
      {handoff.service && <Badge variant="outline">{handoff.service}</Badge>}
      <span className="text-xs text-muted-foreground">
        value {Number(handoff.delivery_value).toFixed(0)} {handoff.currency} · cut{" "}
        {Number(handoff.owner_cut).toFixed(0)}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {handoff.business_id && (
          <Link
            to="/businesses/$id"
            params={{ id: handoff.business_id }}
            className="text-xs underline"
          >
            lead
          </Link>
        )}
        <select
          value={handoff.status}
          onChange={(e) => onChange(e.target.value as HandoffStatus)}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        >
          {HANDOFF_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </span>
    </article>
  );
}
