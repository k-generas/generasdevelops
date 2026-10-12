// Evidence-backed service-to-company matching (spec §7).
//
// Rules this module encodes:
//   - Only the owner's confirmed services are ever proposed.
//   - A match requires a credible link between an observable problem and a
//     service. No problem, no match.
//   - Weak / inference-only evidence produces an explicit HYPOTHESIS, never an
//     asserted company need.
//   - Every match explains itself: problem, evidence + freshness, relevance,
//     likely contact role, next action, confidence and uncertainties.
import {
  isFactual,
  isProvenanceStale,
  VERIFICATION_LABELS,
  type VerificationStatus,
} from "@/lib/provenance";
import { industryLabel, type IndustryKey } from "@/lib/rwanda";

export type Severity = "low" | "medium" | "high";
export type Effort = "low" | "medium" | "high";
export type CompanySize = "micro" | "small" | "medium" | "large" | "unknown";

export type ObservedProblem = {
  key: string; // canonical key shared with ServiceDefinition.addresses
  label: string;
  evidence: string;
  source: string;
  observed_at: string;
  confidence: number; // 0..1
  severity: Severity;
  status: VerificationStatus;
};

export type ServiceDefinition = {
  offer: string; // must match an owner-confirmed offer name
  addresses: string[];
  industries?: IndustryKey[];
  effort: Effort;
  recurring: boolean;
};

export type MatchContext = {
  industry: IndustryKey | null;
  size: CompanySize;
  now?: Date;
};

export type MatchedEvidence = {
  source: string;
  observed_at: string;
  confidence: number;
  status: VerificationStatus;
  stale: boolean;
};

export type MatchExplanation = {
  offer: string;
  whatCompanyDoes: string;
  observedProblem: string;
  evidence: MatchedEvidence[];
  whyRelevant: string;
  likelyBuyerRole: string;
  nextAction: string;
  confidence: number;
  uncertainties: string[];
  effort: Effort;
  recurring: boolean;
  hypothesis: boolean;
};

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 1, medium: 0.75, low: 0.5 };

function statusWeight(status: VerificationStatus): number {
  if (isFactual(status)) return status === "officially_verified" ? 1 : 0.9;
  switch (status) {
    case "estimated":
      return 0.6;
    case "unverified":
      return 0.5;
    case "ai_inference":
      return 0.4;
    case "outdated":
      return 0.35;
    case "conflicting":
      return 0.3;
    default:
      return 0.3;
  }
}

const SIZE_LABEL: Record<CompanySize, string> = {
  micro: "a micro business",
  small: "a small business",
  medium: "a mid-sized company",
  large: "a large organisation",
  unknown: "a company of unknown size",
};

// Suggested decision-maker role. Never presented as verified; the label says so.
export function suggestedBuyerRole(offer: string): string {
  const o = offer.toLowerCase();
  if (o.includes("website") || o.includes("digital") || o.includes("dukalinka")) {
    return "Owner / Marketing lead (suggested — not publicly confirmed)";
  }
  if (o.includes("automation") || o.includes("software") || o.includes("dashboard")) {
    return "Operations / IT lead (suggested — not publicly confirmed)";
  }
  return "Owner or Managing Director (suggested — not publicly confirmed)";
}

function nextActionFor(offer: string, hypothesis: boolean): string {
  const base = `Send a short, evidence-based message referencing the observed issue and offer ${offer}.`;
  return hypothesis
    ? `Verify the issue first (open the site / confirm the listing is current), then ${base.toLowerCase()}`
    : base;
}

// Canonical observable-problem keys shared by the UI and this matcher.
export const PROBLEM_KEYS = {
  noWebsite: "no_website",
  slowSite: "slow_site",
  notMobile: "not_mobile",
  outdatedContent: "outdated_content",
  noContactChannel: "no_contact_channel",
  noBooking: "no_booking",
  manualProcess: "manual_process",
  leadFollowup: "lead_followup",
  noReporting: "no_reporting",
} as const;

type OfferRule = {
  match: RegExp;
  addresses: string[];
  effort: Effort;
  recurring: boolean;
};

// Keyword rules mapping an owner's offer name to the observable problems it can
// address. An offer that matches no rule gets no catalog entry, so it is never
// matched to an unrelated problem.
const OFFER_RULES: OfferRule[] = [
  {
    match: /performance|speed|core web|loading/i,
    addresses: [PROBLEM_KEYS.slowSite, PROBLEM_KEYS.notMobile],
    effort: "medium",
    recurring: false,
  },
  {
    match: /website|dukalinka|digital product|digital service|landing|web/i,
    addresses: [PROBLEM_KEYS.noWebsite, PROBLEM_KEYS.outdatedContent],
    effort: "medium",
    recurring: false,
  },
  {
    match: /automation|software|dashboard|system|workflow|booking|payment|crm/i,
    addresses: [
      PROBLEM_KEYS.manualProcess,
      PROBLEM_KEYS.leadFollowup,
      PROBLEM_KEYS.noBooking,
      PROBLEM_KEYS.noReporting,
      PROBLEM_KEYS.noContactChannel,
    ],
    effort: "high",
    recurring: true,
  },
];

