import { describe, expect, it } from "vitest";
import {
  businessIndustry,
  companySize,
  deriveObservedProblems,
  recommendServices,
  type IntelInput,
} from "./business-intel";

const AT = "2026-01-10T09:00:00.000Z";
const NOW = new Date("2026-01-10T09:05:00.000Z");

function input(over: Partial<IntelInput> = {}): IntelInput {
  return {
    business: { name: "Acme", category: "Restaurant", website: null, ...over.business },
    findings: over.findings ?? null,
    websiteCheck: over.websiteCheck,
    observedAt: over.observedAt ?? AT,
  };
}

describe("companySize", () => {
  it("maps headcount bands", () => {
    expect(companySize({ employees_max: 3 })).toBe("micro");
    expect(companySize({ employees_max: 20 })).toBe("small");
    expect(companySize({ employees_max: 120 })).toBe("medium");
    expect(companySize({ employees_max: 800 })).toBe("large");
    expect(companySize({})).toBe("unknown");
  });

  it("falls back to employees_min when max is missing", () => {
    expect(companySize({ employees_min: 15 })).toBe("small");
  });
});

describe("businessIndustry", () => {
  it("classifies from category text", () => {
    expect(businessIndustry({ category: "Software company" })).toBe("technology");
    expect(businessIndustry({ name: "Kigali Hotel" })).toBe("hospitality");
  });

  it("falls back to a stored industry key when category is unknown", () => {
    expect(businessIndustry({ category: "N/A", industry: "finance" })).toBe("finance");
  });

  it("ignores an invalid stored industry key", () => {
    expect(businessIndustry({ category: "N/A", industry: "not_a_sector" })).toBeNull();
  });
});

describe("deriveObservedProblems", () => {
  it("flags a double-checked missing website", () => {
    const problems = deriveObservedProblems(input({ websiteCheck: { confidence: "none_found" } }));
    expect(problems.map((p) => p.key)).toEqual(["no_website"]);
    expect(problems[0]!.severity).toBe("high");
  });

  it("does not flag a missing website unless it was confirmed", () => {
    expect(deriveObservedProblems(input())).toHaveLength(0);
  });

  it("reads measurable problems from a reachable site", () => {
    const problems = deriveObservedProblems(
      input({
        findings: {
          url: "https://x.rw",
          reachable: true,
          load_ms: 7000,
          has_viewport_meta: false,
          copyright_year: 2019,
          has_contact_form: false,
          has_email_link: false,
          has_whatsapp_link: false,
          has_online_booking_or_shop: false,
        },
      }),
    );
    const keys = problems.map((p) => p.key);
    expect(keys).toContain("slow_site");
    expect(keys).toContain("not_mobile");
    expect(keys).toContain("outdated_content");
    expect(keys).toContain("no_contact_channel");
    expect(keys).toContain("no_booking");
    expect(problems.find((p) => p.key === "slow_site")!.severity).toBe("high");
  });

  it("reports an unreachable site as a single high-severity problem", () => {
    const problems = deriveObservedProblems(
      input({ findings: { url: "https://x.rw", reachable: false, status: 502 } }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.key).toBe("slow_site");
    expect(problems[0]!.evidence).toContain("502");
  });

  it("finds nothing on a healthy, modern site", () => {
    const problems = deriveObservedProblems(
      input({
        findings: {
          url: "https://good.rw",
          reachable: true,
          load_ms: 900,
          has_viewport_meta: true,
          copyright_year: 2026,
          has_contact_form: true,
          has_online_booking_or_shop: true,
        },
      }),
    );
    expect(problems).toHaveLength(0);
  });
});

describe("recommendServices", () => {
  it("recommends an offer only when it addresses an observed problem", () => {
    const recs = recommendServices(
      input({ websiteCheck: { confidence: "none_found" } }),
      ["Website Development", "Bookkeeping"],
      NOW,
    );
    expect(recs.map((r) => r.offer)).toEqual(["Website Development"]);
    expect(recs[0]!.hypothesis).toBe(false);
  });

  it("marks an unknown-industry match as a hypothesis", () => {
    const recs = recommendServices(
      input({
        business: { name: "Acme", category: "Zzz", website: null },
        websiteCheck: { confidence: "none_found" },
      }),
      ["Website Development"],
      NOW,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]!.hypothesis).toBe(true);
    expect(recs[0]!.confidence).toBeLessThanOrEqual(0.59);
  });

  it("returns nothing when there are no problems", () => {
    expect(recommendServices(input(), ["Website Development"], NOW)).toHaveLength(0);
  });

  it("never recommends offers that map to no problem", () => {
    const recs = recommendServices(
      input({ findings: { url: "https://x.rw", reachable: true, load_ms: 8000 } }),
      ["Bookkeeping"],
      NOW,
    );
    expect(recs).toHaveLength(0);
  });
});
