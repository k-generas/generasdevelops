import { describe, expect, it } from "vitest";
import {
  ALL_DISTRICTS,
  DISTRICTS,
  classifyIndustry,
  industryLabel,
  matchesLocation,
  normalizeDistrict,
  normalizeProvince,
  parseLocation,
  provinceOfDistrict,
  PROVINCES,
} from "@/lib/rwanda";

describe("rwanda taxonomy", () => {
  it("has 5 provinces and 30 districts", () => {
    expect(PROVINCES.length).toBe(5);
    expect(ALL_DISTRICTS.length).toBe(30);
    expect(new Set(ALL_DISTRICTS).size).toBe(30);
  });

  it("maps a district to its province", () => {
    expect(provinceOfDistrict("Gasabo")).toBe("Kigali City");
    expect(provinceOfDistrict("musanze")).toBe("Northern");
    expect(provinceOfDistrict("Rubavu")).toBe("Western");
  });

  it("normalises provinces including Kinyarwanda aliases", () => {
    expect(normalizeProvince("Amajyaruguru")).toBe("Northern");
    expect(normalizeProvince("Umujyi wa Kigali")).toBe("Kigali City");
    expect(normalizeProvince("nowhere")).toBeNull();
  });

  it("parses a free address without guessing", () => {
    expect(parseLocation("KN 4 Ave, Kicukiro, Kigali")).toEqual({
      province: "Kigali City",
      district: "Kicukiro",
    });
    expect(parseLocation("Gicumbi")).toEqual({ province: "Northern", district: "Gicumbi" });
    expect(parseLocation("some unknown place")).toEqual({ province: null, district: null });
    expect(parseLocation(null)).toEqual({ province: null, district: null });
  });

  it("classifies industries by keyword and labels them", () => {
    expect(classifyIndustry("Software development")).toBe("technology");
    expect(classifyIndustry("Coffee processing plant")).toBe("agriculture");
    expect(classifyIndustry("Hospital")).toBe("health");
    expect(classifyIndustry("")).toBeNull();
    expect(industryLabel("technology")).toContain("Technology");
  });

  it("filters by location using stored fields or address fallback", () => {
    const b = { district: null, province: null, address: "Musanze, Northern" };
    expect(matchesLocation(b, { district: "Musanze" })).toBe(true);
    expect(matchesLocation(b, { province: "Western" })).toBe(false);
    expect(
      matchesLocation({ province: "Kigali City", district: null }, { province: "Kigali City" }),
    ).toBe(true);
    expect(matchesLocation(b, {})).toBe(true);
  });

  it("every district list belongs to exactly one province", () => {
    for (const p of PROVINCES) {
      for (const d of DISTRICTS[p]) expect(provinceOfDistrict(d)).toBe(p);
    }
  });

  it("normalises district casing", () => {
    expect(normalizeDistrict("  NYANZA ")).toBe("Nyanza");
    expect(normalizeDistrict("Kigali")).toBeNull();
  });
});
