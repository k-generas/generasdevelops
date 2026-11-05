import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { runBusinessAudit } from "./business-audit";
import {
  allowedStageTransitions,
  buildOpportunity,
  canMoveStage,
  gapsFromAuditEvidence,
  isTerminalStage,
  mergeGaps,
  stageRequiresConfirmedProblem,
  summarizeOpportunities,
  type OpportunityBuildInput,
  type OpportunityGap,
  type OpportunitySolutionFit,
  type OpportunitySourceStatus,
  type OpportunitySummary,
} from "./opportunity-engine";
import { probeWebsite } from "./investigate.server";
import { createProposal } from "./proposals.server";
import { verifyWebsite } from "./website-finder.server";

type Client = SupabaseClient<Database>;
type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];
type OpportunityInsert = Database["public"]["Tables"]["opportunities"]["Insert"];
type OpportunityUpdate = Database["public"]["Tables"]["opportunities"]["Update"];
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type SocialLeadRow = Database["public"]["Tables"]["social_leads"]["Row"];
type SocialMatchRow = Database["public"]["Tables"]["social_business_matches"]["Row"];
type ProposalChannel = "Email" | "WhatsApp" | "SMS";
type AiProvider = "auto" | "openai" | "gemini" | "lovable";

const STAGES = [
  "DISCOVERED",
  "RESEARCHING",
  "NEEDS_VALIDATION",
  "VALIDATION_IN_PROGRESS",
  "QUALIFIED",
  "READY_TO_PROPOSE",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "DISQUALIFIED",
] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const SOURCES = ["social_match", "business_audit", "manual", "signal"] as const;
const VALIDATION_STATUSES = ["UNKNOWN", "CONFIRMED", "DENIED", "PARTIAL"] as const;
const SOURCE_STATUSES = [
  "confirmed",
  "high_confidence",
  "possible",
  "conflicting",
  "manual",
] as const;

export type OpportunityLeadSummary = {
  id: string;
  handle: string;
  platform: string;
  profile_url: string;
  display_name: string | null;
  account_type: string;
  district: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
};

export type OpportunityView = OpportunityRow & {
  business_name: string;
  business_district: string | null;
  business_website: string | null;
  business_phone: string | null;
  social_lead: OpportunityLeadSummary | null;
};

export type OpportunityListResult = {
  rows: OpportunityView[];
  summary: OpportunitySummary;
  tableReady: boolean;
  tableError: string | null;
  generatedAt: string | null;
};

export type GenerateOpportunitiesResult = {
  matchesScanned: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  requestCostUsd: 0;
};

export type RefreshOpportunityResult = {
  ok: boolean;
  auditRun: boolean;
  gaps: number;
  message: string;
  opportunity: OpportunityRow | null;
};

export type OpportunityOutreachInput = {
  id: string;
  channel: ProposalChannel;
  at?: string;
  response?: boolean;
  note?: string;
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(error?.message ?? ""),
  );
}

function asObject(value: Json): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : null;
}

function asGaps(value: Json): OpportunityGap[] {
  if (!Array.isArray(value)) return [];
  const out: OpportunityGap[] = [];
  for (const item of value) {
    const row = asObject(item);
    if (!row) continue;
    const key = row["key"];
    const category = row["category"];
    const label = row["label"];
    const evidence = row["evidence"];
    const source = row["source"];
    const status = row["verification_status"];
    const confidence = row["confidence"];
    const checked = row["last_checked_at"];
    if (
      typeof key !== "string" ||
      typeof category !== "string" ||
      typeof label !== "string" ||
      typeof evidence !== "string" ||
      typeof source !== "string" ||
      typeof status !== "string" ||
      typeof confidence !== "number" ||
      typeof checked !== "string"
    ) {
      continue;
    }
    out.push({
      key,
      category,
      label,
      evidence,
      source,
      verification_status: status as OpportunityGap["verification_status"],
      confidence,
      last_checked_at: checked,
    });
  }
  return out;
}

