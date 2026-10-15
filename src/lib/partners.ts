// Agency Overflow Work Finder (Feature B).
//
// The owner cannot deliver everything they find. This module:
//   1. decides which opportunities must be offloaded (capacity / skills),
//   2. matches them to the partners the OWNER recorded, using only the
//      capabilities the owner entered — never an invented reputation,
//   3. tracks handoffs and keeps the partner's delivery value separate from the
//      owner's referral/coordination fee.
//
// It never contacts anyone and never verifies a partner: a match is only as good
// as the owner's own notes about that partner.
import { computeCapacity, type FeasibilityAssumptions } from "@/lib/feasibility";
import type { IndustryKey } from "@/lib/rwanda";

export type PartnerKind = "agency" | "freelancer" | "studio" | "individual";

export type Partner = {
  id?: string;
  name: string;
  kind: PartnerKind;
  services: string[];
  industries: string[];
  districts: string[];
  availableHoursPerWeek: number;
  rate: number;
  currency: string;
  contactEmail: string | null;
  contactPhone: string | null;
  source: string | null;
  notes: string | null;
  active: boolean;
};

export const PARTNER_KINDS: PartnerKind[] = ["agency", "freelancer", "studio", "individual"];

export const PARTNER_DISCLAIMER =
  "Match quality reflects only the capabilities you recorded for each partner. It is not a verification of the partner or a guarantee they can deliver.";

export type OverflowReason = "capacity" | "skills" | "manual";

export type OverflowItem = {
  businessId: string | null;
  leakId: string | null;
  title: string;
  service: string | null;
  problemLabel: string;
  industry: IndustryKey | null;
  district: string | null;
  estimatedHours: number;
  recurring: boolean;
  reasons: OverflowReason[];
};

export type OverflowDecision = { overflow: boolean; reasons: OverflowReason[] };

// Overflow = the owner cannot fit the work in their remaining capacity, or lacks
// the demonstrated skills. A caller-supplied `manual` flag always offloads.
export function detectOverflow(input: {
  assumptions: FeasibilityAssumptions;
  estimatedHours: number;
  manual?: boolean;
}): OverflowDecision {
  const reasons: OverflowReason[] = [];
  const capacity = computeCapacity({ ...input.assumptions, estimatedHours: input.estimatedHours });
  if (!capacity.fits) reasons.push("capacity");
  if (!input.assumptions.skillsDemonstrated) reasons.push("skills");
  if (input.manual) reasons.push("manual");
  return { overflow: reasons.length > 0, reasons };
}

const STOPWORDS = new Set(["and", "the", "for", "of", "with", "a", "an", "to", "in", "on"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

// Fraction of the item's meaningful words covered by the partner's services.
export function serviceOverlap(partnerServices: string[], needed: string): number {
  const need = tokens(needed);
  if (need.size === 0) return 0;
  const have = tokens(partnerServices.join(" "));
  let hit = 0;
  for (const t of need) if (have.has(t)) hit += 1;
  return hit / need.size;
}

export type PartnerMatch = {
  partner: Partner;
  score: number;
  serviceOverlap: number;
  industryMatch: boolean | null;
  regionMatch: boolean | null;
  capacityFit: boolean | null;
  reasons: string[];
  uncertainties: string[];
  hypothesis: boolean;
};

const W_SERVICE = 0.5;
const W_INDUSTRY = 0.25;
const W_REGION = 0.15;
const W_CAPACITY = 0.1;
const REMOTE = new Set(["remote", "anywhere", "national", "online"]);

function includesNormalized(list: string[], value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return list.some((x) => x.trim().toLowerCase() === v);
}

// Match one overflow item against active partners. Scores only what the owner
// recorded; unknown dimensions stay neutral and are listed as uncertainties.
export function matchPartners(
  item: OverflowItem,
  partners: Partner[],
  options: { minScore?: number } = {},
): PartnerMatch[] {
  const needed = [item.service ?? "", item.problemLabel].filter(Boolean).join(" ");
  const weeklyNeed = item.estimatedHours / 4;
  const minScore = options.minScore ?? 0;

  const out: PartnerMatch[] = [];
  for (const partner of partners) {
    if (!partner.active) continue;

    const overlap = serviceOverlap(partner.services, needed);
    const industryMatch =
      partner.industries.length === 0
        ? null
        : includesNormalized(partner.industries, item.industry);
    const regionMatch =
      partner.districts.length === 0 || partner.districts.some((d) => REMOTE.has(d.toLowerCase()))
        ? null
        : includesNormalized(partner.districts, item.district);
    const capacityFit =
      partner.availableHoursPerWeek <= 0 ? null : partner.availableHoursPerWeek >= weeklyNeed;

    const score =
      W_SERVICE * overlap +
      W_INDUSTRY * (industryMatch === null ? 0.5 : industryMatch ? 1 : 0) +
      W_REGION * (regionMatch === null ? 0.5 : regionMatch ? 1 : 0) +
      W_CAPACITY * (capacityFit === null ? 0.5 : capacityFit ? 1 : 0);

    const reasons: string[] = [];
    if (overlap > 0)
      reasons.push(`Services cover ${Math.round(overlap * 100)}% of the work keywords.`);
    if (industryMatch === true) reasons.push(`Works in ${item.industry}.`);
    if (regionMatch === true) reasons.push(`Covers ${item.district}.`);
    if (capacityFit === true)
      reasons.push(
        `Has ~${partner.availableHoursPerWeek} h/week free (needs ~${weeklyNeed.toFixed(1)}).`,
      );

    const uncertainties: string[] = [];
    if (industryMatch === null) uncertainties.push("Partner industries not recorded.");
    if (regionMatch === null) uncertainties.push("Partner coverage not recorded.");
    if (capacityFit === null) uncertainties.push("Partner availability not recorded.");
    if (overlap < 0.34)
      uncertainties.push("Weak overlap between the work and the partner's services.");

    const hypothesis = overlap < 0.34 || score < 0.5;
    out.push({
      partner,
      score: hypothesis ? Math.min(score, 0.59) : score,
      serviceOverlap: overlap,
      industryMatch,
      regionMatch,
      capacityFit,
      reasons,
      uncertainties,
      hypothesis,
    });
  }

  return out
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.partner.name.localeCompare(b.partner.name));
}

export type HandoffStatus = "planned" | "introduced" | "accepted" | "declined" | "delivered";

export const HANDOFF_STATUSES: HandoffStatus[] = [
  "planned",
  "introduced",
  "accepted",
  "declined",
  "delivered",
];

export type HandoffLike = { status: string; delivery_value: number; owner_cut: number };

export type HandoffSummary = {
  total: number;
  byStatus: Record<HandoffStatus, number>;
  deliveryValue: number;
  ownerCut: number;
};

// Delivery value (the partner's work) and owner cut (the owner's fee) are summed
// separately and never combined into a single "revenue" figure.
export function summarizeHandoffs(rows: HandoffLike[]): HandoffSummary {
  const byStatus: Record<HandoffStatus, number> = {
    planned: 0,
    introduced: 0,
    accepted: 0,
    declined: 0,
    delivered: 0,
  };
  let deliveryValue = 0;
  let ownerCut = 0;
  for (const row of rows) {
    if ((HANDOFF_STATUSES as string[]).includes(row.status)) {
      byStatus[row.status as HandoffStatus] += 1;
    }
    deliveryValue += row.delivery_value;
    ownerCut += row.owner_cut;
  }
  return { total: rows.length, byStatus, deliveryValue, ownerCut };
}
