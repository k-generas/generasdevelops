import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Download, ListChecks, Plus, Save, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";
import { downloadCsvFile, downloadXlsx, rowsToSafeCsv } from "@/lib/export-safe";
import {
  PROSPECT_ENTITY_KINDS,
  emptyProspectFilters,
  normalizeProspectFilters,
  previewFromRecord,
  prospectEntityLabel,
  prospectFilterChips,
  prospectFilterSummary,
  validateProspectList,
  type ProspectEntityKind,
  type ProspectFilters,
  type ProspectList,
} from "@/lib/prospect-lists";
import { interpretProspectPrompt } from "@/lib/prospect-intent.functions";
import type { ProspectInterpretation } from "@/lib/prospect-intent";
import {
  deleteProspectList,
  getProspectLists,
  getProspectResults,
  saveProspectList,
} from "@/lib/prospect-lists.functions";

export const Route = createFileRoute("/_authenticated/lists")({
  head: () => ({
    meta: [
      { title: "Prospect lists - GARE" },
      {
        name: "description",
        content:
          "Save reusable business and professional filters, preview live matches and export safe prospect segments.",
      },
    ],
  }),
  component: ProspectListsPage,
});

type ListDraft = {
  id?: string;
  name: string;
  description: string;
  entityKind: ProspectEntityKind;
  filters: ProspectFilters;
};

function emptyDraft(): ListDraft {
  return {
    name: "",
    description: "",
    entityKind: "business",
    filters: emptyProspectFilters(),
  };
}

function draftFromList(list: ProspectList): ListDraft {
  return {
    id: list.id,
    name: list.name,
    description: list.description ?? "",
    entityKind: list.entityKind,
    filters: list.filters,
  };
}

