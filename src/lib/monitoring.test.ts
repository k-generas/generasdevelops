import { describe, expect, it } from "vitest";
import { industriesForCategory, parseDigestBusinesses, utcDateString } from "@/lib/monitoring";
import { INDUSTRIES } from "@/lib/rwanda";

describe("industriesForCategory", () => {
  it("maps a focused category to its industries", () => {
    expect(industriesForCategory("hospitality")).toEqual(["hospitality"]);
    expect(industriesForCategory("retail")).toEqual(["wholesale_retail", "trade"]);
  });

  it("expands 'all' to every industry", () => {
    const all = industriesForCategory("all");
    expect(all).toHaveLength(INDUSTRIES.length);
    expect(all).toContain("hospitality");
  });

  it("falls back to every industry for an unknown category", () => {
    expect(industriesForCategory("nonsense")).toHaveLength(INDUSTRIES.length);
  });
});

describe("utcDateString", () => {
  it("buckets by the UTC calendar day", () => {
    expect(utcDateString(new Date("2026-10-14T00:00:00Z"))).toBe("2026-10-14");
    expect(utcDateString(new Date("2026-10-14T23:59:59Z"))).toBe("2026-10-14");
  });
});

describe("parseDigestBusinesses", () => {
  it("returns an empty array for non-arrays", () => {
    expect(parseDigestBusinesses(null)).toEqual([]);
    expect(parseDigestBusinesses({ id: "x" })).toEqual([]);
  });

  it("keeps only entries with an id and name", () => {
    const parsed = parseDigestBusinesses([
      { id: "a", name: "Alpha", category: null },
      { id: "b" },
      { name: "No id" },
      null,
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("a");
  });
});
