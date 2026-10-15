import { describe, expect, it } from "vitest";
import { defaultFeasibilityAssumptions } from "./feasibility";
import {
  detectOverflow,
  matchPartners,
  serviceOverlap,
  summarizeHandoffs,
  type OverflowItem,
  type Partner,
} from "./partners";

function partner(over: Partial<Partner> = {}): Partner {
  return {
    name: "Studio X",
    kind: "agency",
    services: ["website development", "seo"],
    industries: ["technology"],
    districts: ["Kigali"],
    availableHoursPerWeek: 20,
    rate: 40,
    currency: "USD",
    contactEmail: null,
    contactPhone: null,
    source: null,
    notes: null,
    active: true,
    ...over,
  };
}

function item(over: Partial<OverflowItem> = {}): OverflowItem {
  return {
    businessId: "b1",
    leakId: "l1",
    title: "Build a website for Acme",
    service: "Website Development",
    problemLabel: "No website found",
    industry: "technology",
    district: "Kigali",
    estimatedHours: 20,
    recurring: false,
    reasons: ["capacity"],
    ...over,
  };
}

describe("detectOverflow", () => {
  it("flags capacity when the work does not fit remaining hours", () => {
    const d = detectOverflow({
      assumptions: {
        ...defaultFeasibilityAssumptions(),
        availableHoursPerWeek: 10,
        committedHoursPerWeek: 0,
      },
      estimatedHours: 80,
    });
    expect(d.overflow).toBe(true);
    expect(d.reasons).toContain("capacity");
  });

  it("flags skills when they are not demonstrated", () => {
    const d = detectOverflow({
      assumptions: { ...defaultFeasibilityAssumptions(), skillsDemonstrated: false },
      estimatedHours: 10,
    });
    expect(d.reasons).toContain("skills");
  });

  it("does not flag work that fits and matches demonstrated skills", () => {
    const d = detectOverflow({
      assumptions: { ...defaultFeasibilityAssumptions(), availableHoursPerWeek: 40 },
      estimatedHours: 20,
    });
    expect(d).toEqual({ overflow: false, reasons: [] });
  });

  it("always offloads when marked manual", () => {
    expect(
      detectOverflow({
        assumptions: defaultFeasibilityAssumptions(),
        estimatedHours: 1,
        manual: true,
      }).overflow,
    ).toBe(true);
  });
});

describe("serviceOverlap", () => {
  it("measures keyword coverage", () => {
    expect(serviceOverlap(["website development"], "Website Development")).toBe(1);
    expect(serviceOverlap(["seo"], "Website Development")).toBe(0);
  });

  it("returns 0 for an empty need", () => {
    expect(serviceOverlap(["anything"], "")).toBe(0);
  });
});

describe("matchPartners", () => {
  it("ranks a strong service+industry+region match first and not a hypothesis", () => {
    const [top] = matchPartners(item(), [partner()]);
    expect(top!.serviceOverlap).toBeGreaterThanOrEqual(0.5);
    expect(top!.industryMatch).toBe(true);
    expect(top!.regionMatch).toBe(true);
    expect(top!.hypothesis).toBe(false);
    expect(top!.score).toBeGreaterThan(0.6);
  });

  it("marks a weak overlap as a hypothesis with capped score", () => {
    const [m] = matchPartners(item(), [
      partner({ services: ["bookkeeping"], industries: [], districts: [] }),
    ]);
    expect(m!.hypothesis).toBe(true);
    expect(m!.score).toBeLessThanOrEqual(0.59);
    expect(m!.uncertainties.length).toBeGreaterThan(0);
  });

  it("ignores inactive partners", () => {
    expect(matchPartners(item(), [partner({ active: false })])).toHaveLength(0);
  });

  it("treats remote coverage as neutral, not a mismatch", () => {
    const [m] = matchPartners(item(), [partner({ districts: ["remote"] })]);
    expect(m!.regionMatch).toBeNull();
    expect(m!.uncertainties).toContain("Partner coverage not recorded.");
  });

  it("flags a partner with too little availability", () => {
    const [m] = matchPartners(item({ estimatedHours: 200 }), [
      partner({ availableHoursPerWeek: 4 }),
    ]);
    expect(m!.capacityFit).toBe(false);
  });
});

describe("summarizeHandoffs", () => {
  it("keeps delivery value and owner cut separate", () => {
    const s = summarizeHandoffs([
      { status: "accepted", delivery_value: 1000, owner_cut: 150 },
      { status: "delivered", delivery_value: 500, owner_cut: 75 },
      { status: "planned", delivery_value: 0, owner_cut: 0 },
    ]);
    expect(s.total).toBe(3);
    expect(s.byStatus.accepted).toBe(1);
    expect(s.byStatus.delivered).toBe(1);
    expect(s.deliveryValue).toBe(1500);
    expect(s.ownerCut).toBe(225);
  });

  it("ignores unknown statuses but still sums money", () => {
    const s = summarizeHandoffs([{ status: "weird", delivery_value: 10, owner_cut: 1 }]);
    expect(s.total).toBe(1);
    expect(s.ownerCut).toBe(1);
  });
});