function asSolutionFits(value: Json): OpportunitySolutionFit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asObject(item);
    if (!row) return [];
    const solution = row["solution"];
    const gapKeys = row["gap_keys"];
    const why = row["why"];
    const confidence = row["confidence"];
    if (
      typeof solution !== "string" ||
      !Array.isArray(gapKeys) ||
      typeof why !== "string" ||
      typeof confidence !== "number"
    ) {
      return [];
    }
    return [
      {
        solution: solution as OpportunitySolutionFit["solution"],
        gap_keys: gapKeys.filter((key): key is string => typeof key === "string"),
        why,
        confidence,
        hypothesis: row["hypothesis"] === true,
        uncertainties: Array.isArray(row["uncertainties"])
          ? row["uncertainties"].filter((x): x is string => typeof x === "string")
          : [],
      },
    ];
  });
}

function sourceStatus(value: string | null): OpportunitySourceStatus {
  return SOURCE_STATUSES.includes(value as (typeof SOURCE_STATUSES)[number])
    ? (value as OpportunitySourceStatus)
    : "manual";
}

function businessHasContact(business: BusinessRow, lead: SocialLeadRow | null): boolean {
  return Boolean(
    business.phone ||
    business.emails?.length ||
    business.cell ||
    lead?.contact_phone ||
    lead?.contact_whatsapp,
  );
}

function leadSummary(lead: SocialLeadRow | undefined): OpportunityLeadSummary | null {
  if (!lead) return null;
  return {
    id: lead.id,
    handle: lead.handle,
    platform: lead.platform,
    profile_url: lead.profile_url,
    display_name: lead.display_name,
    account_type: lead.account_type,
    district: lead.district,
    contact_phone: lead.contact_phone,
    contact_whatsapp: lead.contact_whatsapp,
  };
}

async function loadOpportunity(
  supabase: Client,
  ownerId: string,
  id: string,
): Promise<OpportunityRow> {
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Opportunity not found or not accessible to this account.");
  return data;
}

function buildInput(
  opportunity: OpportunityRow,
  business: BusinessRow,
  lead: SocialLeadRow | null,
  gaps: OpportunityGap[],
  fits: OpportunitySolutionFit[],
): OpportunityBuildInput {
  return {
    source: SOURCES.includes(opportunity.source as (typeof SOURCES)[number])
      ? (opportunity.source as OpportunityBuildInput["source"])
      : "manual",
    social_lead_id: opportunity.social_lead_id,
    social_match_id: opportunity.social_match_id,
    business_id: business.id,
    business_name: business.name,
    business_category: business.category,
    business_district: business.district,
    business_website: business.website,
    business_phone: business.phone,
    lead_handle: lead?.handle ?? null,
    lead_platform: lead?.platform ?? null,
    lead_profile_url: lead?.profile_url ?? null,
    lead_district: lead?.district ?? null,
    account_type: lead?.account_type ?? null,
    source_status: sourceStatus(opportunity.source_status),
    source_confidence: opportunity.source_confidence ?? opportunity.confidence,
    match_reason: null,
    gaps,
    solution_fits: fits,
    observed_at: new Date().toISOString(),
    has_contact: businessHasContact(business, lead),
    is_target_location: Boolean(business.district),
  };
}

