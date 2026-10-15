import { describe, expect, it } from "vitest";
import type { IntelInput } from "./business-intel";
import {
  buildRevenueLeaks,
  dedupeLeaks,
  isActionable,
  mergeLeakStatus,
  summarizeLeaks,
  type RevenueLeak,
} from "./revenue-leaks";

const AT = "2026-01-10T09:00:00.000Z";

function input(over: Partial<IntelInput> = {}): IntelInput {
  return {
    business: { name: "Acme", category: "Restaurant", website: null, ...over.business },
    findings: over.findings ?? null,
    websiteCheck: over.websiteCheck,
    observedAt: over.observedAt ?? AT,
  };
}

describe("buildRevenueLeaks", () => {
  it("turns a confirmed missing website into a high-severity leak", () => {
    const leaks = buildRevenueLeaks({
      businessId: "b1",
      intel: input({ websiteCheck: { confidence: "none_found" } }),
      offerNames: ["Website Development"],
    });
    expect(leaks).toHaveLength(1);
    expect(leaks[0]!.problemKey).toBe("no_website");
    expect(leaks[0]!.severity).toBe("high");
    expect(leaks[0]!.status).toBe("open");
    expect(leaks[0]!.dedupeKey).toBe("b1:no_website");
  });

  it("attaches a matching owner offer with its effort profile", () => {
    const leaks = buildRevenueLeaks({
      businessId: "b1",
      intel: input({ websiteCheck: { confidence: "none_found" } }),
      offerNames: ["Website Development"],
    });
    expect(leaks[0]!.suggestedOffer).toBe("Website Development");
    expect(leaks[0]!.effort).toBe("medium");
    expect(leaks[0]!.recurring).toBe(false);
  });

  it("leaves the offer empty (but keeps the leak) when no offer matches", () => {
    const leaks = buildRevenueLeaks({
      businessId: "b1",
      intel: input({ websiteCheck: { confidence: "none_found" } }),
      offerNames: ["Bookkeeping"],
    });
    expect(leaks).toHaveLength(1);
    expect(leaks[0]!.suggestedOffer).toBeNull();
    expect(leaks[0]!.nextStep).toContain("No active offer");
  });

  it("always carries a limitation and never claims a loss amount", () => {
    const leaks = buildRevenueLeaks({
      businessId: "b1",
      intel: input({
        findings: { url: "https://x.rw", reachable: true, load_ms: 7000 },
      }),
      offerNames: ["Performance Tuning"],
    });
    expect(leaks.length).toBeGreaterThan(0);
    for (const leak of leaks) {
      expect(leak.limitation.length).toBeGreaterThan(0);
      expect(leak.nextStep).not.toMatch(/\$\d|USD \d|RWF \d/);
    }
  });

  it("returns nothing for a healthy business", () => {
    const leaks = buildRevenueLeaks({
      businessId: "b1",
      intel: input({
        findings: {
          url: "https://good.rw",
          reachable: true,
          load_ms: 800,
          has_viewport_meta: true,
          copyright_year: 2026,
          has_contact_form: true,
          has_online_booking_or_shop: true,
        },
      }),
      offerNames: ["Website Development"],
    });
    expect(leaks).toHaveLength(0);
  });
});

describe("review lifecycle", () => {
  const leak = (over: Partial<RevenueLeak> = {}): RevenueLeak => ({
    dedupeKey: "b1:no_website",
    businessId: "b1",
    problemKey: "no_website",
    label: "No website found",
    severity: "high",
    businessRelevance: "a small business in Restaurants & cafes",
    confidence: 0.8,
    source: "google",
    evidenceUrl: null,
    observedAt: AT,
    limitation: "Only the public web presence was checked.",
    suggestedOffer: "Website Development",
    effort: "medium",
    recurring: false,
    nextStep: "Reach out.",
    hypothesis: false,
    status: "open",
    ...over,
  });

  it("preserves a dismissed/resolved decision across re-scans", () => {
    expect(mergeLeakStatus(leak(), { status: "dismissed" }).status).toBe("dismissed");
    expect(mergeLeakStatus(leak(), { status: "resolved" }).status).toBe("resolved");
    expect(mergeLeakStatus(leak(), null).status).toBe("open");
  });

  it("dedupes by dedupe key keeping the strongest confidence", () => {
    const merged = dedupeLeaks([leak({ confidence: 0.5 }), leak({ confidence: 0.9 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.confidence).toBe(0.9);
  });

  it("only counts open, non-hypothesis leaks as actionable", () => {
    expect(isActionable(leak())).toBe(true);
    expect(isActionable(leak({ hypothesis: true }))).toBe(false);
    expect(isActionable(leak({ status: "dismissed" }))).toBe(false);
  });

  it("summarizes by status and severity", () => {
    const s = summarizeLeaks([
      leak(),
      leak({ dedupeKey: "b1:slow_site", severity: "medium", status: "dismissed" }),
      leak({ dedupeKey: "b1:not_mobile", severity: "high", hypothesis: true }),
    ]);
    expect(s.total).toBe(3);
    expect(s.open).toBe(2);
    expect(s.dismissed).toBe(1);
    expect(s.bySeverity.high).toBe(2);
    expect(s.actionable).toBe(1);
  });
});
