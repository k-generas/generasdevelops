import {
  generateValidationQuestions,
  type QualificationStage,
} from "@/lib/opportunity-qualification";
import { freshnessMaxDays, isFactual, type VerificationStatus } from "@/lib/provenance";
import { rankOpportunity, type FactorContribution } from "@/lib/ranking";

export type OpportunitySolutionKey =
  "DukaLinka" | "GENERAS Digital" | "GENERAS Systems" | "Custom software";

export type OpportunityGap = {
  key: string;
  category: string;
  label: string;
  evidence: string;
  source: string;
  verification_status: VerificationStatus;
  confidence: number;
  last_checked_at: string;
};

export type OpportunitySolutionFit = {
  solution: OpportunitySolutionKey;
  gap_keys: string[];
  why: string;
  confidence: number;
  hypothesis: boolean;
  uncertainties: string[];
};

export type OpportunitySourceStatus =
  "confirmed" | "high_confidence" | "possible" | "conflicting" | "manual";

export type OpportunityBuildInput = {
  source: "social_match" | "business_audit" | "manual" | "signal";
  social_lead_id?: string | null;
  social_match_id?: string | null;
  business_id: string;
  business_name: string;
  business_category?: string | null;
  business_district?: string | null;
  business_website?: string | null;
  business_phone?: string | null;
  lead_handle?: string | null;
  lead_platform?: string | null;
  lead_profile_url?: string | null;
  lead_district?: string | null;
  account_type?: string | null;
  source_status?: OpportunitySourceStatus | null;
  source_confidence?: number | null;
  match_reason?: string | null;
  gaps: OpportunityGap[];
  solution_fits?: OpportunitySolutionFit[];
  observed_at: string;
  has_contact?: boolean;
  is_target_location?: boolean;
};

export type OpportunitySolutionDetail = {
  key: OpportunitySolutionKey;
  summary: string;
  deliverables: string[];
  effort: "low" | "medium" | "high";
  recurring: boolean;
  limitation: string;
};

export type OpportunityDraft = {
  source: OpportunityBuildInput["source"];
  social_lead_id: string | null;
  social_match_id: string | null;
  business_id: string;
  title: string;
  identified_problem: string;
  potential_solution: string;
  relevant_service: OpportunitySolutionKey;
  source_status: OpportunitySourceStatus;
  source_confidence: number;
  confidence: number;
  priority: "low" | "medium" | "high" | "critical";
  score: number;
  score_factors: FactorContribution[];
  score_reasons: string[];
  questionnaire: string[];
  next_action: string;
  gaps: OpportunityGap[];
  solution_details: OpportunitySolutionDetail;
  solution_fits: OpportunitySolutionFit[];
  estimated_effort: "low" | "medium" | "high";
  recurring: boolean;
  last_verified_at: string;
  dedupe_key: string;
  needs_verification: boolean;
};

export const SOLUTION_CATALOG: Record<OpportunitySolutionKey, OpportunitySolutionDetail> = {
  DukaLinka: {
    key: "DukaLinka",
    summary:
      "A product catalogue and order path that replaces unstructured social or WhatsApp ordering.",
    deliverables: [
      "Product catalogue",
      "Order capture",
      "Customer contact handoff",
      "Owner order dashboard",
    ],
    effort: "medium",
    recurring: true,
    limitation:
      "The owner still needs to confirm the product range, payment method and delivery process.",
  },
  "GENERAS Digital": {
    key: "GENERAS Digital",
    summary: "An owned website and enquiry path for the business's public presence.",
    deliverables: [
      "Business website",
      "Service and contact pages",
      "Enquiry or WhatsApp handoff",
      "Basic search and analytics setup",
    ],
    effort: "medium",
    recurring: false,
    limitation:
      "A website is only useful if the business can respond to enquiries and keep the content current.",
  },
  "GENERAS Systems": {
    key: "GENERAS Systems",
    summary: "A lightweight business system for orders, catalogue data, follow-up or reporting.",
    deliverables: [
      "Workflow mapping",
      "Order or catalogue tracking",
      "Follow-up or reporting view",
      "Owner and staff access rules",
    ],
    effort: "high",
    recurring: true,
    limitation:
      "The workflow and staff roles are not verified until the owner demonstrates how work is actually done.",
  },
  "Custom software": {
    key: "Custom software",
    summary:
      "A custom workflow build when several recorded gaps span presence, selling and operations.",
    deliverables: [
      "Discovery and process map",
      "Custom application scope",
      "Phased delivery plan",
      "Training and handover",
    ],
    effort: "high",
    recurring: true,
    limitation:
      "Custom software is only justified after the owner confirms a repeated operational problem.",
  },
};

