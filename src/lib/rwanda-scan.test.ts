import { describe, expect, it } from "vitest";
import {
  buildScanPlan,
  COST_PER_QUERY_USD,
  estimateScanCost,
  MAX_QUERIES_PER_RUN,
  withinBudget,
} from "@/lib/rwanda-scan";

describe("rwanda scan plan", () => {
  it("builds a national plan capped at the hard limit", () => {
    const plan = buildScanPlan({
      industries: ["technology", "hospitality", "health"],
      scope: { kind: "national" },
    });
    // 5 provinces x 3 industries = 15 requested, capped at 10.
    expect(plan.queries).toHaveLength(MAX_QUERIES_PER_RUN);
    expect(plan.truncated).toBe(true);
  });

  it("uses district + province in the location and industry terms in the query", () => {
    const plan = buildScanPlan({
      industries: ["technology"],
      scope: { kind: "districts", districts: ["Gasabo"] },
    });
    expect(plan.queries).toHaveLength(1);
    expect(plan.queries[0]!.location).toBe("Gasabo, Kigali City");
    expect(plan.queries[0]!.query).toContain("software");
    expect(plan.queries[0]!.province).toBe("Kigali City");
    expect(plan.queries[0]!.district).toBe("Gasabo");
  });

  it("de-duplicates identical query/location pairs", () => {
    const plan = buildScanPlan({
      industries: ["technology", "technology"],
      scope: { kind: "provinces", provinces: ["Southern"] },
    });
    expect(plan.queries).toHaveLength(1);
    expect(plan.truncated).toBe(false);
  });

  it("estimates cost deterministically", () => {
    expect(estimateScanCost(0)).toBe(0);
    expect(estimateScanCost(10)).toBe(Math.round(10 * COST_PER_QUERY_USD * 1000) / 1000);
    const plan = buildScanPlan({
      industries: ["hospitality"],
      scope: { kind: "provinces", provinces: ["Northern"] },
    });
    expect(plan.estimatedCostUsd).toBe(estimateScanCost(plan.queries.length));
  });

  it("enforces a budget check", () => {
    const plan = buildScanPlan({
      industries: ["technology"],
      scope: { kind: "provinces", provinces: ["Northern"] },
    });
    expect(withinBudget(plan, 1)).toBe(true);
    expect(withinBudget(plan, 0)).toBe(false);
  });

  it("respects a caller-provided lower cap", () => {
    const plan = buildScanPlan(
      { industries: ["technology", "hospitality", "health"], scope: { kind: "national" } },
      2,
    );
    expect(plan.queries).toHaveLength(2);
    expect(plan.truncated).toBe(true);
  });
});
