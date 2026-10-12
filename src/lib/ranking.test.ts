import { describe, expect, it } from "vitest";
import {
  compareRanked,
  DEFAULT_FULL_WEIGHTS,
  DEFAULT_WEIGHTS,
  explainRank,
  rankOpportunity,
  rankScore,
  weightsFromPreferences,
  type Opportunity,
  type RankedOpportunity,
} from "@/lib/ranking";

function op(o: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "o1",
    evidence_count: 3,
    evidence_freshness_days: 1,
    fit: 0.9,
    cost_to_validate: 10,
    time_to_validate_hours: 2,
    delivery_feas: 0.8,
    net_profit_est: 500,
    confidence: 0.7,
    ...o,
  };
}

describe("ranking", () => {
  it("explains ranking", () => {
    expect(explainRank(op({ evidence_count: 1 }))).toContain("Few evidence items");
    expect(
      explainRank(
        op({ fit: 0.9, time_to_validate_hours: 1, cost_to_validate: 5, net_profit_est: 400 }),
      ),
    ).toContain("Strong fit");
  });
  it("scores between 0-1", () => {
    const s = rankScore(op());
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

function full(o: Partial<RankedOpportunity> = {}): RankedOpportunity {
  return {
    ...op(),
    signal_strength: 0.8,
    affordability: 0.7,
    contactability: 0.6,
    recurring: 0.5,
    competition: 0.3,
    accessibility: 0.7,
    risk: 0.2,
    ...o,
  };
}

describe("rankOpportunity (§8)", () => {
  it("keeps priority and factual confidence separate", () => {
    const r = rankOpportunity(full({ confidence: 0.3 }));
    expect(r.priority).toBeGreaterThan(0);
    expect(r.priority).toBeLessThanOrEqual(1);
    expect(r.confidence).toBe(0.3);
    expect(r.needsVerification).toBe(true);
  });

  it("does not flag verification when confidence is adequate", () => {
    expect(rankOpportunity(full({ confidence: 0.8 })).needsVerification).toBe(false);
  });

  it("lowers priority as competition and risk rise", () => {
    const low = rankOpportunity(full({ competition: 0.1, risk: 0.1 }));
    const high = rankOpportunity(full({ competition: 0.9, risk: 0.9 }));
    expect(low.priority).toBeGreaterThan(high.priority);
  });

  it("exposes a factor breakdown that sums (clamped) to priority", () => {
    const r = rankOpportunity(full());
    const sum = r.factors.reduce((a, f) => a + f.contribution, 0);
    expect(r.priority).toBeCloseTo(Math.max(0, Math.min(1, sum)), 5);
    expect(r.factors.find((f) => f.name === "risk")!.value).toBeCloseTo(0.8, 5);
  });

  it("explains strong signals and high risk in reasons", () => {
    const r = rankOpportunity(full({ signal_strength: 0.9, risk: 0.8, competition: 0.8 }));
    const joined = r.reasons.join(" ");
    expect(joined).toMatch(/strong, fresh buying signal/i);
    expect(joined).toMatch(/risk/i);
    expect(joined).toMatch(/competitive/i);
  });

  it("sorts by priority then confidence", () => {
    const a = rankOpportunity(full({ confidence: 0.9 }));
    const b = rankOpportunity(full({ confidence: 0.9, competition: 0.95, risk: 0.95 }));
    expect(compareRanked(a, b)).toBeLessThan(0);
  });
});

describe("weightsFromPreferences", () => {
  it("renormalises weights to sum to 1", () => {
    const w = weightsFromPreferences({ remote: true, lowStartup: true });
    const sum = Object.values(w).reduce((a, n) => a + n, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("reduces the weight of geographic accessibility for remote work", () => {
    const base = DEFAULT_FULL_WEIGHTS;
    const remote = weightsFromPreferences({ remote: true }, base);
    expect(remote.accessibility).toBeLessThan(base.accessibility);
  });

  it("increases accessibility weight when local-only is preferred", () => {
    const base = DEFAULT_FULL_WEIGHTS;
    const local = weightsFromPreferences({ localOnly: true }, base);
    expect(local.accessibility).toBeGreaterThan(base.accessibility);
  });
});
