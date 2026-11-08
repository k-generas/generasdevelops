import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  createMaintenanceRecordFn,
  generateSolutionPromptsFn,
  buildSolutionRecommendationsFn,
  setSolutionRecommendationStatusFn,
} from "@/lib/solution.functions";
import {
  MAINTENANCE_STATUS_LABELS,
  PROMPT_PLATFORMS,
  PROMPT_PLATFORM_LABELS,
  REQUESTED_DELIVERABLE_LABELS,
  SOLUTION_INTENT_LABELS,
  SOLUTION_TYPE_LABELS,
  latestPromptPerPlatform,
  type MaintenanceStatus,
  type PromptPlatform,
  type RequestedDeliverable,
  type SolutionEvidence,
  type SolutionIntent,
  type SolutionType,
} from "@/lib/solution-builder";
import { evidenceFrom, qualityFrom, requirementsFrom, stringList } from "@/lib/solution-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type RecommendationRow = Database["public"]["Tables"]["solution_recommendations"]["Row"];
type PromptRow = Database["public"]["Tables"]["solution_prompts"]["Row"];
type MaintenanceRow = Database["public"]["Tables"]["maintenance_records"]["Row"];

function evidenceLabel(kind: SolutionEvidence["kind"]): string {
  if (kind === "verified_fact") return "verified fact";
  if (kind === "evidence_backed_finding") return "evidence-backed";
  return "hypothesis";
}

function evidenceBadge(kind: SolutionEvidence["kind"]): "default" | "secondary" | "outline" {
  if (kind === "verified_fact") return "default";
  if (kind === "evidence_backed_finding") return "secondary";
  return "outline";
}

