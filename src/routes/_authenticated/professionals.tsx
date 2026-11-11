import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Link2, Plus, Search, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorBanner } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";
import {
  deleteProfessional,
  getProfessionalLinks,
  getProfessionalSummary,
  getProfessionals,
  linkProfessionalToBusiness,
  saveProfessional,
  unlinkProfessionalFromBusiness,
  type ProfessionalLink,
} from "@/lib/professionals.functions";
import {
  PROFESSIONAL_AVAILABILITY_STATUSES,
  PROFESSIONAL_LINK_TYPES,
  PROFESSIONAL_STAGES,
  PROFESSIONAL_TYPES,
  PROFESSIONAL_VERIFICATION_STATUSES,
  professionalCompleteness,
  professionalLinkLabel,
  professionalStageLabel,
  professionalTypeLabel,
  type Professional,
  type ProfessionalAvailabilityStatus,
  type ProfessionalEvidence,
  type ProfessionalLinkType,
  type ProfessionalStage,
  type ProfessionalType,
  type ProfessionalVerificationStatus,
} from "@/lib/professional-intelligence";

export const Route = createFileRoute("/_authenticated/professionals")({
  head: () => ({
    meta: [
      { title: "Professionals - GARE" },
      {
        name: "description",
        content:
          "A private, evidence-based directory of professional people and their business relationships.",
      },
    ],
  }),
  component: ProfessionalsPage,
});

type Draft = {
  id?: string;
  fullName: string;
  headline: string;
  professionalType: ProfessionalType;
  country: string;
  city: string;
  languages: string;
  expertise: string;
  skills: string;
  website: string;
  publicEmail: string;
  publicPhone: string;
  profileUrl: string;
  sourceName: string;
  sourceUrl: string;
  evidenceNote: string;
  verificationStatus: ProfessionalVerificationStatus;
  availabilityStatus: ProfessionalAvailabilityStatus;
  relationshipStage: ProfessionalStage;
  doNotContact: boolean;
  confidence: string;
  notes: string;
};

const PAGE_SIZE = 20;

function emptyDraft(): Draft {
  return {
    fullName: "",
    headline: "",
    professionalType: "other",
    country: "",
    city: "",
    languages: "",
    expertise: "",
    skills: "",
    website: "",
    publicEmail: "",
    publicPhone: "",
    profileUrl: "",
    sourceName: "",
    sourceUrl: "",
    evidenceNote: "",
    verificationStatus: "unverified",
    availabilityStatus: "unknown",
    relationshipStage: "researching",
    doNotContact: false,
    confidence: "0.3",
    notes: "",
  };
}

