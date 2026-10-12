import { describe, expect, it } from "vitest";
import { freshnessDays, isStale, normalizeConfidence } from "@/lib/evidence";

describe("evidence", () => {
  it("computes freshness in days", () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    expect(freshnessDays(d.toISOString())).toBe(2);
  });
  it("flags stale", () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    expect(isStale(d.toISOString(), 7)).toBe(true);
    d.setDate(d.getDate() - 20);
    expect(isStale(d.toISOString(), 7)).toBe(true);
  });
  it("normalizes confidence", () => {
    expect(normalizeConfidence(2)).toBe(1);
    expect(normalizeConfidence(-1)).toBe(0);
    expect(normalizeConfidence("0.3")).toBe(0.3);
  });
});