export function SolutionBuilderPanel({
  businessId,
  hasInvestigation,
}: {
  businessId: string;
  hasInvestigation: boolean;
}) {
  const qc = useQueryClient();
  const buildFn = useServerFn(buildSolutionRecommendationsFn);
  const generateFn = useServerFn(generateSolutionPromptsFn);
  const setStatusFn = useServerFn(setSolutionRecommendationStatusFn);
  const createMaintenanceFn = useServerFn(createMaintenanceRecordFn);
  const [building, setBuilding] = useState(false);
  const [buildingMsg, setBuildingMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generationErrors, setGenerationErrors] = useState<Record<string, string>>({});
  const [requestedOutcomes, setRequestedOutcomes] = useState<Record<string, string>>({});
  const [selectedPlatform, setSelectedPlatform] = useState<Record<string, PromptPlatform>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState<string | null>(null);

  const recommendations = useQuery({
    queryKey: ["solution-recommendations", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solution_recommendations")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecommendationRow[];
    },
  });

  const recommendationIds = (recommendations.data ?? []).map((row) => row.id);
  const prompts = useQuery({
    queryKey: ["solution-prompts", businessId, recommendationIds],
    enabled: recommendationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solution_prompts")
        .select("*")
        .in("recommendation_id", recommendationIds)
        .eq("status", "ready")
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PromptRow[];
    },
  });

  const maintenance = useQuery({
    queryKey: ["maintenance-records", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_records")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaintenanceRow[];
    },
  });

  const promptsByRecommendation = useMemo(() => {
    const map = new Map<string, PromptRow[]>();
    for (const prompt of prompts.data ?? []) {
      const rows = map.get(prompt.recommendation_id) ?? [];
      rows.push(prompt);
      map.set(prompt.recommendation_id, rows);
    }
    return map;
  }, [prompts.data]);

  const maintenanceByRecommendation = useMemo(() => {
    const map = new Map<string, MaintenanceRow>();
    for (const record of maintenance.data ?? []) {
      if (record.status === "cancelled") continue;
      if (record.recommendation_id) map.set(record.recommendation_id, record);
    }
    return map;
  }, [maintenance.data]);

  async function build() {
    setBuilding(true);
    setBuildingMsg(null);
    try {
      const result = await buildFn({ data: { businessId } });
      if (result.reason) setBuildingMsg(result.reason);
      else if (result.created === 0) setBuildingMsg("Recommendations are already up to date.");
      else setBuildingMsg(`Built ${result.created} solution recommendation(s).`);
      await qc.invalidateQueries({ queryKey: ["solution-recommendations", businessId] });
    } catch (error) {
      setBuildingMsg(error instanceof Error ? error.message : "Could not build recommendations.");
    }
    setBuilding(false);
  }

  async function generate(recommendation: RecommendationRow) {
    setGenerating(recommendation.id);
    setGenerationErrors((current) => {
      const next = { ...current };
      delete next[recommendation.id];
      return next;
    });
    try {
      const requestedOutcome = (requestedOutcomes[recommendation.id] ?? "").trim();
      const result = await generateFn({
        data: {
          recommendationId: recommendation.id,
          ...(requestedOutcome ? { requestedOutcome } : {}),
        },
      });
      const ready = result.prompts.filter((prompt) => prompt.status === "ready").length;
      await qc.invalidateQueries({ queryKey: ["solution-prompts", businessId] });
      await qc.invalidateQueries({ queryKey: ["solution-recommendations", businessId] });
      if (result.failures.length > 0) {
        setGenerationErrors((current) => ({
          ...current,
          [recommendation.id]: `${ready} prompt(s) ready. ${result.failures
            .map((failure) => `${PROMPT_PLATFORM_LABELS[failure.platform]}: ${failure.error}`)
            .join(" ")}`,
        }));
      } else {
        toast.success(
          `${ready} platform prompts generated as ${SOLUTION_INTENT_LABELS[result.intent]}.`,
        );
      }
    } catch (error) {
      setGenerationErrors((current) => ({
        ...current,
        [recommendation.id]: error instanceof Error ? error.message : "Prompt generation failed.",
      }));
    }
    setGenerating(null);
  }

  async function copyPrompt(id: string) {
    const row = (prompts.data ?? []).find((prompt) => prompt.id === id);
    if (!row) return;
    try {
      await navigator.clipboard.writeText(row.prompt);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1800);
    } catch {
      toast.error("Could not copy the prompt. Select the text manually.");
    }
  }

  async function setStatus(id: string, status: "recommended" | "accepted" | "dismissed") {
    try {
      await setStatusFn({ data: { recommendationId: id, status } });
      await qc.invalidateQueries({ queryKey: ["solution-recommendations", businessId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the recommendation.");
    }
  }

  async function createMaintenance(recommendationId: string) {
    setMaintenanceBusy(recommendationId);
    try {
      await createMaintenanceFn({ data: { recommendationId } });
      await qc.invalidateQueries({ queryKey: ["maintenance-records", businessId] });
      toast.success("Maintenance record created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the maintenance record.",
      );
    }
    setMaintenanceBusy(null);
  }

  const rows = recommendations.data ?? [];

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
          Solution builder
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={build}
          disabled={building || !hasInvestigation}
        >
          {building
            ? "Building…"
            : rows.length > 0
              ? "Refresh recommendations"
              : "Build recommendations"}
        </Button>
      </div>

      {!hasInvestigation && (
        <p className="text-sm text-muted-foreground">
          Run an investigation first. The solution builder only recommends work supported by
          recorded evidence.
        </p>
      )}
      {buildingMsg && <p className="text-sm text-muted-foreground">{buildingMsg}</p>}
      {recommendations.isError && (
        <p className="text-sm text-destructive">
          Could not load recommendations: {recommendations.error.message}
        </p>
      )}

      {hasInvestigation && rows.length === 0 && !building && (
        <p className="text-sm text-muted-foreground">
          No solution recommendations yet. Build them from this investigation to see what the
          evidence supports.
        </p>
      )}

      {rows.map((recommendation) => {
        const evidence = evidenceFrom(recommendation.evidence);
        const requirements = requirementsFrom(recommendation.requirements);
        const assumptions = stringList(recommendation.assumptions);
        const unknowns = stringList(recommendation.unknowns);
        const readyPrompts = latestPromptPerPlatform(
          promptsByRecommendation.get(recommendation.id) ?? [],
        );
        const activePlatform =
          selectedPlatform[recommendation.id] ?? readyPrompts[0]?.platform ?? PROMPT_PLATFORMS[0];
        const activePrompt =
          readyPrompts.find((prompt) => prompt.platform === activePlatform) ?? null;
        const maintenanceRecord = maintenanceByRecommendation.get(recommendation.id) ?? null;
        const generationError = generationErrors[recommendation.id];
        const quality = activePrompt ? qualityFrom(activePrompt.quality) : null;

        return (
          <article key={recommendation.id} className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="break-words font-semibold">{recommendation.title}</h4>
                  <Badge variant="outline">
                    {SOLUTION_TYPE_LABELS[recommendation.solution_type as SolutionType] ??
                      recommendation.solution_type}
                  </Badge>
                  <Badge variant="secondary">
                    Intent:{" "}
                    {SOLUTION_INTENT_LABELS[recommendation.intent as SolutionIntent] ??
                      recommendation.intent}
                  </Badge>
                  <Badge variant="outline">
                    {REQUESTED_DELIVERABLE_LABELS[
                      recommendation.requested_deliverable as RequestedDeliverable
                    ] ?? recommendation.requested_deliverable}
                  </Badge>
                  <Badge variant={recommendation.hypothesis ? "secondary" : "default"}>
                    {recommendation.hypothesis ? "hypothesis" : "evidence-backed"}
                  </Badge>
                  <Badge variant="outline" className="font-mono">
                    {Math.round(Number(recommendation.confidence) * 100)}% confidence
                  </Badge>
                  <Badge variant="outline">{recommendation.status}</Badge>
                </div>
                <p className="mt-1 text-sm">{recommendation.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Why: {recommendation.why_recommended}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {recommendation.status !== "accepted" && (
                  <Button size="sm" onClick={() => setStatus(recommendation.id, "accepted")}>
                    Accept
                  </Button>
                )}
                {recommendation.status !== "dismissed" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus(recommendation.id, "dismissed")}
                  >
                    Dismiss
                  </Button>
                )}
                {recommendation.status !== "recommended" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus(recommendation.id, "recommended")}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Verified facts and evidence
              </p>
              <ul className="space-y-1.5">
                {evidence.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="rounded border p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={evidenceBadge(item.kind)}>{evidenceLabel(item.kind)}</Badge>
                      <span className="font-medium">{item.label}</span>
                      <span className="font-mono text-muted-foreground">{item.source}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <details className="rounded border p-2 text-sm">
              <summary className="cursor-pointer font-medium">
                Assumptions and missing information ({assumptions.length + unknowns.length})
              </summary>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Assumptions
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {assumptions.length === 0 ? (
                      <li>None recorded.</li>
                    ) : (
                      assumptions.map((item) => <li key={item}>{item}</li>)
                    )}
                  </ul>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Missing information
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {unknowns.length === 0 ? (
                      <li>None recorded.</li>
                    ) : (
                      unknowns.map((item) => <li key={item}>{item}</li>)
                    )}
                  </ul>
                </div>
              </div>
            </details>

            <details className="rounded border p-2 text-sm">
              <summary className="cursor-pointer font-medium">
                Implementation requirements (
                {requirements.reduce((n, group) => n + group.items.length, 0)})
              </summary>
              <div className="mt-2 space-y-3">
                {requirements.map((group) => (
                  <div key={group.key}>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </p>
                    <ul className="mt-1 space-y-2">
                      {group.items.map((item) => (
                        <li key={item.requirement} className="rounded border p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={item.priority === "must" ? "default" : "secondary"}>
                              {item.priority}
                            </Badge>
                            <span>{item.requirement}</span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{item.rationale}</p>
                          {item.acceptance_criteria.length > 0 && (
                            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                              {item.acceptance_criteria.map((criterion) => (
                                <li key={criterion}>{criterion}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>

            <div className="rounded border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  Copy-ready prompts
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generate(recommendation)}
                  disabled={generating === recommendation.id}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  {generating === recommendation.id
                    ? "Generating…"
                    : readyPrompts.length > 0
                      ? "Regenerate all"
                      : "Generate prompts"}
                </Button>
                {generationError && (
                  <span className="text-xs text-destructive">{generationError}</span>
                )}
              </div>
              <div className="mt-2 space-y-1">
                <label
                  className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
                  htmlFor={`client-request-${recommendation.id}`}
                >
                  Client request (optional)
                </label>
                <Textarea
                  id={`client-request-${recommendation.id}`}
                  value={requestedOutcomes[recommendation.id] ?? ""}
                  onChange={(event) =>
                    setRequestedOutcomes((current) => ({
                      ...current,
                      [recommendation.id]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="e.g. Build a customer-facing website demo for this construction materials supplier."
                  className="text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the recommendation. The request is classified before
                  generation; ambiguous requests are rejected rather than turned into the wrong
                  product.
                </p>
              </div>
              {readyPrompts.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only prompts that pass validation are shown. Prompts are assembled from verified
                  evidence with platform templates for OpenCode, Lovable, Google AI Studio and a
                  developer specification, so no AI provider credits are used.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PROMPT_PLATFORMS.map((platform) => {
                      const exists = readyPrompts.some((prompt) => prompt.platform === platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() =>
                            setSelectedPlatform((current) => ({
                              ...current,
                              [recommendation.id]: platform,
                            }))
                          }
                          className={`rounded border px-2 py-1 text-xs ${
                            activePlatform === platform
                              ? "border-primary bg-primary/10 text-primary"
                              : exists
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {PROMPT_PLATFORM_LABELS[platform]}
                          {exists ? "" : " · missing"}
                        </button>
                      );
                    })}
                  </div>
                  {activePrompt ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">v{activePrompt.version}</span>
                        <span>{activePrompt.provider ?? "AI"}</span>
                        {activePrompt.model && (
                          <span className="font-mono">{activePrompt.model}</span>
                        )}
                        <span>{new Date(activePrompt.created_at).toLocaleString()}</span>
                        {quality && (
                          <Badge variant={quality.pass ? "secondary" : "destructive"}>
                            quality {quality.score}/100 · {quality.pass ? "passed" : "failed"}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => void copyPrompt(activePrompt.id)}
                        >
                          {copied === activePrompt.id ? (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <Copy className="mr-1 h-3.5 w-3.5" />
                          )}
                          {copied === activePrompt.id ? "Copied" : "Copy prompt"}
                        </Button>
                      </div>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                        {activePrompt.prompt}
                      </pre>
                      {quality && quality.checks.some((check) => check.status !== "pass") && (
                        <ul className="space-y-1 text-xs">
                          {quality.checks
                            .filter((check) => check.status !== "pass")
                            .map((check) => (
                              <li
                                key={check.key}
                                className={
                                  check.status === "fail"
                                    ? "text-destructive"
                                    : "text-amber-600 dark:text-amber-400"
                                }
                              >
                                {check.label}: {check.detail}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      This platform did not produce a validated prompt. Regenerate to try again;
                      previous validated prompts are preserved.
                    </p>
                  )}
                </>
              )}
            </div>

            {recommendation.solution_type === "maintenance" && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-primary/40 p-3 text-sm">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="font-medium">Maintenance workspace</span>
                {maintenanceRecord ? (
                  <>
                    <Badge variant="outline">
                      {MAINTENANCE_STATUS_LABELS[maintenanceRecord.status as MaintenanceStatus] ??
                        maintenanceRecord.status}
                    </Badge>
                    <Link to="/maintenance" className="text-xs text-primary underline">
                      Open maintenance records
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">
                      No real maintenance record exists yet. Create one, then set its cadence and
                      next due date in the Maintenance workspace before promising ongoing work.
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void createMaintenance(recommendation.id)}
                      disabled={maintenanceBusy === recommendation.id}
                    >
                      {maintenanceBusy === recommendation.id
                        ? "Creating…"
                        : "Create maintenance record"}
                    </Button>
                  </>
                )}
              </div>
            )}

            {recommendation.solution_type !== "maintenance" &&
              recommendation.maintenance_required && (
                <p className="text-xs text-muted-foreground">
                  Ongoing maintenance may be relevant, but GARE will only link a real maintenance
                  record from a maintenance recommendation.
                </p>
              )}
          </article>
        );
      })}
    </section>
  );
}
