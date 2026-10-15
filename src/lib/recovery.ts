// Lost-Deal Recovery (Feature G).
//
// Detects proposals that went quiet or were rejected and surfaces a short,
// respectful re-approach. It never claims the buyer has a need and never sends
// anything automatically — the owner decides, and follow-ups go through the
// existing tasks table.

export type RecoveryReason = "no_response" | "lost" | "soft_no";

export const RECOVERY_DISCLAIMER =
  "A rejected or unanswered proposal is not proof the buyer has no need. Re-approach once, briefly, and give them an easy way to say no.";

// Outcomes that mean "not now" rather than a hard "never".
const SOFT_OUTCOMES = [
  "timing",
  "budget",
  "budget_timing",
  "later",
  "not_now",
  "no_budget",
  "following_year",
];

const PIPELINE_STATUSES = new Set(["SENT", "REPLIED", "NEGOTIATING"]);

export type ProposalLike = {
  id: string;
  business_id: string | null;
  business_name?: string | null;
  title?: string | null;
  price?: number | null;
  currency?: string | null;
  status: string;
  outcome?: string | null;
  sent_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type RecoveryCandidate = {
  proposalId: string;
  businessId: string | null;
  businessName: string | null;
  title: string;
  value: number;
  currency: string;
  reason: RecoveryReason;
  ageDays: number;
  lastTouchAt: string | null;
  priority: "high" | "medium" | "low";
  recommendedApproach: string;
};

export const RECOVERY_WINDOWS = { staleDays: 14, recentLostDays: 30 };

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

export function nextRecoveryStep(reason: RecoveryReason): string {
  switch (reason) {
    case "no_response":
      return "Send one short check-in that references their earlier priority and offers to close the loop.";
    case "soft_no":
      return "Re-open at the right time with a smaller first step or a new angle, referencing the reason they paused.";
    case "lost":
      return "Ask what would have made it a yes, then record the answer for the offer and move on politely.";
    default:
      return "Re-approach once, briefly.";
  }
}

function isSoft(outcome: string | null | undefined): boolean {
  if (!outcome) return false;
  const o = outcome.toLowerCase();
  return SOFT_OUTCOMES.some((k) => o.includes(k));
}

// Classify one proposal. Returns null when there is nothing to recover.
export function classifyRecovery(
  p: ProposalLike,
  now: Date,
  windows: { staleDays: number; recentLostDays: number } = RECOVERY_WINDOWS,
): RecoveryCandidate | null {
  const lastTouch = p.updated_at ?? p.sent_at ?? p.created_at ?? null;
  const ageDays = daysSince(lastTouch, now);

  let reason: RecoveryReason | null = null;
  if (p.status === "REJECTED") {
    reason = isSoft(p.outcome) ? "soft_no" : "lost";
  } else if (PIPELINE_STATUSES.has(p.status) && p.sent_at && ageDays >= windows.staleDays) {
    reason = "no_response";
  }
  if (!reason) return null;

  // Recently lost deals are the warmest; stale and soft-no sit in the middle.
  let priority: RecoveryCandidate["priority"] = "medium";
  if (reason === "soft_no") priority = "high";
  else if (reason === "lost" && ageDays <= windows.recentLostDays) priority = "high";
  else if (reason === "no_response" && ageDays >= windows.staleDays * 2) priority = "low";

  return {
    proposalId: p.id,
    businessId: p.business_id,
    businessName: p.business_name ?? null,
    title: p.title ?? "Proposal",
    value: Number(p.price) || 0,
    currency: p.currency ?? "USD",
    reason,
    ageDays,
    lastTouchAt: lastTouch,
    priority,
    recommendedApproach: nextRecoveryStep(reason),
  };
}

const PRIORITY_RANK: Record<RecoveryCandidate["priority"], number> = { high: 0, medium: 1, low: 2 };

export function recoveryCandidates(
  proposals: ProposalLike[],
  now: Date,
  windows: { staleDays: number; recentLostDays: number } = RECOVERY_WINDOWS,
): RecoveryCandidate[] {
  const out: RecoveryCandidate[] = [];
  for (const p of proposals) {
    const c = classifyRecovery(p, now, windows);
    if (c) out.push(c);
  }
  return out.sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.value - a.value,
  );
}

// Stable dedupe key so a re-click never creates a second follow-up task.
export function recoveryTaskKey(proposalId: string): string {
  return `recover-proposal-${proposalId}`;
}
