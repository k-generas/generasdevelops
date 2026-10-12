import { describe, expect, it } from "vitest";

import { checkPrice, minPriceFor, parseMinPrices } from "@/lib/pricing";

describe("parseMinPrices", () => {
  it("keeps only non-negative numbers", () => {
    expect(parseMinPrices({ a: 100, b: "50", c: -5, d: "x", e: null })).toEqual({ a: 100, b: 50 });
  });

  it("returns empty for non-objects", () => {
    expect(parseMinPrices(null)).toEqual({});
    expect(parseMinPrices([])).toEqual({});
    expect(parseMinPrices("3")).toEqual({});
  });
});

describe("minPriceFor", () => {
  it("finds a floor by offer name", () => {
    expect(minPriceFor("Website Development", { "Website Development": 300 })).toBe(300);
    expect(minPriceFor("Custom Software", { "Website Development": 300 })).toBeNull();
    expect(minPriceFor(null, { "Website Development": 300 })).toBeNull();
  });
});

describe("checkPrice", () => {
  const floors = { "Website Development": 300 };

  it("allows when no floor or no price", () => {
    expect(checkPrice(50, "Custom Software", floors).ok).toBe(true);
    expect(checkPrice(null, "Website Development", floors).ok).toBe(true);
  });

  it("allows a price at or above the floor", () => {
    expect(checkPrice(300, "Website Development", floors).ok).toBe(true);
    expect(checkPrice(450, "Website Development", floors).ok).toBe(true);
  });

  it("rejects a price below the floor with an explanatory message", () => {
    const r = checkPrice(120, "Website Development", floors);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.floor).toBe(300);
      expect(r.message).toContain("below your minimum");
    }
  });
});