const SOLUTION_WEIGHTS: Record<
  OpportunitySolutionKey,
  { fit: number; delivery_feasibility: number; recurring: number }
> = {
  DukaLinka: { fit: 0.9, delivery_feasibility: 0.75, recurring: 0.8 },
  "GENERAS Digital": { fit: 0.85, delivery_feasibility: 0.85, recurring: 0.2 },
  "GENERAS Systems": { fit: 0.72, delivery_feasibility: 0.65, recurring: 0.8 },
  "Custom software": { fit: 0.5, delivery_feasibility: 0.45, recurring: 0.75 },
};

const GAP_SOLUTION: Record<string, OpportunitySolutionKey[]> = {
  no_website: ["GENERAS Digital"],
  dead_website: ["GENERAS Digital"],
  link_hub_only: ["GENERAS Digital"],
  whatsapp_website_only: ["GENERAS Digital"],
  store_not_confirmed: ["GENERAS Digital"],
  no_online_store: ["DukaLinka", "GENERAS Systems"],
  store_link_hub: ["DukaLinka", "GENERAS Systems"],
  store_whatsapp_only: ["DukaLinka", "GENERAS Systems"],
  social_checkout_not_owned: ["GENERAS Systems", "DukaLinka"],
  no_contact_capture: ["GENERAS Digital", "GENERAS Systems"],
  no_https: ["GENERAS Digital"],
  not_mobile: ["GENERAS Digital"],
  slow_site: ["GENERAS Digital"],
  outdated_content: ["GENERAS Digital"],
  no_booking: ["DukaLinka", "GENERAS Systems"],
};

const STAGE_TRANSITIONS: Record<QualificationStage, QualificationStage[]> = {
  DISCOVERED: ["RESEARCHING", "NEEDS_VALIDATION", "VALIDATION_IN_PROGRESS", "DISQUALIFIED"],
  RESEARCHING: ["NEEDS_VALIDATION", "VALIDATION_IN_PROGRESS", "QUALIFIED", "DISQUALIFIED"],
  NEEDS_VALIDATION: ["RESEARCHING", "VALIDATION_IN_PROGRESS", "DISQUALIFIED"],
  VALIDATION_IN_PROGRESS: ["NEEDS_VALIDATION", "QUALIFIED", "DISQUALIFIED"],
  QUALIFIED: ["READY_TO_PROPOSE", "PROPOSAL_SENT", "LOST", "DISQUALIFIED"],
  READY_TO_PROPOSE: ["QUALIFIED", "PROPOSAL_SENT", "LOST", "DISQUALIFIED"],
  PROPOSAL_SENT: ["QUALIFIED", "WON", "LOST", "DISQUALIFIED"],
  WON: ["LOST"],
  LOST: ["QUALIFIED", "DISQUALIFIED"],
  DISQUALIFIED: ["RESEARCHING"],
};

const TERMINAL_STAGES = new Set<QualificationStage>(["WON", "LOST", "DISQUALIFIED"]);

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function gapRank(gap: OpportunityGap): number {
  const status = gap.verification_status;
  const statusWeight = isFactual(status)
    ? status === "officially_verified"
      ? 1
      : 0.9
    : status === "unknown"
      ? 0.1
      : 0.5;
  return statusWeight * gap.confidence;
}

