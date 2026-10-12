import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, explainRank, rankScore, type Opportunity } from "@/lib/ranking";

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
