import { describe, expect, it } from "vitest";
import { canValidate, defaultPlan } from "@/lib/validation";

describe("validation", () => {
  it("creates sensible default plan", () => {
    const p = defaultPlan("Businesses need X");
    expect(p.hypothesis).toContain("Businesses need X");
    expect(p.cheapest_method).toMatch(/interview/i);
  });
  it("enforces low-cost rule", () => {
    const p = defaultPlan("test");
    expect(canValidate(p)).toBe(true);
    p.cost_usd = 200;
    expect(canValidate(p)).toBe(false);
  });
});
