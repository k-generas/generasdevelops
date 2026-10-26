import { describe, expect, it } from "vitest";
import { computeAnalytics, startOfWeekUtc, weekStarts } from "@/lib/analytics";

const NOW = new Date("2026-10-26T12:00:00.000Z"); // Monday

describe("analytics week buckets", () => {
  it("starts weeks on Monday in UTC", () => {
    expect(startOfWeekUtc(new Date("2026-10-26T00:00:00.000Z")).toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
    expect(startOfWeekUtc(new Date("2026-10-25T23:59:59.000Z")).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z",
    );
  });

  it("returns the requested number of week starts, oldest first", () => {
    const starts = weekStarts(4, NOW).map((d) => d.toISOString().slice(0, 10));
    expect(starts).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("puts records on the correct week and ignores records outside the range", () => {
    const snap = computeAnalytics({
      businesses: [
        { created_at: "2026-10-26T09:00:00.000Z" },
        { created_at: "2026-10-19T09:00:00.000Z" },
        { created_at: "2026-09-01T09:00:00.000Z" },
      ],
      proposals: [],
      invoices: [],
      weeks: 2,
      now: NOW,
    });
    expect(snap.series.map((p) => p.leads)).toEqual([1, 1]);
    expect(snap.range.leads).toBe(2);
    expect(snap.totals.leads).toBe(3);
  });
});

describe("computeAnalytics", () => {
  it("counts accepted proposals on their decision date and paid cash only", () => {
    const snap = computeAnalytics({
      businesses: [
        { created_at: "2026-10-01T00:00:00.000Z", status: "investigated" },
        { created_at: "2026-10-02T00:00:00.000Z", status: "new" },
        { created_at: "2026-10-03T00:00:00.000Z", website_checked_at: "2026-10-03T00:00:00.000Z" },
      ],
      proposals: [
        {
          created_at: "2026-10-06T00:00:00.000Z",
          updated_at: "2026-10-20T00:00:00.000Z",
          business_id: "b1",
          status: "ACCEPTED",
          price: 1000,
          currency: "USD",
          sent_at: "2026-10-07T00:00:00.000Z",
        },
        {
          created_at: "2026-10-07T00:00:00.000Z",
          updated_at: "2026-10-21T00:00:00.000Z",
          business_id: "b2",
          status: "REJECTED",
          price: 500,
          currency: "USD",
          sent_at: "2026-10-08T00:00:00.000Z",
        },
      ],
      invoices: [
        {
          amount: 600,
          currency: "USD",
          status: "PAID",
          paid_at: "2026-10-22T00:00:00.000Z",
        },
        {
          amount: 400,
          currency: "USD",
          status: "SENT",
          paid_at: null,
        },
      ],
      weeks: 4,
      now: NOW,
    });

    expect(snap.series.map((p) => p.accepted)).toEqual([0, 0, 1, 0]);
    expect(snap.series.map((p) => p.cash)).toEqual([0, 0, 600, 0]);
    expect(snap.range.cash).toBe(600);
    expect(snap.totals.winRate).toBe(50);
    expect(snap.totals.avgDeal).toBe(1000);
    expect(snap.totals.noWebsite).toBe(1);
    expect(snap.funnel.map((f) => f.count)).toEqual([3, 1, 2, 1]);
  });

  it("keeps currencies separate and picks the dominant one for the chart", () => {
    const snap = computeAnalytics({
      businesses: [],
      proposals: [
        {
          created_at: "2026-10-06T00:00:00.000Z",
          updated_at: "2026-10-06T00:00:00.000Z",
          business_id: "b1",
          status: "SENT",
          price: 100,
          currency: "RWF",
        },
        {
          created_at: "2026-10-06T00:00:00.000Z",
          updated_at: "2026-10-06T00:00:00.000Z",
          business_id: "b1",
          status: "SENT",
          price: 50,
          currency: "RWF",
        },
        {
          created_at: "2026-10-06T00:00:00.000Z",
          updated_at: "2026-10-06T00:00:00.000Z",
          business_id: "b1",
          status: "SENT",
          price: 20,
          currency: "USD",
        },
      ],
      invoices: [
        { amount: 10, currency: "USD", status: "PAID", paid_at: "2026-10-06T00:00:00.000Z" },
        { amount: 200, currency: "RWF", status: "PAID", paid_at: "2026-10-06T00:00:00.000Z" },
      ],
      weeks: 4,
      now: NOW,
    });

    expect(snap.currency).toBe("RWF");
    expect(snap.pipelineByCurrency).toEqual([
      { currency: "RWF", amount: 150 },
      { currency: "USD", amount: 20 },
    ]);
    expect(snap.cashByCurrency).toEqual([
      { currency: "RWF", amount: 200 },
      { currency: "USD", amount: 10 },
    ]);
    expect(snap.range.cash).toBe(200);
  });
});
