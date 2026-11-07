import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  buildSolutionRecommendations,
  canTransitionMaintenance,
  classifySolutionRequest,
  maintenanceCompletionError,
  REQUESTED_DELIVERABLES,
  SOLUTION_INTENTS,
  validatePromptQuality,
  type MaintenanceStatus,
  type PromptPlatform,
  type PromptQuality,
  type RequestedDeliverable,
  type SolutionBusiness,
  type SolutionEvidence,
  type SolutionFindings,
  type SolutionIntent,
  type SolutionOpportunity,
  type SolutionRecommendationDraft,
  type SolutionReport,
  type SolutionRequirementGroup,
  type SolutionType,
} from "./solution-builder";
import { buildSolutionPromptSet } from "./solution-prompts";

type Client = SupabaseClient<Database>;
type RecommendationRow = Database["public"]["Tables"]["solution_recommendations"]["Row"];
type MaintenanceRow = Database["public"]["Tables"]["maintenance_records"]["Row"];

function asJson(value: unknown): Json {
  return value as unknown as Json;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function evidenceFromJson(value: Json): SolutionEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const kind = row["kind"];
    if (kind !== "verified_fact" && kind !== "evidence_backed_finding" && kind !== "hypothesis")
      return [];
    if (typeof row["label"] !== "string" || typeof row["detail"] !== "string") return [];
    return [
      {
        kind,
        label: row["label"],
        detail: row["detail"],
        source: typeof row["source"] === "string" ? row["source"] : "unknown",
        observed_at: typeof row["observed_at"] === "string" ? row["observed_at"] : null,
        ref: typeof row["ref"] === "string" ? row["ref"] : null,
      },
    ];
  });
}

function requirementsFromJson(value: Json): SolutionRequirementGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const group = item as Record<string, unknown>;
    if (typeof group["key"] !== "string" || typeof group["label"] !== "string") return [];
    const items = Array.isArray(group["items"])
      ? group["items"].flatMap((raw) => {
          if (!raw || typeof raw !== "object") return [];
          const requirement = raw as Record<string, unknown>;
          if (
            typeof requirement["requirement"] !== "string" ||
            typeof requirement["rationale"] !== "string"
          )
            return [];
          const priority: "must" | "should" | "could" =
            requirement["priority"] === "must" || requirement["priority"] === "could"
              ? requirement["priority"]
              : "should";
          return [
            {
              requirement: requirement["requirement"],
              rationale: requirement["rationale"],
              priority,
              acceptance_criteria: stringArray(requirement["acceptance_criteria"]),
            },
          ];
        })
      : [];
    return [{ key: group["key"], label: group["label"], items }];
  });
}

function recommendationFromRow(row: RecommendationRow): SolutionRecommendationDraft {
  const solutionType = row.solution_type as SolutionType;
  const fallback = classifySolutionRequest({ solution_type: solutionType });
  const intent = (SOLUTION_INTENTS as readonly string[]).includes(row.intent)
    ? (row.intent as SolutionIntent)
    : fallback.intent;
  const requestedDeliverable = (REQUESTED_DELIVERABLES as readonly string[]).includes(
    row.requested_deliverable,
  )
    ? (row.requested_deliverable as RequestedDeliverable)
    : fallback.requested_deliverable;
  return {
    solution_type: solutionType,
    intent,
    requested_deliverable: requestedDeliverable,
    title: row.title,
    summary: row.summary,
    why_recommended: row.why_recommended,
    confidence: Number(row.confidence),
    hypothesis: row.hypothesis,
    evidence: evidenceFromJson(row.evidence),
    requirements: requirementsFromJson(row.requirements),
    assumptions: stringArray(row.assumptions),
    unknowns: stringArray(row.unknowns),
    maintenance_required: row.maintenance_required,
    dedupe_key: row.dedupe_key,
  };
}

export type GeneratedPrompt = {
  platform: PromptPlatform;
  prompt: string;
  quality: PromptQuality;
};

export function generatePlatformPrompts(args: {
  business: SolutionBusiness;
  recommendation: SolutionRecommendationDraft;
}): GeneratedPrompt[] {
  return buildSolutionPromptSet({
    business: args.business,
    recommendation: args.recommendation,
  }).map((item) => ({
    ...item,
    quality: validatePromptQuality(item.prompt, item.platform, args.recommendation),
  }));
}

export type BuildRecommendationsResult = {
  created: number;
  recommendationIds: string[];
  reason: string | null;
};