function ProspectListsPage() {
  const qc = useQueryClient();
  const listsFn = useServerFn(getProspectLists);
  const saveFn = useServerFn(saveProspectList);
  const deleteFn = useServerFn(deleteProspectList);
  const resultsFn = useServerFn(getProspectResults);
  const interpretFn = useServerFn(interpretProspectPrompt);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<ListDraft>(emptyDraft);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [prompt, setPrompt] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretation, setInterpretation] = useState<ProspectInterpretation | null>(null);
  const [interpretError, setInterpretError] = useState<string | null>(null);

  const lists = useQuery({
    queryKey: ["prospect-lists"],
    queryFn: () => listsFn(),
  });

  useEffect(() => {
    if (showNew || selectedId) return;
    const first = lists.data?.rows[0];
    if (!first) return;
    setSelectedId(first.id);
    setDraft(draftFromList(first));
  }, [lists.data, selectedId, showNew]);

  const preview = useQuery({
    queryKey: [
      "prospect-preview",
      draft.entityKind,
      draft.filters.query,
      draft.filters.location,
      draft.filters.district,
      draft.filters.sector,
      draft.filters.stage,
      draft.filters.country,
      draft.filters.professionalType,
      draft.filters.availability,
    ],
    queryFn: () =>
      resultsFn({
        data: {
          entityKind: draft.entityKind,
          filters: draft.filters,
          limit: 8,
        },
      }),
  });

  const previewRows = useMemo(
    () => (preview.data?.rows ?? []).map((row) => previewFromRecord(draft.entityKind, row)),
    [preview.data, draft.entityKind],
  );
  const chips = prospectFilterChips(draft.entityKind, draft.filters);
  const validation = validateProspectList({
    name: draft.name,
    entityKind: draft.entityKind,
    filters: draft.filters,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          description: draft.description || null,
          entityKind: draft.entityKind,
          filters: draft.filters,
        },
      }),
    onSuccess: (saved) => {
      setSelectedId(saved.id);
      setShowNew(false);
      setDraft(draftFromList(saved));
      setMessage({ ok: true, text: "Prospect list saved. It stays live as your data changes." });
      void qc.invalidateQueries({ queryKey: ["prospect-lists"] });
      void qc.invalidateQueries({ queryKey: ["prospect-preview"] });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setSelectedId(null);
      setShowNew(false);
      setDraft(emptyDraft());
      setMessage({
        ok: true,
        text: "Prospect list deleted. Prospects themselves were not touched.",
      });
      void qc.invalidateQueries({ queryKey: ["prospect-lists"] });
    },
    onError: (error) => setMessage({ ok: false, text: describeError(error).title }),
  });

  const setKind = (kind: ProspectEntityKind) => {
    setDraft((value) => ({
      ...value,
      entityKind: kind,
      filters: normalizeProspectFilters(value.filters, kind),
    }));
  };

  const setFilter = (key: keyof ProspectFilters, value: string) => {
    setDraft((current) => ({
      ...current,
      filters: { ...current.filters, [key]: value },
    }));
  };

  const startNew = () => {
    setShowNew(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setMessage(null);
  };

  const selectList = (list: ProspectList) => {
    setShowNew(false);
    setSelectedId(list.id);
    setDraft(draftFromList(list));
    setMessage(null);
  };

  const remove = () => {
    if (!draft.id) return;
    if (!window.confirm(`Delete "${draft.name}"? This only removes the saved filters.`)) return;
    deleteMutation.mutate(draft.id);
  };

  const exportList = async (format: "csv" | "xlsx") => {
    setExporting(format);
    try {
      const result = await resultsFn({
        data: {
          entityKind: draft.entityKind,
          filters: draft.filters,
          limit: 5000,
        },
      });
      if (result.rows.length === 0) throw new Error("No prospects match this list.");
      const filename = `${draft.name || "prospect-list"}-${draft.entityKind}`;
      if (format === "csv") {
        downloadCsvFile(rowsToSafeCsv(result.rows, result.columns), filename);
      } else {
        downloadXlsx(result.rows, result.columns, filename, "Prospects");
      }
      setMessage({
        ok: true,
        text: `Exported ${result.rows.length} row(s)${
          result.truncated ? " (capped at 5,000)" : ""
        }. Compliance checks still run when a campaign queue is built.`,
      });
    } catch (error) {
      setMessage({ ok: false, text: describeError(error).title });
    } finally {
      setExporting(null);
    }
  };

  const interpretAudience = async () => {
    const text = prompt.trim();
    if (text.length < 3 || interpreting) return;
    setInterpreting(true);
    setInterpretation(null);
    setInterpretError(null);
    try {
      const result = await interpretFn({ data: { prompt: text, useAi } });
      setInterpretation(result);
    } catch (error) {
      setInterpretError(describeError(error).title);
    } finally {
      setInterpreting(false);
    }
  };

  const updatePrompt = (value: string) => {
    setPrompt(value);
    setInterpretation(null);
    setInterpretError(null);
  };

  const applyInterpretation = () => {
    if (!interpretation) return;
    setDraft((current) => ({
      ...current,
      entityKind: interpretation.entityKind,
      name: current.name.trim() ? current.name : interpretation.prompt.slice(0, 120),
      filters: interpretation.filters,
    }));
    setMessage({
      ok: true,
      text: "Interpreted filters applied. Review the audience and filters before saving.",
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospect lists</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Save reusable filters for businesses or professionals. Lists are live, so the preview,
            exports and campaign queues always use current records.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus /> New list
        </Button>
      </div>

      {message && (
        <p
          className={`rounded border px-3 py-2 text-sm ${
            message.ok
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          {message.text}
        </p>
      )}

      {lists.isError && (
        <ErrorBanner
          error={lists.error as Error}
          context="Prospect lists"
          onRetry={() => void lists.refetch()}
        />
      )}

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4" /> Describe an audience
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn a plain-language request into editable filters. Interpreted filters are shown
            before they are applied. Conditions GARE cannot verify are listed separately and are
            never used to invent prospects.
          </p>
        </div>
        <Textarea
          value={prompt}
          maxLength={500}
          rows={2}
          onChange={(event) => updatePrompt(event.target.value)}
          placeholder="Find dental clinics in Kigali, or professionals available for work in Kenya"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void interpretAudience()}
            disabled={interpreting || prompt.trim().length < 3}
          >
            <Sparkles /> {interpreting ? "Interpreting..." : "Interpret"}
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(event) => {
                setUseAi(event.target.checked);
                setInterpretation(null);
              }}
            />
            Use AI interpretation (may use configured AI credits; falls back to rules)
          </label>
        </div>

        {interpretError && <p className="text-sm text-destructive">{interpretError}</p>}

        {interpretation && (
          <div className="space-y-2 rounded border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={interpretation.entityKind === "business" ? "secondary" : "outline"}>
                {prospectEntityLabel(interpretation.entityKind)}
              </Badge>
              <Badge variant="outline">
                {interpretation.source === "ai" ? "AI interpretation" : "Rule-based interpretation"}
              </Badge>
              <div className="ml-auto">
                <Button size="sm" onClick={applyInterpretation}>
                  Apply to list
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {prospectFilterChips(interpretation.entityKind, interpretation.filters).map(
                (chip) => (
                  <Badge key={chip} variant="outline">
                    {chip}
                  </Badge>
                ),
              )}
            </div>
            {interpretation.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {interpretation.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {interpretation.unsupported.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Not applied</p>
                <div className="flex flex-wrap gap-1">
                  {interpretation.unsupported.map((condition) => (
                    <Badge key={condition} variant="destructive">
                      {condition}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {interpretation.fallbackReason && (
              <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                {interpretation.fallbackReason}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {lists.isLoading ? (
            <p className="rounded border bg-card p-3 text-sm text-muted-foreground">
              Loading lists...
            </p>
          ) : (lists.data?.rows ?? []).length === 0 ? (
            <div className="rounded border bg-card p-4 text-sm text-muted-foreground">
              <ListChecks className="mb-2 h-5 w-5" />
              <p>No saved lists yet.</p>
              <p className="mt-1">Create a list to reuse the same audience in campaigns.</p>
            </div>
          ) : (
            (lists.data?.rows ?? []).map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => selectList(list)}
                className={`w-full rounded border p-3 text-left transition ${
                  selectedId === list.id
                    ? "border-primary bg-primary/5"
                    : "bg-card hover:bg-muted/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{list.name}</span>
                  <Badge variant={list.entityKind === "business" ? "secondary" : "outline"}>
                    {prospectEntityLabel(list.entityKind)}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {prospectFilterSummary(list.entityKind, list.filters)}
                </p>
              </button>
            ))
          )}
          {lists.data && !lists.data.applied && (
            <p className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              The prospect_lists table is not available yet. Apply the prospect lists migration.
            </p>
          )}
        </aside>

        <section className="space-y-4">
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{draft.id ? "Edit list" : "New list"}</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => void exportList("csv")}
                  disabled={!!exporting || !validation.valid || preview.isFetching}
                >
                  <Download /> {exporting === "csv" ? "Exporting..." : "CSV"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void exportList("xlsx")}
                  disabled={!!exporting || !validation.valid || preview.isFetching}
                >
                  <Download /> {exporting === "xlsx" ? "Exporting..." : "XLSX"}
                </Button>
                <Button
                  onClick={() => void saveMutation.mutateAsync().catch(() => undefined)}
                  disabled={saveMutation.isPending || !validation.valid}
                >
                  <Save /> {draft.id ? "Save changes" : "Save list"}
                </Button>
                {draft.id && (
                  <Button
                    variant="ghost"
                    onClick={remove}
                    disabled={deleteMutation.isPending}
                    aria-label="Delete prospect list"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="list-name">Name</Label>
                <Input
                  id="list-name"
                  value={draft.name}
                  maxLength={160}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Kigali dental clinics"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="list-kind">Audience</Label>
                <select
                  id="list-kind"
                  className="w-full rounded border bg-background px-2 py-2 text-sm"
                  value={draft.entityKind}
                  onChange={(e) => setKind(e.target.value as ProspectEntityKind)}
                >
                  {PROSPECT_ENTITY_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {prospectEntityLabel(kind)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="list-description">Description (optional)</Label>
                <Textarea
                  id="list-description"
                  value={draft.description}
                  maxLength={1000}
                  rows={2}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Why this segment matters, offer angle or exclusions..."
                />
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-4">
              <Input
                placeholder={
                  draft.entityKind === "business"
                    ? "Name, sector, industry, district..."
                    : "Name, headline, country..."
                }
                value={draft.filters.query}
                onChange={(e) => setFilter("query", e.target.value)}
                maxLength={160}
                className="md:col-span-2"
              />
              <Input
                placeholder="Location (district, province, address or country)"
                value={draft.filters.location}
                onChange={(e) => setFilter("location", e.target.value)}
                maxLength={120}
              />
              {draft.entityKind === "business" ? (
                <>
                  <Input
                    placeholder="District"
                    value={draft.filters.district}
                    onChange={(e) => setFilter("district", e.target.value)}
                    maxLength={120}
                  />
                  <Input
                    placeholder="Sector (exact)"
                    value={draft.filters.sector}
                    onChange={(e) => setFilter("sector", e.target.value)}
                    maxLength={120}
                  />
                  <Input
                    placeholder="Outreach stage (exact)"
                    value={draft.filters.stage}
                    onChange={(e) => setFilter("stage", e.target.value)}
                    maxLength={80}
                  />
                </>
              ) : (
                <>
                  <Input
                    placeholder="Country"
                    value={draft.filters.country}
                    onChange={(e) => setFilter("country", e.target.value)}
                    maxLength={80}
                  />
                  <Input
                    placeholder="Type (exact)"
                    value={draft.filters.professionalType}
                    onChange={(e) => setFilter("professionalType", e.target.value)}
                    maxLength={40}
                  />
                  <Input
                    placeholder="Availability (exact)"
                    value={draft.filters.availability}
                    onChange={(e) => setFilter("availability", e.target.value)}
                    maxLength={40}
                  />
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              {chips.map((chip) => (
                <Badge key={chip} variant="outline">
                  {chip}
                </Badge>
              ))}
            </div>

            {!validation.valid && draft.name.length > 0 && (
              <p className="text-xs text-destructive">{validation.errors.join(" ")}</p>
            )}
          </div>

          <div className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h2 className="font-semibold">Live preview</h2>
                <p className="text-sm text-muted-foreground">
                  {preview.isLoading
                    ? "Counting matches..."
                    : `${preview.data?.count ?? 0} match(es) right now.`}
                </p>
              </div>
              <Link to="/campaigns" className="text-sm underline underline-offset-4">
                Use in a campaign
              </Link>
            </div>

            {preview.isError && (
              <div className="p-4">
                <ErrorBanner
                  error={preview.error as Error}
                  context="Prospect preview"
                  onRetry={() => void preview.refetch()}
                />
              </div>
            )}

            {preview.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading preview...</p>
            ) : previewRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No prospects match these filters yet.
              </p>
            ) : (
              <div className="divide-y">
                {previewRows.map((row) => (
                  <div key={row.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[row.detail, row.contact, row.country].filter(Boolean).join(" · ") || "-"}
                      </p>
                    </div>
                    {row.doNotContact && <Badge variant="destructive">Do not contact</Badge>}
                  </div>
                ))}
              </div>
            )}
            {preview.data?.truncated && (
              <p className="border-t p-3 text-xs text-muted-foreground">
                Showing the first {previewRows.length} of {preview.data.count} matches.
              </p>
            )}
          </div>

          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <ShieldAlert className="h-4 w-4" /> Lists never send or bypass review
            </p>
            <p className="mt-1">
              Exports are capped at 5,000 rows. Suppression, do-not-contact, lawful-basis and
              contact completeness checks still run when a campaign queue is built. Nothing is
              messaged from GARE.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