export function usableGaps(gaps: OpportunityGap[]): OpportunityGap[] {
  return gaps
    .filter(
      (gap) =>
        gap.key.trim() !== "" &&
        gap.evidence.trim() !== "" &&
        gap.confidence >= 0.3 &&
        gap.verification_status !== "unknown",
    )
    .sort((a, b) => gapRank(b) - gapRank(a) || a.key.localeCompare(b.key));
}

export function mergeGaps(
  existing: OpportunityGap[],
  incoming: OpportunityGap[],
): OpportunityGap[] {
  const byKey = new Map<string, OpportunityGap>();
  for (const gap of existing) byKey.set(gap.key, gap);
  for (const gap of incoming) {
    const prior = byKey.get(gap.key);
    if (!prior || gapRank(gap) >= gapRank(prior)) byKey.set(gap.key, gap);
  }
  return [...byKey.values()].sort((a, b) => gapRank(b) - gapRank(a) || a.key.localeCompare(b.key));
}

export function solutionForGaps(
  gaps: OpportunityGap[],
  provided: OpportunitySolutionFit[] = [],
): OpportunitySolutionFit[] {
  const usable = usableGaps(gaps);
  if (usable.length === 0) return [];
  const byKey = new Map(usable.map((gap) => [gap.key, gap]));
  const out: OpportunitySolutionFit[] = [];
  const add = (solution: OpportunitySolutionKey, keys: string[], why: string, factor: number) => {
    const matched = keys.map((key) => byKey.get(key)).filter((gap): gap is OpportunityGap => !!gap);
    if (matched.length === 0) return;
    const confidence = clamp01(Math.max(...matched.map((gap) => gap.confidence)) * factor);
    out.push({
      solution,
      gap_keys: matched.map((gap) => gap.key),
      why,
      confidence,
      hypothesis: confidence < 0.7 || matched.some((gap) => !isFactual(gap.verification_status)),
      uncertainties: [
        "Owner interest, budget and willingness to change are not verified.",
        ...(matched.some((gap) => !isFactual(gap.verification_status))
          ? ["At least one gap relies on unverified evidence."]
          : []),
      ],
    });
  };

  const bySolution = new Map<OpportunitySolutionKey, string[]>();
  for (const gap of usable) {
    for (const solution of GAP_SOLUTION[gap.key] ?? []) {
      const keys = bySolution.get(solution) ?? [];
      keys.push(gap.key);
      bySolution.set(solution, keys);
    }
  }
  for (const [solution, keys] of bySolution) {
    const labels = keys
      .map((key) => byKey.get(key)?.label)
      .filter((label): label is string => !!label);
    add(
      solution,
      keys,
      `${labels.join("; ")} ${labels.length === 1 ? "is" : "are"} supported by the recorded evidence and maps to ${solution}.`,
      solution === "DukaLinka" ? 0.9 : solution === "GENERAS Digital" ? 0.82 : 0.72,
    );
  }

  if (usable.length >= 2) {
    add(
      "Custom software",
      usable.map((gap) => gap.key),
      "More than one recorded gap spans presence, selling or contact handling. Custom software remains a hypothesis until the owner confirms the process.",
      0.55,
    );
  }

  const candidates = [...provided, ...out]
    .filter((fit) => fit.gap_keys.some((key) => byKey.has(key)))
    .sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<OpportunitySolutionKey>();
  return candidates.filter((fit) => {
    if (seen.has(fit.solution)) return false;
    seen.add(fit.solution);
    return true;
  });
}