export async function buildRecommendationsForBusiness(
  supabase: Client,
  userId: string,
  businessId: string,
  requestedInvestigationId?: string,
): Promise<BuildRecommendationsResult> {
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (businessError || !business) throw new Error("Business not found");

  const investigationQuery = supabase
    .from("investigations")
    .select("*")
    .eq("business_id", businessId);
  const { data: investigation, error: investigationError } = await (
    requestedInvestigationId
      ? investigationQuery.eq("id", requestedInvestigationId)
      : investigationQuery
  )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (investigationError) throw new Error(investigationError.message);
  if (!investigation) {
    return {
      created: 0,
      reason: "Run an investigation first — solution recommendations require recorded evidence.",
      recommendationIds: [],
    };
  }

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("*")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const opportunityInput: SolutionOpportunity | null = opportunity
    ? {
        id: opportunity.id,
        title: opportunity.title,
        identified_problem: opportunity.identified_problem,
        relevant_service: opportunity.relevant_service,
        confidence: Number(opportunity.confidence),
        validation_status: opportunity.validation_status,
        qualification_stage: opportunity.qualification_stage,
        gaps: Array.isArray(opportunity.gaps)
          ? (opportunity.gaps as unknown as NonNullable<SolutionOpportunity["gaps"]>)
          : [],
      }
    : null;

  const recommendations = buildSolutionRecommendations({
    business: business as unknown as SolutionBusiness,
    findings: (investigation.findings ?? null) as SolutionFindings | null,
    report: (investigation.report ?? null) as SolutionReport | null,
    observedAt: investigation.created_at,
    investigationId: investigation.id,
    opportunity: opportunityInput,
  });
  if (recommendations.length === 0) {
    return {
      created: 0,
      recommendationIds: [],
      reason:
        business.business_status === "CLOSED_PERMANENTLY"
          ? "This business is marked permanently closed, so no solution is recommended."
          : "The recorded evidence does not support a specific solution yet. Add verified evidence or confirm the business workflow first.",
    };
  }

  const dedupeKeys = recommendations.map((item) => item.dedupe_key);
  const { data: existing } = await supabase
    .from("solution_recommendations")
    .select("id,dedupe_key")
    .eq("business_id", businessId)
    .in("dedupe_key", dedupeKeys);
  const existingByKey = new Map((existing ?? []).map((row) => [row.dedupe_key, row.id]));
  const missing = recommendations.filter((item) => !existingByKey.has(item.dedupe_key));

  if (missing.length > 0) {
    const { data: inserted, error } = await supabase
      .from("solution_recommendations")
      .insert(
        missing.map((item) => ({
          owner_id: userId,
          business_id: businessId,
          investigation_id: investigation.id,
          opportunity_id: opportunity?.id ?? null,
          solution_type: item.solution_type,
          intent: item.intent,
          requested_deliverable: item.requested_deliverable,
          title: item.title,
          summary: item.summary,
          why_recommended: item.why_recommended,
          confidence: item.confidence,
          hypothesis: item.hypothesis,
          evidence: asJson(item.evidence),
          requirements: asJson(item.requirements),
          assumptions: asJson(item.assumptions),
          unknowns: asJson(item.unknowns),
          maintenance_required: item.maintenance_required,
          dedupe_key: item.dedupe_key,
          source: "investigation",
          status: "recommended",
        })),
      )
      .select("id,dedupe_key");
    if (error) throw new Error(error.message);
    for (const row of inserted ?? []) existingByKey.set(row.dedupe_key, row.id);
  }

  return {
    created: missing.length,
    recommendationIds: dedupeKeys.flatMap((key) => {
      const id = existingByKey.get(key);
      return id ? [id] : [];
    }),
    reason: null,
  };
}

export type GeneratePromptResult = {
  intent: SolutionIntent;
  requested_deliverable: RequestedDeliverable;
  prompts: {
    id: string;
    platform: PromptPlatform;
    version: number;
    status: string;
    quality: PromptQuality | null;
  }[];
  failures: { platform: PromptPlatform; error: string }[];
  model: string;
};

