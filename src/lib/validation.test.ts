import { describe, expect, it } from "vitest";
import { canValidate, defaultPlan, readPlan } from "@/lib/validation";

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
  it("reads stored plans safely, falling back on garbage", () => {
    expect(readPlan(null, "fallback").hypothesis).toBe("fallback");
    expect(readPlan("nope", "fb").target).toBe("Ideal customer");
    const p = readPlan(
      { hypothesis: "H", cost_usd: 5, evidence: ["a", 2, "b"], outcome: "pass", target: 7 },
      "x",
    );
    expect(p.hypothesis).toBe("H");
    expect(p.cost_usd).toBe(5);
    expect(p.evidence).toEqual(["a", "b"]);
    expect(p.outcome).toBe("pass");
    expect(p.target).toBe("Ideal customer");
  });
});
