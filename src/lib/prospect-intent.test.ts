import { describe, expect, it } from "vitest";
import { interpretProspectPromptRules, validateAiProspectInterpretation } from "./prospect-intent";

describe("rule-based prospect interpretation", () => {
  it("interprets a business prompt with a place and an unsupported website condition", () => {
    const result = interpretProspectPromptRules(
      "Find independent dental clinics in Kigali with outdated websites.",
    );
    expect(result.entityKind).toBe("business");
    expect(result.filters.query).toBe("dental");
    expect(result.filters.location).toBe("Kigali");
    expect(result.unsupported).toContain("outdated websites");
    expect(result.warnings.join(" ")).toContain("Unsupported conditions were not applied");
    expect(result.source).toBe("rules");
  });

  it("interprets marketing agencies and keeps white-label as unsupported", () => {
    const result = interpretProspectPromptRules(
      "Find marketing agencies in London that may need white-label delivery.",
    );
    expect(result.entityKind).toBe("business");
    expect(result.filters.query).toBe("marketing");
    expect(result.filters.location).toBe("London");
    expect(result.unsupported).toContain("white-label");
  });

  it("interprets fintech startups without pretending to filter funding signals", () => {
    const result = interpretProspectPromptRules(
      "Find fintech startups in Singapore that recently raised funding.",
    );
    expect(result.entityKind).toBe("business");
    expect(result.filters.query).toBe("fintech");
    expect(result.filters.location).toBe("Singapore");
    expect(result.unsupported).toContain("recently raised");
    expect(result.unsupported).toContain("raised funding");
  });

  it("interprets professionals and flags the missing developer type", () => {
    const result = interpretProspectPromptRules(
      "Find professional web developers in Nairobi interested in subcontract work.",
    );
    expect(result.entityKind).toBe("professional");
    expect(result.filters.query).toBe("web");
    expect(result.filters.location).toBe("Nairobi");
    expect(result.filters.professionalType).toBe("");
    expect(result.unsupported).toContain("subcontract");
    expect(result.warnings.join(" ")).toContain("Developer is not a professional type");
  });

  it("keeps the audience noun as a fallback keyword", () => {
    const result = interpretProspectPromptRules(
      "Find hotels in Cape Town with weak booking experiences.",
    );
    expect(result.filters.query).toBe("hotel");
    expect(result.filters.location).toBe("Cape Town");
    expect(result.unsupported).toContain("weak booking experiences");
  });

  it("maps business outreach stages", () => {
    const result = interpretProspectPromptRules("Find contacted dental clinics in Kigali");
    expect(result.filters.query).toBe("dental");
    expect(result.filters.stage).toBe("messaged");
  });

  it("prefers the not-contacted stage over the contacted stage", () => {
    expect(interpretProspectPromptRules("Find not contacted hotels").filters.stage).toBe(
      "not_contacted",
    );
  });

  it("maps professional type and availability", () => {
    const result = interpretProspectPromptRules("Find consultants available for work in Kenya");
    expect(result.entityKind).toBe("professional");
    expect(result.filters.location).toBe("Kenya");
    expect(result.filters.professionalType).toBe("consultant");
    expect(result.filters.availability).toBe("open");
  });

  it("does not treat interested-in phrases as a location", () => {
    const result = interpretProspectPromptRules(
      "Find engineers interested in contract work in Kigali",
    );
    expect(result.entityKind).toBe("professional");
    expect(result.filters.location).toBe("Kigali");
  });

  it("rejects an empty prompt", () => {
    expect(() => interpretProspectPromptRules("   ")).toThrow(
      "Describe the audience you want to find.",
    );
  });
});

describe("AI prospect interpretation validation", () => {
  it("normalises AI filters and rejects unsupported taxonomy values", () => {
    const result = validateAiProspectInterpretation(
      {
        entityKind: "professional",
        filters: {
          query: "web developers",
          location: " Nairobi ",
          district: "ignored",
          stage: "contacted",
          professionalType: "wizard",
          availability: "open",
          country: "Kenya",
        },
        unsupported: ["recently funded"],
      },
      "Find professional web developers in Nairobi.",
    );
    expect(result.source).toBe("ai");
    expect(result.entityKind).toBe("professional");
    expect(result.filters.query).toBe("web");
    expect(result.filters.location).toBe("Nairobi");
    expect(result.filters.district).toBe("");
    expect(result.filters.stage).toBe("");
    expect(result.filters.professionalType).toBe("");
    expect(result.filters.availability).toBe("open");
    expect(result.filters.country).toBe("Kenya");
    expect(result.unsupported).toContain("recently funded");
    expect(result.warnings.join(" ")).toContain(
      "Professional lists do not use the business outreach stage filter",
    );
    expect(result.warnings.join(" ")).toContain("Ignored unsupported professional type");
  });

  it("defaults an invalid audience to businesses and clears professional-only filters", () => {
    const result = validateAiProspectInterpretation(
      {
        entityKind: "unknown",
        filters: {
          query: "dental",
          location: "Kigali",
          professionalType: "consultant",
          availability: "open",
        },
      },
      "Find dental clinics in Kigali.",
    );
    expect(result.entityKind).toBe("business");
    expect(result.filters.professionalType).toBe("");
    expect(result.filters.availability).toBe("");
    expect(result.warnings.join(" ")).toContain("unknown audience");
  });
});