export async function generatePromptSet(
  supabase: Client,
  userId: string,
  recommendationId: string,
  options: { requestedOutcome?: string | null | undefined } = {},
): Promise<GeneratePromptResult> {
  const { data: recommendation, error: recommendationError } = await supabase
    .from("solution_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .single();
  if (recommendationError || !recommendation) throw new Error("Solution recommendation not found");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", recommendation.business_id)
    .single();
  if (!business) throw new Error("Business not found");

  const businessInput = business as unknown as SolutionBusiness;
  const classification = classifySolutionRequest({
    solution_type: recommendation.solution_type as SolutionType,
    requested_outcome: options.requestedOutcome,
    has_website: Boolean(businessInput.website?.trim()),
  });
  if (classification.ambiguous) {
    throw new Error(
      classification.clarification ??
        "Please clarify the exact requested outcome before generating prompts.",
    );
  }

  if (
    recommendation.intent !== classification.intent ||
    recommendation.requested_deliverable !== classification.requested_deliverable
  ) {
    const { error } = await supabase
      .from("solution_recommendations")
      .update({
        intent: classification.intent,
        requested_deliverable: classification.requested_deliverable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recommendationId);
    if (error) throw new Error(error.message);
  }

  const draft: SolutionRecommendationDraft = {
    ...recommendationFromRow(recommendation),
    intent: classification.intent,
    requested_deliverable: classification.requested_deliverable,
  };
  if (draft.evidence.length === 0) {
    throw new Error("This recommendation has no evidence to build a prompt from.");
  }

  const generated = generatePlatformPrompts({
    business: businessInput,
    recommendation: draft,
  });
  const failures: GeneratePromptResult["failures"] = [];
  for (const item of generated) {
    const failedChecks = item.quality.checks.filter((check) => check.status === "fail");
    if (!item.quality.pass) {
      failures.push({
        platform: item.platform,
        error: `Quality validation failed: ${failedChecks.map((check) => check.detail).join(" ")}`,
      });
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Prompt validation failed. No prompt version was saved. ${failures
        .map((failure) => `${failure.platform}: ${failure.error}`)
        .join(" ")}`,
    );
  }

  const { data: existing } = await supabase
    .from("solution_prompts")
    .select("platform,version")
    .eq("recommendation_id", recommendationId);
  const nextVersion = new Map<string, number>();
  for (const row of existing ?? []) {
    nextVersion.set(row.platform, Math.max(nextVersion.get(row.platform) ?? 0, row.version + 1));
  }

  const rows = generated.map((item) => ({
    owner_id: userId,
    recommendation_id: recommendationId,
    platform: item.platform,
    prompt: item.prompt,
    version: nextVersion.get(item.platform) ?? 1,
    status: "ready",
    quality: asJson(item.quality),
    provider: "template",
    model: "solution-prompt-v2",
    evidence_refs: asJson(
      draft.evidence.map((evidence) => ({
        kind: evidence.kind,
        label: evidence.label,
        source: evidence.source,
        ref: evidence.ref,
        observed_at: evidence.observed_at,
      })),
    ),
    error: null,
  }));

  const { data: inserted, error } = await supabase
    .from("solution_prompts")
    .insert(rows)
    .select("id,platform,version,status,quality");
  if (error) throw new Error(error.message);

  return {
    intent: classification.intent,
    requested_deliverable: classification.requested_deliverable,
    prompts: (inserted ?? []).map((row) => ({
      id: row.id,
      platform: row.platform as PromptPlatform,
      version: row.version,
      status: row.status,
      quality: (row.quality ?? null) as PromptQuality | null,
    })),
    failures,
    model: "solution-prompt-v2",
  };
}

export async function updateRecommendationStatus(
  supabase: Client,
  recommendationId: string,
  status: "accepted" | "dismissed" | "recommended",
): Promise<void> {
  const { error } = await supabase
    .from("solution_recommendations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", recommendationId);
  if (error) throw new Error(error.message);
}

export async function createMaintenanceRecord(
  supabase: Client,
  userId: string,
  recommendationId: string,
): Promise<MaintenanceRow> {
  const { data: recommendation, error } = await supabase
    .from("solution_recommendations")
    .select("*")
    .eq("id", recommendationId)
    .single();
  if (error || !recommendation) throw new Error("Solution recommendation not found");
  if (recommendation.solution_type !== "maintenance") {
    throw new Error("Only a maintenance recommendation can create a maintenance record.");
  }

  const { data: existing } = await supabase
    .from("maintenance_records")
    .select("*")
    .eq("recommendation_id", recommendationId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data, error: insertError } = await supabase
    .from("maintenance_records")
    .insert({
      owner_id: userId,
      business_id: recommendation.business_id,
      recommendation_id: recommendation.id,
      title: recommendation.title,
      description: recommendation.summary,
      status: "recommended",
      source: "solution_builder",
    })
    .select("*")
    .single();
  if (insertError || !data)
    throw new Error(insertError?.message ?? "Maintenance record not created");
  return data;
}

export async function updateMaintenanceStatus(
  supabase: Client,
  recordId: string,
  status: MaintenanceStatus,
  completionNote?: string | null,
): Promise<void> {
  const { data: record, error } = await supabase
    .from("maintenance_records")
    .select("*")
    .eq("id", recordId)
    .single();
  if (error || !record) throw new Error("Maintenance record not found");
  const current = record.status as MaintenanceStatus;
  if (!canTransitionMaintenance(current, status)) {
    throw new Error(`Cannot move maintenance from ${current} to ${status}.`);
  }
  const completionError = maintenanceCompletionError(status, completionNote);
  if (completionError) throw new Error(completionError);
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("maintenance_records")
    .update({
      status,
      completed_at: status === "completed" ? now : null,
      completion_note:
        status === "completed" ? (completionNote ?? "").trim() : record.completion_note,
      updated_at: now,
    })
    .eq("id", recordId);
  if (updateError) throw new Error(updateError.message);
}

export async function updateMaintenanceDetails(
  supabase: Client,
  recordId: string,
  details: { cadence: string | null; nextDueAt: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("maintenance_records")
    .update({
      cadence: details.cadence,
      next_due_at: details.nextDueAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);
  if (error) throw new Error(error.message);
}
