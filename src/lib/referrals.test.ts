import { describe, expect, it } from "vitest";
import {
  partnershipCandidates,
  referralPrompt,
  referralSummary,
  type ClientTie,
  type Referral,
} from "./referrals";
import type { Partner } from "./partners";

function referral(over: Partial<Referral> = {}): Referral {
  return {
    referrerName: "Jane",
    referrerBusinessId: null,
    referredBusinessId: null,
    referredName: "Acme",
    status: "accepted",
    rewardType: "none",
    rewardValue: 0,
    currency: "USD",
    notes: null,
    source: null,
    ...over,
  };
}

function partner(over: Partial<Partner> = {}): Partner {
  return {
    name: "Studio X",
    kind: "agency",
    services: ["website"],
    industries: ["retail"],
    districts: ["Kigali"],
    availableHoursPerWeek: 10,
    rate: 20,
    currency: "USD",
    contactEmail: null,
    contactPhone: null,
    source: null,
    notes: null,
    active: true,
    ...over,
  };
}

describe("referralSummary", () => {
  it("counts by status and totals only rewards on won referrals", () => {
    const s = referralSummary([
      referral({ status: "won", rewardType: "fixed", rewardValue: 100 }),
      referral({ status: "won", rewardType: "percent", rewardValue: 50 }),
      referral({ status: "invited", rewardType: "fixed", rewardValue: 999 }),
      referral({ status: "lost" }),
    ]);
    expect(s.total).toBe(4);
    expect(s.byStatus.won).toBe(2);
    expect(s.rewardsOwed).toBe(150);
  });

  it("flags mixed currencies among won rewards", () => {
    const s = referralSummary([
      referral({ status: "won", rewardType: "fixed", rewardValue: 1, currency: "USD" }),
      referral({ status: "won", rewardType: "fixed", rewardValue: 1, currency: "RWF" }),
    ]);
    expect(s.mixedCurrency).toBe(true);
  });
});

describe("referralPrompt", () => {
  it("names the client and keeps the ask low-pressure", () => {
    const p = referralPrompt("Acme");
    expect(p).toContain("Acme");
    expect(p).toMatch(/no pressure/i);
  });
});

describe("partnershipCandidates", () => {
  const label = (k: string | null) => (k ? k : "Unknown industry");

  it("surfaces an industry cluster with no partner as a hypothesis", () => {
    const clients: ClientTie[] = [
      { businessId: "b1", name: "A", industry: "retail", recurring: true },
      { businessId: "b2", name: "B", industry: "retail", recurring: true },
    ];
    const out = partnershipCandidates(clients, [], label);
    expect(out).toHaveLength(1);
    expect(out[0]!.industry).toBe("retail");
    expect(out[0]!.hasPartner).toBe(false);
    expect(out[0]!.hypothesis).toBe(true);
    expect(out[0]!.nextStep).toMatch(/verify before assuming/i);
  });

  it("marks clusters already covered by a partner", () => {
    const clients: ClientTie[] = [
      { businessId: "b1", name: "A", industry: "retail", recurring: true },
      { businessId: "b2", name: "B", industry: "retail", recurring: true },
    ];
    const out = partnershipCandidates(clients, [partner({ industries: ["retail"] })], label);
    expect(out[0]!.hasPartner).toBe(true);
  });

  it("ignores lone, non-recurring clients", () => {
    const clients: ClientTie[] = [
      { businessId: "b1", name: "A", industry: "retail", recurring: false },
    ];
    expect(partnershipCandidates(clients, [], label)).toHaveLength(0);
  });
});
