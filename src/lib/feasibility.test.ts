import { describe, expect, it } from "vitest";
import {
  actualProfit,
  computeFeasibility,
  defaultFeasibilityAssumptions,
  readFeasibilityAssumptions,
  sumLedger,
  type FeasibilityAssumptions,
  type RevenueLedger,
} from "./feasibility";

function assumptions(over: Partial<FeasibilityAssumptions> = {}): FeasibilityAssumptions {
  return { ...defaultFeasibilityAssumptions(), ...over };
}

describe("computeFeasibility", () => {
  it("subtracts effort, direct and operating costs from revenue", () => {
    const r = computeFeasibility(
      assumptions({
        proposedPrice: 1000,
        estimatedHours: 20,
        internalHourlyCost: 10,
        directCosts: 50,
        acquisitionCost: 30,
        monthlyOperatingCost: 20,
        deliveryMonths: 2,
      }),
    );
    // 1000 - (50+30) - 200 - 40 = 680
    expect(r.base.netContribution).toBe(680);
    expect(r.base.totalCosts).toBe(320);
    expect(r.base.margin).toBeCloseTo(0.68, 6);
    expect(r.base.profitPerHour).toBeCloseTo(34, 6);
  });

  it("keeps best/base/worst ordered and labels them as scenarios", () => {
    const r = computeFeasibility(
      assumptions({ proposedPrice: 1000, estimatedHours: 20, internalHourlyCost: 10 }),
    );
    expect(r.best.netContribution).toBeGreaterThanOrEqual(r.base.netContribution);
    expect(r.worst.netContribution).toBeLessThanOrEqual(r.base.netContribution);
    expect(r.best.hours).toBeLessThan(r.base.hours);
    expect(r.worst.hours).toBeGreaterThan(r.base.hours);
    expect(r.scenarios.map((s) => s.name)).toEqual(["best", "base", "worst"]);
  });

  it("honours explicit effort and revenue ranges", () => {
    const r = computeFeasibility(
      assumptions({
        proposedPrice: 1000,
        estimatedHours: 20,
        effortRange: { low: 10, high: 40 },
        revenueRange: { low: 800, high: 1500 },
      }),
    );
    expect(r.best.hours).toBe(10);
    expect(r.worst.hours).toBe(40);
    expect(r.best.revenue).toBe(1500);
    expect(r.worst.revenue).toBe(800);
  });

  it("leaves expected value null unless a probability is supplied", () => {
    const none = computeFeasibility(assumptions({ proposedPrice: 1000 }));
    expect(none.expectedValue).toBeNull();
    const withProb = computeFeasibility(assumptions({ proposedPrice: 1000, winProbability: 0.25 }));
    expect(withProb.expectedValue).toBeCloseTo(0.25 * withProb.base.netContribution, 6);
  });

  it("flags a loss in the base case", () => {
    const r = computeFeasibility(
      assumptions({ proposedPrice: 100, estimatedHours: 20, internalHourlyCost: 20 }),
    );
    expect(r.base.netContribution).toBeLessThan(0);
    expect(r.flags.some((f) => f.includes("Base case is a loss"))).toBe(true);
  });

  it("flags capacity shortfalls honestly", () => {
    const r = computeFeasibility(
      assumptions({ estimatedHours: 80, deliveryMonths: 1, availableHoursPerWeek: 10 }),
    );
    expect(r.capacity.fits).toBe(false);
    expect(r.capacity.shortfallHoursPerWeek).toBeGreaterThan(0);
    expect(r.flags.some((f) => f.includes("Exceeds delivery capacity"))).toBe(true);
  });

  it("computes recurring net and annual, or null when unpriced", () => {
    expect(computeFeasibility(assumptions()).recurring).toBeNull();
    const r = computeFeasibility(
      assumptions({
        recurringMonthlyPrice: 200,
        recurringMonthlyCost: 20,
        recurringMonthlyHours: 2,
        internalHourlyCost: 10,
      }),
    );
    // 200 - 20 - 20 = 160
    expect(r.recurring?.monthlyNet).toBe(160);
    expect(r.recurring?.annualNet).toBe(1920);
    expect(r.recurring?.monthlyMargin).toBeCloseTo(0.8, 6);
  });

  it("flags unclear terms, undemonstrated skills and over-budget upfront costs", () => {
    const r = computeFeasibility(
      assumptions({
        paymentTermsClear: false,
        skillsDemonstrated: false,
        directCosts: 500,
        availableCash: 100,
      }),
    );
    expect(r.flags).toContain("Payment terms are unclear.");
    expect(r.flags).toContain("Requires skills not yet demonstrated.");
    expect(r.flags).toContain("Upfront costs exceed available cash.");
  });

  it("computes time to first payment from delivery lead + terms", () => {
    const r = computeFeasibility(assumptions({ deliveryMonths: 2, paymentTermsDays: 14 }));
    expect(r.base.timeToFirstPaymentDays).toBe(74);
  });
});

describe("readFeasibilityAssumptions", () => {
  it("returns defaults for junk input", () => {
    expect(readFeasibilityAssumptions(null)).toEqual(defaultFeasibilityAssumptions());
    expect(readFeasibilityAssumptions("nope")).toEqual(defaultFeasibilityAssumptions());
    expect(readFeasibilityAssumptions({ proposedPrice: "x" }).proposedPrice).toBe(0);
  });

  it("reads valid fields and ranges without throwing", () => {
    const a = readFeasibilityAssumptions({
      proposedPrice: 500,
      currency: "RWF",
      skillsDemonstrated: false,
      effortRange: { low: 4, high: 12 },
      winProbability: 0.5,
    });
    expect(a.proposedPrice).toBe(500);
    expect(a.currency).toBe("RWF");
    expect(a.skillsDemonstrated).toBe(false);
    expect(a.effortRange).toEqual({ low: 4, high: 12 });
    expect(a.winProbability).toBe(0.5);
  });
});

describe("RevenueLedger separation", () => {
  it("computes actual profit from collected cash only", () => {
    const l: RevenueLedger = {
      potentialValue: 5000,
      proposedPrice: 4000,
      acceptedValue: 3500,
      invoiced: 3500,
      collected: 2000,
      refunds: 100,
      directCosts: 300,
      operatingCosts: 200,
    };
    expect(actualProfit(l)).toBe(1400);
  });

  it("sums rows without conflating proposed or invoiced amounts", () => {
    const rows: RevenueLedger[] = [
      {
        potentialValue: null,
        proposedPrice: 100,
        acceptedValue: null,
        invoiced: 100,
        collected: 100,
        refunds: 0,
        directCosts: 10,
        operatingCosts: 5,
      },
      {
        potentialValue: null,
        proposedPrice: null,
        acceptedValue: 50,
        invoiced: 50,
        collected: 0,
        refunds: 0,
        directCosts: 0,
        operatingCosts: 0,
      },
    ];
    const total = sumLedger(rows);
    expect(total.invoiced).toBe(150);
    expect(total.collected).toBe(100);
    expect(total.actualProfit).toBe(85);
  });
});