function daysSince(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function signalStrength(gaps: OpportunityGap[], now: Date): number {
  const top = gaps[0];
  if (!top) return 0;
  const maxDays = freshnessMaxDays(top.verification_status);
  const age = daysSince(top.last_checked_at, now);
  if (!Number.isFinite(age)) return 0.35;
  const freshness = Math.max(0, 1 - age / Math.max(1, maxDays));
  const factual = isFactual(top.verification_status) ? 1 : 0.55;
  return clamp01(freshness * factual);
}

function priorityLabel(score: number, confidence: number): OpportunityDraft["priority"] {
  if (score >= 0.78 && confidence >= 0.7) return "critical";
  if (score >= 0.62 && confidence >= 0.55) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

export function buildOpportunity(
  input: OpportunityBuildInput,
  now: Date = new Date(),
): OpportunityDraft | null {
  const gaps = usableGaps(input.gaps);
  if (gaps.length === 0) return null;

  const provided = input.solution_fits ?? [];
  const fits = solutionForGaps(gaps, provided);
  if (fits.length === 0) return null;
  const primaryFit = fits[0]!;
  const solution = SOLUTION_CATALOG[primaryFit.solution];
  const weights = SOLUTION_WEIGHTS[primaryFit.solution];
  const sourceStatus = input.source_status ?? "manual";
  const sourceConfidence = clamp01(input.source_confidence ?? 0.5);
  const gapConfidence = Math.max(...gaps.map((gap) => gap.confidence));
  const statusCap =
    sourceStatus === "confirmed" ? 0.9 : sourceStatus === "high_confidence" ? 0.75 : 0.6;
  const confidence = clamp01(Math.min(statusCap, gapConfidence * 0.7 + sourceConfidence * 0.3));
  const freshness = signalStrength(gaps, now);
  const ranking = rankOpportunity({
    id: input.social_match_id ?? `${input.source}:${input.business_id}`,
    evidence_count: gaps.length + (input.social_match_id ? 1 : 0),
    evidence_freshness_days: daysSince(gaps[0]!.last_checked_at, now),
    fit: weights.fit,
    cost_to_validate: 0,
    time_to_validate_hours: input.social_match_id ? 2 : 1,
    delivery_feas: weights.delivery_feasibility,
    net_profit_est: null,
    confidence,
    signal_strength: freshness,
    affordability: 0.5,
    contactability: input.has_contact ? 0.8 : 0.4,
    recurring: weights.recurring,
    competition: 0.5,
    accessibility: input.is_target_location === false ? 0.35 : 0.7,
    risk: 0.25,
  });

  const score = Math.round(ranking.priority * 100);
  const primaryGap = gaps[0]!;
  const leadLabel = input.lead_handle ? `@${input.lead_handle}` : "the social profile";
  const title = `${input.business_name}: ${primaryGap.label}`;
  const uncertainties = [
    ...primaryFit.uncertainties,
    ...(ranking.needsVerification
      ? ["The evidence is not strong enough to qualify the opportunity yet."]
      : []),
    ...(freshness < 0.4 ? ["The recorded evidence is old and should be re-checked."] : []),
  ];

  return {
    source: input.source,
    social_lead_id: input.social_lead_id ?? null,
    social_match_id: input.social_match_id ?? null,
    business_id: input.business_id,
    title,
    identified_problem: primaryGap.evidence,
    potential_solution: solution.summary,
    relevant_service: primaryFit.solution,
    source_status: sourceStatus,
    source_confidence: sourceConfidence,
    confidence,
    priority: priorityLabel(ranking.priority, confidence),
    score,
    score_factors: ranking.factors,
    score_reasons: [...ranking.reasons, ...uncertainties],
    questionnaire: generateValidationQuestions({
      service: primaryFit.solution,
      problem: primaryGap.label,
      category: primaryGap.category,
    }),
    next_action: `Review ${primaryGap.evidence.toLowerCase()} Then ask: ${
      generateValidationQuestions({
        service: primaryFit.solution,
        problem: primaryGap.label,
        category: primaryGap.category,
      })[0]
    }`,
    gaps,
    solution_details: solution,
    solution_fits: fits,
    estimated_effort: solution.effort,
    recurring: solution.recurring,
    last_verified_at: primaryGap.last_checked_at,
    dedupe_key: input.social_match_id
      ? `social:${input.social_match_id}`
      : `${input.source}:${input.business_id}:${primaryGap.key}`,
    needs_verification: ranking.needsVerification || uncertainties.length > 0,
  };
}

export type AuditEvidenceLike = {
  category: string;
  check: string;
  status: string;
  severity: string;
  evidence: string;
  source: string;
  observed_at: string;
  confidence: number;
};

const AUDIT_GAP: Record<string, { key: string; category: string; label: string }> = {
  reachability: {
    key: "dead_website",
    category: "Digital presence",
    label: "Website not reachable",
  },
  https: { key: "no_https", category: "Digital presence", label: "Website is not secure" },
  mobile_viewport: {
    key: "not_mobile",
    category: "Digital presence",
    label: "Website is not mobile-ready",
  },
  load_time: { key: "slow_site", category: "Digital presence", label: "Website loads slowly" },
  copyright_freshness: {
    key: "outdated_content",
    category: "Digital presence",
    label: "Website content is outdated",
  },
  contact_channels: {
    key: "no_contact_capture",
    category: "Contact capture",
    label: "No clear contact channel",
  },
  booking_ordering: {
    key: "no_booking",
    category: "Sales channel",
    label: "No online booking or ordering",
  },
};

export function gapsFromAuditEvidence(evidence: AuditEvidenceLike[]): OpportunityGap[] {
  const out: OpportunityGap[] = [];
  for (const item of evidence) {
    const mapped = AUDIT_GAP[item.check];
    if (!mapped) continue;
    if (item.status !== "OBSERVED" && item.status !== "INFERRED") continue;
    const negativeChecks = new Set([
      "reachability",
      "https",
      "mobile_viewport",
      "load_time",
      "copyright_freshness",
      "contact_channels",
      "booking_ordering",
    ]);
    if (!negativeChecks.has(item.check)) continue;
    const isIssue =
      item.severity === "CRITICAL" || item.severity === "HIGH" || item.severity === "MEDIUM";
    if (!isIssue) continue;
    out.push({
      key: mapped.key,
      category: mapped.category,
      label: mapped.label,
      evidence: item.evidence,
      source: item.source || "business_audit",
      verification_status: item.status === "OBSERVED" ? "single_source" : "ai_inference",
      confidence: clamp01(item.confidence),
      last_checked_at: item.observed_at,
    });
  }
  return mergeGaps([], out);
}

export function allowedStageTransitions(stage: QualificationStage): QualificationStage[] {
  return STAGE_TRANSITIONS[stage] ?? [];
}

export function canMoveStage(from: QualificationStage, to: QualificationStage): boolean {
  return from === to || allowedStageTransitions(from).includes(to);
}

export function isTerminalStage(stage: QualificationStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

export function stageRequiresConfirmedProblem(stage: QualificationStage): boolean {
  return ["QUALIFIED", "READY_TO_PROPOSE", "PROPOSAL_SENT", "WON"].includes(stage);
}

export type OpportunitySummary = {
  total: number;
  needs_validation: number;
  qualified: number;
  ready_to_propose: number;
  proposal_sent: number;
  won: number;
  lost: number;
  disqualified: number;
  high_priority: number;
};

export function summarizeOpportunities(
  rows: { qualification_stage: string; priority: string; validation_status: string }[],
): OpportunitySummary {
  const summary: OpportunitySummary = {
    total: rows.length,
    needs_validation: 0,
    qualified: 0,
    ready_to_propose: 0,
    proposal_sent: 0,
    won: 0,
    lost: 0,
    disqualified: 0,
    high_priority: 0,
  };
  for (const row of rows) {
    if (row.qualification_stage === "QUALIFIED") summary.qualified += 1;
    if (row.qualification_stage === "READY_TO_PROPOSE") summary.ready_to_propose += 1;
    if (row.qualification_stage === "PROPOSAL_SENT") summary.proposal_sent += 1;
    if (row.qualification_stage === "WON") summary.won += 1;
    if (row.qualification_stage === "LOST") summary.lost += 1;
    if (row.qualification_stage === "DISQUALIFIED") summary.disqualified += 1;
    if (row.validation_status !== "CONFIRMED") summary.needs_validation += 1;
    if (row.priority === "high" || row.priority === "critical") summary.high_priority += 1;
  }
  return summary;
}