const listInput = z
  .object({
    stage: z.enum(STAGES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    source: z.enum(SOURCES).optional(),
    needsValidation: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional().default(300),
  })
  .optional();

export const getOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listInput.parse(data))
  .handler(async ({ data, context }): Promise<OpportunityListResult> => {
    const { data: rows, error } = await context.supabase
      .from("opportunities")
      .select("*")
      .eq("owner_id", context.userId)
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) {
      if (isMissingTable(error)) {
        return {
          rows: [],
          summary: summarizeOpportunities([]),
          tableReady: false,
          tableError: error.message,
          generatedAt: null,
        };
      }
      throw new Error(error.message);
    }

    const all = rows ?? [];
    const summary = summarizeOpportunities(all);
    const filtered = all.filter((row) => {
      if (data?.stage && row.qualification_stage !== data.stage) return false;
      if (data?.priority && row.priority !== data.priority) return false;
      if (data?.source && row["source"] !== data.source) return false;
      if (data?.needsValidation && row.validation_status === "CONFIRMED") return false;
      return true;
    });
    const sliced = filtered.slice(0, data?.limit ?? 300);

    const businessIds = [...new Set(sliced.map((row) => row.business_id))];
    const leadIds = [
      ...new Set(sliced.map((row) => row.social_lead_id).filter((id): id is string => !!id)),
    ];
    const [businessesResult, leadsResult] = await Promise.all([
      businessIds.length
        ? context.supabase
            .from("businesses")
            .select("id,name,district,website,phone")
            .in("id", businessIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? context.supabase.from("social_leads").select("*").in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (businessesResult.error) throw new Error(businessesResult.error.message);
    if (leadsResult.error) throw new Error(leadsResult.error.message);
    const businessById = new Map((businessesResult.data ?? []).map((row) => [row.id, row]));
    const leadById = new Map((leadsResult.data ?? []).map((row) => [row.id, row]));

    const views: OpportunityView[] = sliced.flatMap((row) => {
      const business = businessById.get(row.business_id);
      if (!business) return [];
      return [
        {
          ...row,
          business_name: business.name,
          business_district: business.district,
          business_website: business.website,
          business_phone: business.phone,
          social_lead: leadSummary(
            row.social_lead_id ? leadById.get(row.social_lead_id) : undefined,
          ),
        },
      ];
    });
    const generatedAt =
      all.map((row) => row.updated_at).sort((a, b) => b.localeCompare(a))[0] ?? null;

    return {
      rows: views,
      summary,
      tableReady: true,
      tableError: null,
      generatedAt,
    };
  });

export const generateSocialOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GenerateOpportunitiesResult> => {
    const result: GenerateOpportunitiesResult = {
      matchesScanned: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      requestCostUsd: 0,
    };
    const { data: matches, error } = await context.supabase
      .from("social_business_matches")
      .select("*")
      .eq("owner_id", context.userId)
      .in("status", ["confirmed", "high_confidence"])
      .order("confidence", { ascending: false })
      .limit(1000);
    if (error) {
      if (isMissingTable(error)) {
        throw new Error(
          "Social matching is not set up yet. Apply the Phase 1 social business matches migration first.",
        );
      }
      throw new Error(error.message);
    }
    if (!matches?.length) {
      return {
        ...result,
        errors: ["No confirmed or high-confidence social matches to generate from."],
      };
    }

    const leadIds = [...new Set(matches.map((row) => row.social_lead_id))];
    const businessIds = [...new Set(matches.map((row) => row.business_id))];
    const [leadsResult, businessesResult, existingResult] = await Promise.all([
      context.supabase.from("social_leads").select("*").in("id", leadIds),
      context.supabase.from("businesses").select("*").in("id", businessIds),
      context.supabase
        .from("opportunities")
        .select("*")
        .eq("owner_id", context.userId)
        .eq("source", "social_match")
        .limit(2000),
    ]);
    if (leadsResult.error) throw new Error(leadsResult.error.message);
    if (businessesResult.error) throw new Error(businessesResult.error.message);
    if (existingResult.error) {
      if (isMissingTable(existingResult.error)) {
        throw new Error(
          "Opportunities are not set up yet. Apply the opportunities engine migration.",
        );
      }
      throw new Error(existingResult.error.message);
    }
    const leadById = new Map((leadsResult.data ?? []).map((row) => [row.id, row]));
    const businessById = new Map((businessesResult.data ?? []).map((row) => [row.id, row]));
    const existingByKey = new Map(
      (existingResult.data ?? [])
        .filter((row) => row.dedupe_key)
        .map((row) => [row.dedupe_key!, row]),
    );
    const now = new Date().toISOString();

    for (const match of matches) {
      result.matchesScanned += 1;
      const lead = leadById.get(match.social_lead_id);
      const business = businessById.get(match.business_id);
      if (!lead || !business) {
        result.skipped += 1;
        continue;
      }
      const gaps = asGaps(match.opportunity_gaps);
      if (gaps.length === 0) {
        result.skipped += 1;
        continue;
      }
      const draft = buildOpportunity({
        source: "social_match",
        social_lead_id: lead.id,
        social_match_id: match.id,
        business_id: business.id,
        business_name: business.name,
        business_category: business.category,
        business_district: business.district,
        business_website: business.website,
        business_phone: business.phone,
        lead_handle: lead.handle,
        lead_platform: lead.platform,
        lead_profile_url: lead.profile_url,
        lead_district: lead.district,
        account_type: lead.account_type,
        source_status: sourceStatus(match.status),
        source_confidence: match.confidence,
        match_reason: match.reason,
        gaps,
        solution_fits: asSolutionFits(match.solution_fits),
        observed_at: now,
        has_contact: businessHasContact(business, lead),
        is_target_location: Boolean(business.district),
      });
      if (!draft) {
        result.skipped += 1;
        continue;
      }

      const existing = existingByKey.get(draft.dedupe_key);
      const fields: OpportunityUpdate = {
        title: draft.title,
        identified_problem: draft.identified_problem,
        evidence: draft.gaps as unknown as Json,
        potential_solution: draft.potential_solution,
        relevant_service: draft.relevant_service,
        confidence: draft.confidence,
        urgency: draft.priority,
        priority: draft.priority,
        score: draft.score,
        score_factors: draft.score_factors as unknown as Json,
        score_reasons: draft.score_reasons as unknown as Json,
        gaps: draft.gaps as unknown as Json,
        solution_fits: draft.solution_fits as unknown as Json,
        solution_details: draft.solution_details as unknown as Json,
        estimated_effort: draft.estimated_effort,
        recurring: draft.recurring,
        source_status: draft.source_status,
        source_confidence: draft.source_confidence,
        next_action: draft.next_action,
        validation_questions: draft.questionnaire as unknown as Json,
        last_verified_at: draft.last_verified_at,
        updated_at: now,
      };

      if (existing) {
        const { error: updateError } = await context.supabase
          .from("opportunities")
          .update(fields)
          .eq("id", existing.id)
          .eq("owner_id", context.userId);
        if (updateError) {
          result.errors.push(`${business.name}: ${updateError.message}`);
        } else {
          result.updated += 1;
        }
        continue;
      }

      const insert: OpportunityInsert = {
        owner_id: context.userId,
        business_id: business.id,
        social_lead_id: lead.id,
        social_match_id: match.id,
        source: "social_match",
        source_status: draft.source_status,
        source_confidence: draft.source_confidence,
        title: draft.title,
        identified_problem: draft.identified_problem,
        evidence: draft.gaps as unknown as Json,
        potential_solution: draft.potential_solution,
        relevant_service: draft.relevant_service,
        confidence: draft.confidence,
        urgency: draft.priority,
        priority: draft.priority,
        score: draft.score,
        score_factors: draft.score_factors as unknown as Json,
        score_reasons: draft.score_reasons as unknown as Json,
        gaps: draft.gaps as unknown as Json,
        solution_fits: draft.solution_fits as unknown as Json,
        solution_details: draft.solution_details as unknown as Json,
        estimated_effort: draft.estimated_effort,
        recurring: draft.recurring,
        validation_questions: draft.questionnaire as unknown as Json,
        qualification_stage: "DISCOVERED",
        validation_status: "UNKNOWN",
        dedupe_key: draft.dedupe_key,
        next_action: draft.next_action,
        last_verified_at: draft.last_verified_at,
        created_at: now,
        updated_at: now,
      };
      const { error: insertError } = await context.supabase.from("opportunities").insert(insert);
      if (insertError) {
        result.errors.push(`${business.name}: ${insertError.message}`);
      } else {
        result.created += 1;
      }
    }

    return result;
  });

const refreshInput = z.object({
  id: z.string().uuid(),
  runAudit: z.boolean().optional().default(true),
});

export const refreshOpportunityEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => refreshInput.parse(data))
  .handler(async ({ data, context }): Promise<RefreshOpportunityResult> => {
    const opportunity = await loadOpportunity(context.supabase, context.userId, data.id);
    const { data: business, error: businessError } = await context.supabase
      .from("businesses")
      .select("*")
      .eq("id", opportunity.business_id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (businessError) throw new Error(businessError.message);
    if (!business) throw new Error("Business not found.");

    let lead: SocialLeadRow | null = null;
    if (opportunity.social_lead_id) {
      const { data: leadRow, error: leadError } = await context.supabase
        .from("social_leads")
        .select("*")
        .eq("id", opportunity.social_lead_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (leadError) throw new Error(leadError.message);
      lead = leadRow ?? null;
    }

    let auditId: string | null = null;
    let auditGaps: OpportunityGap[] = [];
    let auditRun = false;
    if (data.runAudit) {
      const check = await verifyWebsite({
        place_id: business.place_id,
        name: business.name,
        address: business.address,
        website: business.website,
        aliases: [business.legal_name, ...(business.trading_names ?? [])],
      });
      const website = check.website ?? business.website;
      const site = await probeWebsite(website);
      const findings = {
        url: site.url,
        reachable: site.reachable,
        status: site.status,
        https: site.https,
        load_ms: site.load_ms,
        has_viewport_meta: site.has_viewport_meta,
        has_contact_form: site.has_contact_form,
        has_email_link: site.has_email_link,
        has_whatsapp_link: site.has_whatsapp_link,
        has_online_booking_or_shop: site.has_online_booking_or_shop,
        copyright_year: site.copyright_year,
      };
      const audit = runBusinessAudit({
        businessId: business.id,
        business: { ...business, website } as never,
        findings: findings as never,
        websiteCheck: check,
        observedAt: new Date().toISOString(),
      });
      const { data: savedAudit, error: auditError } = await context.supabase
        .from("business_audits")
        .insert({
          owner_id: context.userId,
          business_id: business.id,
          status: audit.evidence_log.some((item) => item.severity === "CRITICAL")
            ? "partial"
            : "completed",
          findings_json: audit as unknown as Json,
          evidence_log_json: audit.evidence_log as unknown as Json,
          summary_json: audit.summary as unknown as Json,
          score_0_100: audit.summary.overall_score,
          completed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (auditError) throw new Error(auditError.message);
      auditId = savedAudit.id;
      auditRun = true;
      auditGaps = gapsFromAuditEvidence(audit.evidence_log);
      await context.supabase.from("business_activity_events").insert({
        owner_id: context.userId,
        business_id: business.id,
        event_type: "audited",
        summary: `Opportunity evidence refresh audit completed (score ${audit.summary.overall_score})`,
        ref_table: "business_audits",
        ref_id: savedAudit.id,
      });
    }

    const gaps = mergeGaps(asGaps(opportunity.gaps), auditGaps);
    const draft = buildOpportunity(
      buildInput(opportunity, business, lead, gaps, asSolutionFits(opportunity.solution_fits)),
    );
    if (!draft) {
      return {
        ok: false,
        auditRun,
        gaps: gaps.length,
        message: "No usable evidence to score. Confirm the website or social evidence first.",
        opportunity,
      };
    }

    const { data: updated, error: updateError } = await context.supabase
      .from("opportunities")
      .update({
        title: draft.title,
        identified_problem: draft.identified_problem,
        evidence: draft.gaps as unknown as Json,
        potential_solution: draft.potential_solution,
        relevant_service: draft.relevant_service,
        confidence: draft.confidence,
        urgency: draft.priority,
        priority: draft.priority,
        score: draft.score,
        score_factors: draft.score_factors as unknown as Json,
        score_reasons: draft.score_reasons as unknown as Json,
        gaps: draft.gaps as unknown as Json,
        solution_fits: draft.solution_fits as unknown as Json,
        solution_details: draft.solution_details as unknown as Json,
        estimated_effort: draft.estimated_effort,
        recurring: draft.recurring,
        next_action: draft.next_action,
        validation_questions: draft.questionnaire as unknown as Json,
        last_verified_at: draft.last_verified_at,
        audit_id: auditId ?? opportunity.audit_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunity.id)
      .eq("owner_id", context.userId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    return {
      ok: true,
      auditRun,
      gaps: gaps.length,
      message: auditRun
        ? `Evidence refreshed and audit saved. ${gaps.length} gap(s) recorded.`
        : "Evidence re-scored without a new audit.",
      opportunity: updated,
    };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  validationStatus: z.enum(VALIDATION_STATUSES).optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  ownerNotes: z.string().trim().max(4000).nullable().optional(),
});

export const updateOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateInput.parse(data))
  .handler(async ({ data, context }): Promise<OpportunityRow> => {
    const current = await loadOpportunity(context.supabase, context.userId, data.id);
    const stage = data.stage ?? (current.qualification_stage as (typeof STAGES)[number]);
    const validationStatus = data.validationStatus ?? current.validation_status;
    if (!canMoveStage(current.qualification_stage as (typeof STAGES)[number], stage)) {
      const allowed = allowedStageTransitions(
        current.qualification_stage as (typeof STAGES)[number],
      ).join(", ");
      throw new Error(
        `Cannot move from ${current.qualification_stage} to ${stage}. Allowed next stages: ${allowed}.`,
      );
    }
    if (stageRequiresConfirmedProblem(stage) && validationStatus !== "CONFIRMED") {
      throw new Error(
        "The business must confirm the problem before this opportunity can be qualified or proposed.",
      );
    }
    if (data.validationStatus === "CONFIRMED" && stage === "DISCOVERED") {
      throw new Error("Move the opportunity into validation before confirming the problem.");
    }

    const patch: OpportunityUpdate = {
      qualification_stage: stage,
      validation_status: validationStatus,
      updated_at: new Date().toISOString(),
    };
    if (data.note !== undefined) {
      patch.dismissed_reason = stage === "DISQUALIFIED" ? data.note : current.dismissed_reason;
    }
    if (data.ownerNotes !== undefined) patch.owner_notes = data.ownerNotes;

    const { data: updated, error } = await context.supabase
      .from("opportunities")
      .update(patch)
      .eq("id", current.id)
      .eq("owner_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const changedStage = stage !== current.qualification_stage;
    if (changedStage) {
      await context.supabase.from("business_activity_events").insert({
        owner_id: context.userId,
        business_id: current.business_id,
        event_type: "opportunity_stage",
        summary: `Opportunity moved from ${current.qualification_stage} to ${stage}`,
        details: { from: current.qualification_stage, to: stage } as unknown as Json,
        ref_table: "opportunities",
        ref_id: current.id,
      });
      if (stage === "QUALIFIED" || stage === "READY_TO_PROPOSE") {
        await context.supabase.from("tasks").insert({
          owner_id: context.userId,
          business_id: current.business_id,
          title:
            stage === "QUALIFIED"
              ? `Prepare validation summary: ${current.title}`
              : `Review & send proposal: ${current.title}`,
          source: "opportunity",
          dedupe_key: `opportunity-${stage.toLowerCase()}-${current.id}`,
        });
      }
      if (stage === "WON" || stage === "LOST") {
        await context.supabase
          .from("businesses")
          .update({
            outreach_stage: stage === "WON" ? "won" : "lost",
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.business_id)
          .eq("owner_id", context.userId);
      }
    }

    return updated;
  });

const outreachInput = z.object({
  id: z.string().uuid(),
  channel: z.enum(["Email", "WhatsApp", "SMS"]),
  at: z.string().datetime().optional(),
  response: z.boolean().optional().default(false),
  note: z.string().trim().max(2000).optional(),
});

export const recordOpportunityOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => outreachInput.parse(data))
  .handler(async ({ data, context }): Promise<OpportunityRow> => {
    const opportunity = await loadOpportunity(context.supabase, context.userId, data.id);
    const at = data.at ?? new Date().toISOString();
    const { data: updated, error } = await context.supabase
      .from("opportunities")
      .update({
        last_outreach_at: at,
        last_response_at: data.response ? at : opportunity.last_response_at,
        outreach_count: opportunity.outreach_count + 1,
        owner_notes: data.note ?? opportunity.owner_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunity.id)
      .eq("owner_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("business_activity_events").insert({
      owner_id: context.userId,
      business_id: opportunity.business_id,
      event_type: "opportunity_outreach",
      summary: data.response
        ? `${data.channel} reply recorded for ${opportunity.title}`
        : `${data.channel} outreach recorded for ${opportunity.title}`,
      details: {
        channel: data.channel,
        response: data.response,
        note: data.note ?? null,
      } as unknown as Json,
      ref_table: "opportunities",
      ref_id: opportunity.id,
    });
    if (!isTerminalStage(opportunity.qualification_stage as (typeof STAGES)[number])) {
      await context.supabase
        .from("businesses")
        .update({
          outreach_stage: data.response ? "replied" : "messaged",
          last_contacted_at: at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.business_id)
        .eq("owner_id", context.userId);
    }
    return updated;
  });

const proposalInput = z.object({
  id: z.string().uuid(),
  mode: z.string().min(2).max(80),
  channel: z.enum(["Email", "WhatsApp", "SMS"]).default("Email"),
  language: z.string().max(40).default("English"),
  tone: z.string().max(40).default("Professional"),
  provider: z.enum(["auto", "openai", "gemini", "lovable"]).default("auto"),
});

export const createOpportunityProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => proposalInput.parse(data))
  .handler(async ({ data, context }): Promise<{ proposalId: string; staleDays: number | null }> => {
    const opportunity = await loadOpportunity(context.supabase, context.userId, data.id);
    if (
      opportunity.validation_status !== "CONFIRMED" ||
      !["QUALIFIED", "READY_TO_PROPOSE", "PROPOSAL_SENT"].includes(opportunity.qualification_stage)
    ) {
      throw new Error(
        "Confirm the problem and qualify the opportunity before generating a proposal.",
      );
    }
    const gaps = asGaps(opportunity.gaps);
    const extra = [
      `OPPORTUNITY: ${opportunity.title}`,
      `RECORDED PROBLEM: ${opportunity.identified_problem}`,
      `RECOMMENDED SOLUTION: ${opportunity.potential_solution}`,
      `EVIDENCE: ${gaps.map((gap) => `${gap.label} (${gap.evidence})`).join("; ")}`,
      "Do not invent prices, metrics or commitments. Keep unverified assumptions as questions.",
    ].join("\n");
    const result = await createProposal(context.supabase, context.userId, {
      businessId: opportunity.business_id,
      mode: data.mode,
      channel: data.channel,
      language: data.language,
      tone: data.tone,
      offer: opportunity.relevant_service ?? undefined,
      price: null,
      currency: "USD",
      extra,
      provider: data.provider as AiProvider,
    });
    const now = new Date().toISOString();
    const { error: linkError } = await context.supabase
      .from("proposals")
      .update({ opportunity_id: opportunity.id, updated_at: now })
      .eq("id", result.proposalId)
      .eq("owner_id", context.userId);
    if (linkError) throw new Error(linkError.message);
    await context.supabase
      .from("opportunities")
      .update({
        qualification_stage: "READY_TO_PROPOSE",
        updated_at: now,
      })
      .eq("id", opportunity.id)
      .eq("owner_id", context.userId);
    return result;
  });
