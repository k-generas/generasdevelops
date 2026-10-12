import { describe, it, expect } from "vitest";
import { inferLocation, classifyIndustry, RWANDA } from "./rwanda";
import { resolveField, sameBusiness } from "./provenance";

// Fixtures are synthetic — not real discovered companies.
describe("rwanda geography", () => {
  it("has 30 districts", () => expect(Object.values(RWANDA).flat()).toHaveLength(30));
  it("infers district and province from address", () => {
    expect(inferLocation("KG 11 Ave, Gasabo, Kigali")).toEqual({ province: "City of Kigali", district: "Gasabo" });
    expect(inferLocation("Main road, Gisenyi")).toEqual({ province: "Western Province", district: "Rubavu" });
    expect(inferLocation("Kigali, Rwanda")).toEqual({ province: "City of Kigali", district: null });
    expect(inferLocation(null)).toEqual({ province: null, district: null });
  });
  it("classifies industry or falls back to Other", () => {
    expect(classifyIndustry("dental_clinic")).toBe("Healthcare");
    expect(classifyIndustry("hardware_store")).toBe("Construction & property");
    expect(classifyIndustry("point_of_interest")).toBe("Other");
  });
});

describe("provenance", () => {
  const now = new Date("2026-10-12");
  const f = (value: unknown, source_name: string, source_type: any, d = "2026-10-01") =>
    ({ field: "employee_range", value, source_name, source_type, last_checked_at: d });
  it("unknown without facts", () => expect(resolveField([], now).status).toBe("unknown"));
  it("keeps conflicts", () => {
    const r = resolveField([f("10-49", "A", "website"), f("50-99", "B", "directory")], now);
    expect(r.status).toBe("conflicting");
    expect(r.values).toHaveLength(2);
  });
  it("AI never becomes verified", () =>
    expect(resolveField([f("10-49", "AI", "ai"), f("10-49", "AI2", "ai")], now).status).toBe("ai_inference"));
  it("multi-source and outdated", () => {
    expect(resolveField([f("x", "A", "website"), f("x", "B", "directory")], now).status).toBe("multi_source");
    expect(resolveField([f("x", "A", "website", "2024-01-01")], now).status).toBe("outdated");
  });
  it("dedupe requires a strong identifier", () => {
    expect(sameBusiness({ website: "https://www.x.rw" }, { website: "x.rw/contact" })).toBe(true);
    expect(sameBusiness({ phone: "+250 788 123 456" }, { phone: "0788123456" })).toBe(true);
    expect(sameBusiness({ place_id: "a" }, { place_id: "b", website: "x.rw" })).toBe(false);
    expect(sameBusiness({}, {})).toBe(false);
  });
});
