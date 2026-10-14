import { describe, expect, it } from "vitest";
import { businessSearchText, matchesBusinessSearch } from "@/lib/business-search";

describe("business search", () => {
  it("returns everything for an empty query", () => {
    expect(matchesBusinessSearch({ name: "Anything" }, "")).toBe(true);
    expect(matchesBusinessSearch({ name: "Anything" }, "   ")).toBe(true);
  });

  it("matches a plural query against a singular category", () => {
    const salon = { name: "Glam", category: "Hair salon" };
    expect(matchesBusinessSearch(salon, "salons")).toBe(true);
    expect(matchesBusinessSearch(salon, "salon")).toBe(true);
  });

  it("matches synonyms so 'salons' finds beauty records", () => {
    expect(matchesBusinessSearch({ name: "Elegance", category: "Beauty" }, "salons")).toBe(true);
    expect(matchesBusinessSearch({ name: "Fresh Cut", category: "Barber shop" }, "salons")).toBe(
      true,
    );
  });

  it("matches across name, category, address and industry", () => {
    const farm = {
      name: "Green Valley",
      category: "Landscaping",
      address: "Kigali, Rwanda",
      products_services: "garden design",
    };
    expect(matchesBusinessSearch(farm, "garden")).toBe(true);
    expect(matchesBusinessSearch(farm, "kigali")).toBe(true);
    expect(matchesBusinessSearch(farm, "gardens")).toBe(true);
  });

  it("ignores filler words in natural-language queries", () => {
    const farm = { name: "Green Valley", category: "Gardening" };
    expect(matchesBusinessSearch(farm, "garden based businesses")).toBe(true);
  });

  it("requires every meaningful token to match", () => {
    const farm = { name: "Green Valley Garden", category: "Agriculture" };
    expect(matchesBusinessSearch(farm, "garden kigali")).toBe(false);
    expect(matchesBusinessSearch(farm, "garden agriculture")).toBe(true);
  });

  it("does not match unrelated records", () => {
    expect(matchesBusinessSearch({ name: "City Bank", category: "Finance" }, "salons")).toBe(false);
  });

  it("builds a haystack that includes the derived industry label", () => {
    const text = businessSearchText({ name: "Kigali Works", category: "Steel factory" });
    expect(text).toContain("manufacturing");
  });
});
