import { describe, expect, it } from "vitest";
import {
  churnRate,
  overdueRenewals,
  recurringOpportunities,
  recurringSnapshot,
  upcomingRenewals,
  type Subscription,
} from "./recurring";
import type { RevenueLeak } from "./revenue-leaks";

const NOW = new Date("2026-10-14T00:00:00.000Z");

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    businessId: "b1",
    offer: "Care Plan",
    status: "active",
    monthlyValue: 100,
    currency: "USD",
    startedAt: "2026-01-01",
    nextRenewalAt: "2026-11-01",
    canceledAt: null,
    notes: null,
    source: null,
    ...over,
  };
}

describe("recurringSnapshot", () => {
  it("sums only active value into MRR and keeps proposed/paused/churned separate", () => {
    const s = recurringSnapshot([
      sub({ monthlyValue: 100 }),
      sub({ monthlyValue: 250 }),
      sub({ status: "proposed", monthlyValue: 500 }),
      sub({ status: "paused", monthlyValue: 60 }),
      sub({ status: "churned", monthlyValue: 40 }),
    ]);
    expect(s.activeCount).toBe(2);
    expect(s.mrr).toBe(350);
    expect(s.arr).toBe(4200);
    expect(s.proposedMonthlyValue).toBe(500);
    expect(s.pausedMonthlyValue).toBe(60);
    expect(s.churnedMonthlyValue).toBe(40);
  });

  it("flags mixed currencies among active subscriptions", () => {
    const s = recurringSnapshot([sub({ currency: "USD" }), sub({ currency: "RWF" })]);
    expect(s.mixedCurrency).toBe(true);
  });

  it("is all zeros with no subscriptions", () => {
    const s = recurringSnapshot([]);
    expect(s.mrr).toBe(0);
    expect(s.mixedCurrency).toBe(false);
    expect(s.currency).toBe("USD");
  });
});

describe("churnRate", () => {
  it("is null until there is a decided subscription", () => {
    expect(churnRate([sub({ status: "proposed" })])).toBeNull();
  });

  it("computes churned over active plus churned", () => {
    expect(churnRate([sub(), sub(), sub({ status: "churned" })])).toBeCloseTo(1 / 3, 6);
  });
});

describe("renewals", () => {
  it("lists active renewals due within the window", () => {
    const rows = [
      sub({ nextRenewalAt: "2026-10-20" }),
      sub({ nextRenewalAt: "2026-12-01" }),
      sub({ status: "paused", nextRenewalAt: "2026-10-15" }),
    ];
    const up = upcomingRenewals(rows, NOW, 30);
    expect(up).toHaveLength(1);
    expect(up[0]!.nextRenewalAt).toBe("2026-10-20");
  });

  it("lists overdue renewals separately", () => {
    const overdue = overdueRenewals(
      [sub({ nextRenewalAt: "2026-10-01" }), sub({ nextRenewalAt: "2026-11-01" })],
      NOW,
    );
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.nextRenewalAt).toBe("2026-10-01");
  });
});

describe("recurringOpportunities", () => {
  it("keeps only open recurring leaks", () => {
    const leak = (over: Partial<RevenueLeak>): RevenueLeak => ({
      dedupeKey: "b1:manual_process",
      businessId: "b1",
      problemKey: "manual_process",
      label: "Manual process",
      severity: "medium",
      businessRelevance: "a small business",
      confidence: 0.7,
      source: "website",
      evidenceUrl: null,
      observedAt: "2026-10-01",
      limitation: "unconfirmed",
      suggestedOffer: "Automation",
      effort: "high",
      recurring: true,
      nextStep: "reach out",
      hypothesis: false,
      status: "open",
      ...over,
    });
    const opps = recurringOpportunities([
      leak({}),
      leak({ recurring: false }),
      leak({ status: "dismissed" }),
    ]);
    expect(opps).toHaveLength(1);
    expect(opps[0]!.offer).toBe("Automation");
  });
});
