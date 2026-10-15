// Referral & partnership intelligence (Feature H).
//
// Two honest pieces:
//   1. A referral ledger — who referred a lead, what came of it, and any reward.
//      A reward is only ever a recorded agreement, never an auto-computed payout.
//   2. Partnership candidate detection built ONLY from recorded evidence: the
//      industries where the owner already delivers recurring work but has no
//      partner recorded. It is a hypothesis to look into, not a claimed connection.
import type { Partner } from "@/lib/partners";

export const REFERRAL_STATUSES = ["invited", "accepted", "won", "lost"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_REWARD_TYPES = ["none", "fixed", "percent"] as const;
export type ReferralRewardType = (typeof REFERRAL_REWARD_TYPES)[number];

export type Referral = {
  id?: string | null;
  referrerName: string;
  referrerBusinessId: string | null;
  referredBusinessId: string | null;
  referredName: string | null;
  status: ReferralStatus;
  rewardType: ReferralRewardType;
  rewardValue: number;
  currency: string;
  notes: string | null;
  source: string | null;
};

export const REFERRAL_DISCLAIMER =
  "A referral is a recorded introduction, not a promise of work. Reward amounts are what you agreed, never a payout the app calculates for you.";

export type ReferralSummary = {
  total: number;
  byStatus: Record<ReferralStatus, number>;
  /** Rewards owed on WON referrals, kept separate from pipeline value. */
  rewardsOwed: number;
  currency: string;
  /** True when won referrals use more than one currency (sum is then approximate). */
  mixedCurrency: boolean;
};

export function referralSummary(referrals: Referral[]): ReferralSummary {
  const byStatus: Record<ReferralStatus, number> = { invited: 0, accepted: 0, won: 0, lost: 0 };
  const wonCurrencies = new Set<string>();
  let rewardsOwed = 0;
  for (const r of referrals) {
    byStatus[r.status] += 1;
    if (r.status === "won" && r.rewardType !== "none") {
      rewardsOwed += r.rewardValue;
      wonCurrencies.add(r.currency);
    }
  }
  return {
    total: referrals.length,
    byStatus,
    rewardsOwed,
    currency: referrals[0]?.currency ?? "USD",
    mixedCurrency: wonCurrencies.size > 1,
  };
}

// A short, honest prompt for asking a happy client for an introduction.
export function referralPrompt(clientName: string): string {
  return `Ask ${clientName} who else they know with the same problem — one introduction, no pressure, and only after you have delivered.`;
}

// --- Partnership candidate detection (evidence-based) -----------------------

export type ClientTie = {
  businessId: string;
  name: string;
  industry: string | null;
  recurring: boolean;
};

export type PartnershipCandidate = {
  industry: string | null;
  industryLabel: string;
  clientCount: number;
  recurringClients: number;
  clientNames: string[];
  hasPartner: boolean;
  hypothesis: boolean;
  evidence: string;
  nextStep: string;
};

// Look for industries where the owner already delivers recurring work. Where no
// recorded partner covers that industry, surface a hypothesis to look into.
export function partnershipCandidates(
  clients: ClientTie[],
  partners: Partner[],
  industryLabel: (key: string | null) => string,
): PartnershipCandidate[] {
  const byIndustry = new Map<string, ClientTie[]>();
  for (const c of clients) {
    const key = c.industry ?? "unknown";
    const list = byIndustry.get(key) ?? [];
    list.push(c);
    byIndustry.set(key, list);
  }

  const out: PartnershipCandidate[] = [];
  for (const [key, list] of byIndustry) {
    const recurringClients = list.filter((c) => c.recurring).length;
    // Only clusters with more than one client are worth a partnership look.
    if (list.length < 2 && recurringClients < 2) continue;
    const industryKey = key === "unknown" ? null : key;
    const hasPartner = partners.some(
      (p) => p.active && industryKey != null && p.industries.includes(industryKey),
    );
    out.push({
      industry: industryKey,
      industryLabel: industryLabel(industryKey),
      clientCount: list.length,
      recurringClients,
      clientNames: list.map((c) => c.name).slice(0, 6),
      hasPartner,
      hypothesis: true,
      evidence: `${list.length} recorded client${list.length === 1 ? "" : "s"} in ${industryLabel(
        industryKey,
      )} (${recurringClients} on recurring work).`,
      nextStep: hasPartner
        ? "You already have a partner covering this industry — review whether the fit is still right."
        : "Consider whether a partner in this industry would help; verify before assuming a connection.",
    });
  }

  return out.sort(
    (a, b) =>
      Number(a.hasPartner) - Number(b.hasPartner) ||
      b.recurringClients - a.recurringClients ||
      b.clientCount - a.clientCount,
  );
}

export const PARTNERSHIP_DISCLAIMER =
  "Clusters are derived only from businesses you have recorded. Nothing here asserts a partnership exists or that a specific company will work with you.";