// Build a service catalog from the owner's active offer names. Offers that do
// not clearly map to observable problems are skipped rather than guessed at.
export function buildServiceCatalog(offerNames: string[]): ServiceDefinition[] {
  const out: ServiceDefinition[] = [];
  for (const name of offerNames) {
    const trimmed = name.trim();
    if (trimmed === "") continue;
    const addresses = new Set<string>();
    let effort: Effort = "medium";
    let recurring = false;
    for (const rule of OFFER_RULES) {
      if (rule.match.test(trimmed)) {
        rule.addresses.forEach((k) => addresses.add(k));
        effort = rule.effort;
        recurring = rule.recurring;
        break;
      }
    }
    if (addresses.size === 0) continue;
    out.push({ offer: trimmed, addresses: [...addresses], effort, recurring });
  }
  return out;
}

// Match owner-confirmed services against observed problems. Only services in
// `confirmedOffers` are considered. Results are hypotheses when evidence is weak.
export function matchServices(
  problems: ObservedProblem[],
  catalog: ServiceDefinition[],
  confirmedOffers: string[],
  ctx: MatchContext,
): MatchExplanation[] {
  const now = ctx.now ?? new Date();
  const confirmed = new Set(confirmedOffers.map((o) => o.trim()).filter(Boolean));
  const byKey = new Map(problems.map((p) => [p.key, p]));
  const out: MatchExplanation[] = [];

  for (const def of catalog) {
    if (!confirmed.has(def.offer)) continue;
    const matched = def.addresses.map((k) => byKey.get(k)).filter((p): p is ObservedProblem => !!p);
    if (matched.length === 0) continue;

    const evidence: MatchedEvidence[] = matched.map((p) => ({
      source: p.source,
      observed_at: p.observed_at,
      confidence: p.confidence,
      status: p.status,
      stale: isProvenanceStale(
        {
          source: p.source,
          source_type: "website",
          method: "api",
          url: null,
          first_seen_at: p.observed_at,
          last_checked_at: p.observed_at,
          last_verified_at: null,
          excerpt: null,
          confidence: p.confidence,
          status: p.status,
        },
        now,
      ),
    }));

    const raw = Math.max(
      ...matched.map((p) => p.confidence * statusWeight(p.status) * SEVERITY_WEIGHT[p.severity]),
    );
    const industryFit =
      ctx.industry && def.industries?.length
        ? def.industries.includes(ctx.industry)
          ? 1
          : 0.7
        : 0.85;
    const stale = evidence.every((e) => e.stale);
    let confidence = Math.max(0, Math.min(1, raw * industryFit * (stale ? 0.7 : 1)));

    const uncertainties: string[] = [];
    const nonFactual = matched.filter((p) => !isFactual(p.status));
    if (nonFactual.length > 0) {
      uncertainties.push(
        `Evidence is ${VERIFICATION_LABELS[nonFactual[0]!.status].toLowerCase()}, not a verified fact.`,
      );
    }
    if (stale) uncertainties.push("Evidence is stale and should be re-checked.");
    if (ctx.size === "unknown") uncertainties.push("Company size is unknown.");
    if (ctx.industry === null) uncertainties.push("Industry is unknown.");

    const hypothesis = confidence < 0.6 || nonFactual.length > 0 || ctx.industry === null;
    if (hypothesis) confidence = Math.min(confidence, 0.59);

    out.push({
      offer: def.offer,
      whatCompanyDoes: ctx.industry
        ? `Operates in ${industryLabel(ctx.industry)}.`
        : "Business activity not yet classified.",
      observedProblem: matched.map((p) => p.label).join("; "),
      evidence,
      whyRelevant: `Relevant to ${SIZE_LABEL[ctx.size]}${
        ctx.industry ? ` in ${industryLabel(ctx.industry)}` : ""
      } because ${matched.map((p) => p.label.toLowerCase()).join(" and ")}.`,
      likelyBuyerRole: suggestedBuyerRole(def.offer),
      nextAction: nextActionFor(def.offer, hypothesis),
      confidence,
      uncertainties,
      effort: def.effort,
      recurring: def.recurring,
      hypothesis,
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence || a.offer.localeCompare(b.offer));
}