function draftFrom(p: Professional): Draft {
  return {
    ...(p.id ? { id: p.id } : {}),
    fullName: p.fullName,
    headline: p.headline ?? "",
    professionalType: p.professionalType ?? "other",
    country: p.country ?? "",
    city: p.city ?? "",
    languages: (p.languages ?? []).join(", "),
    expertise: (p.expertise ?? []).join(", "),
    skills: (p.skills ?? []).join(", "),
    website: p.website ?? "",
    publicEmail: p.publicEmail ?? "",
    publicPhone: p.publicPhone ?? "",
    profileUrl: p.profileUrl ?? "",
    sourceName: p.sourceName ?? "",
    sourceUrl: p.sourceUrl ?? "",
    evidenceNote: "",
    verificationStatus: p.verificationStatus ?? "unverified",
    availabilityStatus: p.availabilityStatus ?? "unknown",
    relationshipStage: p.relationshipStage ?? "researching",
    doNotContact: !!p.doNotContact,
    confidence: String(p.confidence ?? 0.3),
    notes: p.notes ?? "",
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function evidenceWithSource(
  draft: Draft,
  existing: ProfessionalEvidence[] = [],
): ProfessionalEvidence[] {
  if (!draft.sourceUrl.trim()) return existing;
  const duplicate = existing.some((e) => e.url === draft.sourceUrl.trim());
  if (duplicate) return existing;
  return [
    ...existing,
    {
      kind: "public_profile",
      label: draft.sourceName.trim() || "Public source",
      url: draft.sourceUrl.trim(),
      observedAt: new Date().toISOString(),
      note: draft.evidenceNote.trim() || null,
    },
  ];
}

function ProfessionalsPage() {
  const qc = useQueryClient();
  const list = useServerFn(getProfessionals);
  const summaryFn = useServerFn(getProfessionalSummary);
  const save = useServerFn(saveProfessional);
  const remove = useServerFn(deleteProfessional);
  const linksFn = useServerFn(getProfessionalLinks);
  const linkFn = useServerFn(linkProfessionalToBusiness);
  const unlinkFn = useServerFn(unlinkProfessionalFromBusiness);

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [verification, setVerification] = useState("");
  const [availability, setAvailability] = useState("");
  const [stage, setStage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkBusinessId, setLinkBusinessId] = useState("");
  const [linkType, setLinkType] = useState<ProfessionalLinkType>("works_at");
  const [linkRole, setLinkRole] = useState("");

  const professionals = useQuery({
    queryKey: ["professionals", page, query, country, type, verification, availability, stage],
    queryFn: () =>
      list({
        data: {
          page,
          pageSize: PAGE_SIZE,
          query,
          country,
          professionalType: type,
          verificationStatus: verification,
          availabilityStatus: availability,
          relationshipStage: stage,
        },
      }),
  });

  const summary = useQuery({
    queryKey: ["professional-summary"],
    queryFn: () => summaryFn(),
  });

  const ids = useMemo(
    () => (professionals.data?.rows ?? []).map((p) => p.id!).filter(Boolean),
    [professionals.data],
  );

  const links = useQuery({
    queryKey: ["professional-links", ids],
    enabled: ids.length > 0,
    queryFn: () => linksFn({ data: { professionalIds: ids } }),
  });

  const businessOptions = useQuery({
    queryKey: ["professional-business-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name")
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const linksByProfessional = useMemo(() => {
    const map = new Map<string, ProfessionalLink[]>();
    for (const link of links.data ?? []) {
      const current = map.get(link.professionalId) ?? [];
      map.set(link.professionalId, [...current, link]);
    }
    return map;
  }, [links.data]);

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const existing = professionals.data?.rows.find((p) => p.id === d.id)?.evidence ?? [];
      return save({
        data: {
          ...(d.id ? { id: d.id } : {}),
          fullName: d.fullName,
          headline: d.headline || null,
          professionalType: d.professionalType,
          country: d.country || null,
          city: d.city || null,
          languages: splitList(d.languages),
          expertise: splitList(d.expertise),
          skills: splitList(d.skills),
          website: d.website || null,
          publicEmail: d.publicEmail || null,
          publicPhone: d.publicPhone || null,
          profileUrl: d.profileUrl || null,
          sourceName: d.sourceName || null,
          sourceUrl: d.sourceUrl || null,
          evidence: evidenceWithSource(d, existing),
          confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0)),
          verificationStatus: d.verificationStatus,
          availabilityStatus: d.availabilityStatus,
          relationshipStage: d.relationshipStage,
          doNotContact: d.doNotContact,
          notes: d.notes || null,
        },
      });
    },
    onSuccess: (saved) => {
      setMessage({ ok: true, text: `${saved.fullName} saved.` });
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["professionals"] });
      void qc.invalidateQueries({ queryKey: ["professional-summary"] });
    },
    onError: (e) => {
      const d = describeError(e, "Save professional");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      setMessage({ ok: true, text: "Professional removed." });
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["professionals"] });
      void qc.invalidateQueries({ queryKey: ["professional-summary"] });
      void qc.invalidateQueries({ queryKey: ["professional-links"] });
    },
    onError: (e) => {
      const d = describeError(e, "Delete professional");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!draft?.id) throw new Error("Save the professional before linking a business.");
      if (!linkBusinessId) throw new Error("Choose a business.");
      return linkFn({
        data: {
          professionalId: draft.id,
          businessId: linkBusinessId,
          role: linkRole || null,
          relationshipType: linkType,
          confidence: Number(draft.confidence) || 0.5,
          verified: draft.verificationStatus === "owner_confirmed",
          evidence: [],
        },
      });
    },
    onSuccess: (link) => {
      setMessage({ ok: true, text: `Linked to ${link.businessName}.` });
      setLinkBusinessId("");
      setLinkRole("");
      void qc.invalidateQueries({ queryKey: ["professional-links"] });
    },
    onError: (e) => {
      const d = describeError(e, "Link business");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: string) => unlinkFn({ data: { id } }),
    onSuccess: () => {
      setMessage({ ok: true, text: "Link removed." });
      void qc.invalidateQueries({ queryKey: ["professional-links"] });
    },
    onError: (e) => {
      const d = describeError(e, "Unlink business");
      setMessage({ ok: false, text: `${d.title}: ${d.message} ${d.fix}` });
    },
  });

  const rows = professionals.data?.rows ?? [];
  const total = professionals.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const applied = professionals.data?.applied !== false;
  const draftLinks = draft?.id ? (linksByProfessional.get(draft.id) ?? []) : [];

  function openNew() {
    setMessage(null);
    setDraft(emptyDraft());
  }

  function openEdit(p: Professional) {
    setMessage(null);
    setDraft(draftFrom(p));
    setLinkBusinessId("");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Users className="h-5 w-5" /> Professional intelligence
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Record professional people you lawfully observe, keep the public source with each
            record, and link them to businesses. No profiles are invented or scraped automatically.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Add professional
        </Button>
      </header>

      {message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            message.ok ? "bg-muted text-muted-foreground" : "border-destructive/40 text-destructive"
          }`}
        >
          {message.text}
        </p>
      )}

      {!applied && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
          The professional tables are not available in this database yet. Apply
          <code className="mx-1">20261109000000_global_intelligence_foundation.sql</code>
          to enable this workspace. Nothing was lost; the page is in setup mode.
        </p>
      )}

      {(professionals.isError || summary.isError) && (
        <ErrorBanner
          error={(professionals.error ?? summary.error) as Error}
          context="Professionals"
          onRetry={() => {
            if (professionals.isError) void professionals.refetch();
            if (summary.isError) void summary.refetch();
          }}
        />
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="People" value={summary.data?.total ?? 0} />
        <Stat label="Verified" value={summary.data?.verified ?? 0} />
        <Stat label="Open to work" value={summary.data?.openToWork ?? 0} />
        <Stat label="With email" value={summary.data?.withEmail ?? 0} />
        <Stat label="With phone" value={summary.data?.withPhone ?? 0} />
        <Stat label="Do not contact" value={summary.data?.doNotContact ?? 0} tone="danger" />
      </section>

      <section className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, role, email, city..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <SelectBox
          value={country}
          onChange={(v) => {
            setCountry(v);
            setPage(1);
          }}
          placeholder="All countries"
          options={[...new Set(rows.map((r) => r.country).filter(Boolean))] as string[]}
        />
        <SelectBox
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
          placeholder="All types"
          options={[...PROFESSIONAL_TYPES]}
        />
        <SelectBox
          value={verification}
          onChange={(v) => {
            setVerification(v);
            setPage(1);
          }}
          placeholder="All verification"
          options={[...PROFESSIONAL_VERIFICATION_STATUSES]}
        />
        <SelectBox
          value={stage}
          onChange={(v) => {
            setStage(v);
            setPage(1);
          }}
          placeholder="All stages"
          options={[...PROFESSIONAL_STAGES]}
        />
      </section>

      {draft && (
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {draft.id ? "Edit professional" : "New professional"}
            </h2>
            <div className="flex gap-2">
              {draft.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this professional record? Business links will also be removed.",
                      )
                    ) {
                      deleteMutation.mutate(draft.id!);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Close
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Full name *">
              <Input
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              />
            </Field>
            <Field label="Headline / role">
              <Input
                value={draft.headline}
                onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
              />
            </Field>
            <Field label="Professional type">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={draft.professionalType}
                onChange={(e) =>
                  setDraft({ ...draft, professionalType: e.target.value as ProfessionalType })
                }
              >
                {PROFESSIONAL_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {professionalTypeLabel(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <Input
                value={draft.country}
                onChange={(e) => setDraft({ ...draft, country: e.target.value })}
              />
            </Field>
            <Field label="City">
              <Input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </Field>
            <Field label="Languages (comma separated)">
              <Input
                value={draft.languages}
                onChange={(e) => setDraft({ ...draft, languages: e.target.value })}
              />
            </Field>
            <Field label="Public email">
              <Input
                value={draft.publicEmail}
                onChange={(e) => setDraft({ ...draft, publicEmail: e.target.value })}
              />
            </Field>
            <Field label="Public phone">
              <Input
                value={draft.publicPhone}
                onChange={(e) => setDraft({ ...draft, publicPhone: e.target.value })}
              />
            </Field>
            <Field label="Website">
              <Input
                value={draft.website}
                onChange={(e) => setDraft({ ...draft, website: e.target.value })}
              />
            </Field>
            <Field label="Profile URL">
              <Input
                value={draft.profileUrl}
                onChange={(e) => setDraft({ ...draft, profileUrl: e.target.value })}
              />
            </Field>
            <Field label="Source name">
              <Input
                value={draft.sourceName}
                onChange={(e) => setDraft({ ...draft, sourceName: e.target.value })}
              />
            </Field>
            <Field label="Source URL">
              <Input
                value={draft.sourceUrl}
                onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
              />
            </Field>
            <Field label="Expertise (comma separated)">
              <Input
                value={draft.expertise}
                onChange={(e) => setDraft({ ...draft, expertise: e.target.value })}
              />
            </Field>
            <Field label="Skills (comma separated)">
              <Input
                value={draft.skills}
                onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
              />
            </Field>
            <Field label="Verification">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={draft.verificationStatus}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    verificationStatus: e.target.value as ProfessionalVerificationStatus,
                  })
                }
              >
                {PROFESSIONAL_VERIFICATION_STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Availability">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={draft.availabilityStatus}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    availabilityStatus: e.target.value as ProfessionalAvailabilityStatus,
                  })
                }
              >
                {PROFESSIONAL_AVAILABILITY_STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Relationship stage">
              <select
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={draft.relationshipStage}
                onChange={(e) =>
                  setDraft({ ...draft, relationshipStage: e.target.value as ProfessionalStage })
                }
              >
                {PROFESSIONAL_STAGES.map((v) => (
                  <option key={v} value={v}>
                    {professionalStageLabel(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Confidence (0-1)">
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={draft.confidence}
                onChange={(e) => setDraft({ ...draft, confidence: e.target.value })}
              />
            </Field>
            <Field label="Source evidence note">
              <Input
                value={draft.evidenceNote}
                onChange={(e) => setDraft({ ...draft, evidenceNote: e.target.value })}
                placeholder="What did you observe?"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.doNotContact}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  doNotContact: e.target.checked,
                  relationshipStage: e.target.checked ? "do_not_contact" : draft.relationshipStage,
                })
              }
            />
            Do not contact this person
          </label>

          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Only recorded facts, assumptions and next steps. Do not store private or sensitive data you do not need."
            />
          </Field>

          {draft.id && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Link2 className="h-4 w-4" /> Business relationships
              </h3>
              {draftLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No business links recorded.</p>
              ) : (
                <div className="space-y-1">
                  {draftLinks.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{l.businessName}</span>
                      <Badge variant="outline">
                        {professionalLinkLabel(l.relationshipType as ProfessionalLinkType)}
                      </Badge>
                      {l.role && <span className="text-xs text-muted-foreground">{l.role}</span>}
                      {l.verified && <Badge variant="secondary">verified</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => unlinkMutation.mutate(l.id)}
                        disabled={unlinkMutation.isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-2 md:grid-cols-4">
                <select
                  className="rounded border bg-background px-2 py-2 text-sm"
                  value={linkBusinessId}
                  onChange={(e) => setLinkBusinessId(e.target.value)}
                >
                  <option value="">Choose business...</option>
                  {(businessOptions.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded border bg-background px-2 py-2 text-sm"
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as ProfessionalLinkType)}
                >
                  {PROFESSIONAL_LINK_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {professionalLinkLabel(v)}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Role at business"
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => linkMutation.mutate()}
                  disabled={linkMutation.isPending || !linkBusinessId}
                >
                  Link business
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save professional"}
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">People</h2>
          <span className="text-xs text-muted-foreground">
            {total} record{total === 1 ? "" : "s"}
          </span>
        </div>

        {professionals.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading professionals...</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={applied ? "No professionals yet" : "Professional workspace needs setup"}
            why={
              applied
                ? "Add a person you lawfully observed, record the public source, then link them to a business. Keeping the source visible prevents guesses from becoming facts."
                : "Apply the additive global intelligence migration to create the professionals, links and suppression tables."
            }
            action={
              applied ? (
                <Button size="sm" onClick={openNew}>
                  <Plus className="mr-1 h-4 w-4" /> Add the first person
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {rows.map((p) => {
              const completeness = professionalCompleteness(p);
              const personLinks = linksByProfessional.get(p.id!) ?? [];
              const evidenceCount = (p.evidence ?? []).length;
              return (
                <article key={p.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{p.fullName}</h3>
                        <Badge variant="secondary">
                          {professionalTypeLabel(p.professionalType ?? "other")}
                        </Badge>
                        {p.verificationStatus && p.verificationStatus !== "unverified" && (
                          <Badge variant="outline">{p.verificationStatus.replace(/_/g, " ")}</Badge>
                        )}
                        {p.availabilityStatus === "open" && <Badge>open to work</Badge>}
                        {p.doNotContact && <Badge variant="destructive">do not contact</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[p.headline, p.city, p.country].filter(Boolean).join(" - ") ||
                          "No role or location recorded"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {p.publicEmail && <span>{p.publicEmail}</span>}
                        {p.publicPhone && <span>{p.publicPhone}</span>}
                        <span>{professionalStageLabel(p.relationshipStage ?? "researching")}</span>
                        <span>confidence {Math.round((p.confidence ?? 0) * 100)}%</span>
                        <span>
                          profile {completeness.score}% complete
                          {completeness.missing.length > 0
                            ? ` (missing ${completeness.missing.slice(0, 3).join(", ")})`
                            : ""}
                        </span>
                        <span>
                          {evidenceCount} evidence item{evidenceCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {personLinks.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Linked to: {personLinks.map((l) => l.businessName).join(", ")}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-semibold ${tone === "danger" && value > 0 ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      className="rounded border bg-background px-2 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
