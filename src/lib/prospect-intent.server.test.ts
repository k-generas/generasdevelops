import { describe, expect, it, vi } from "vitest";
import {
  PROSPECT_AI_SCHEMA,
  interpretProspectPromptWithAi,
  type ProspectAiCaller,
} from "./prospect-intent.server";

function aiResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    entityKind: "professional",
    filters: {
      query: "web developers",
      location: " Nairobi ",
      district: "",
      sector: "",
      stage: "",
      country: "Kenya",
      professionalType: "developer",
      availability: "open",
    },
    unsupported: ["recently funded"],
    ...overrides,
  });
}

describe("AI prospect interpretation orchestration", () => {
  it("returns validated AI filters while keeping unsupported conditions visible", async () => {
    const aiCall = vi.fn<ProspectAiCaller>(async () => aiResponse());

    const result = await interpretProspectPromptWithAi(
      "Find professional web developers in Nairobi that recently raised funding.",
      aiCall,
    );

    expect(aiCall).toHaveBeenCalledWith(
      expect.stringContaining("Do not invent"),
      "Prospecting request: Find professional web developers in Nairobi that recently raised funding.",
      "prospect_filters",
      PROSPECT_AI_SCHEMA,
    );
    expect(result.source).toBe("ai");
    expect(result.fallbackReason).toBeNull();
    expect(result.entityKind).toBe("professional");
    expect(result.filters.query).toBe("web");
    expect(result.filters.location).toBe("Nairobi");
    expect(result.filters.professionalType).toBe("");
    expect(result.filters.availability).toBe("open");
    expect(result.unsupported).toContain("recently raised");
  });

  it("falls back to rules when the AI provider fails", async () => {
    const aiCall = vi.fn<ProspectAiCaller>(async () => {
      throw new Error("AI is not configured (missing key).");
    });

    const result = await interpretProspectPromptWithAi(
      "Find dental clinics in Kigali with outdated websites.",
      aiCall,
    );

    expect(result.source).toBe("rules");
    expect(result.entityKind).toBe("business");
    expect(result.filters.query).toBe("dental");
    expect(result.filters.location).toBe("Kigali");
    expect(result.unsupported).toContain("outdated websites");
    expect(result.fallbackReason).toContain("AI interpretation was unavailable");
    expect(result.fallbackReason).toContain("missing key");
  });

  it("falls back to rules when the AI response is not valid JSON", async () => {
    const aiCall = vi.fn<ProspectAiCaller>(async () => "not json");

    const result = await interpretProspectPromptWithAi("Find marketing agencies in London", aiCall);

    expect(result.source).toBe("rules");
    expect(result.filters.query).toBe("marketing");
    expect(result.filters.location).toBe("London");
    expect(result.fallbackReason).toContain("AI interpretation was unavailable");
  });

  it("truncates long provider errors in the fallback reason", async () => {
    const aiCall = vi.fn<ProspectAiCaller>(async () => {
      throw new Error("x".repeat(400));
    });

    const result = await interpretProspectPromptWithAi("Find hotels in Kigali", aiCall);

    expect(result.source).toBe("rules");
    expect(result.fallbackReason?.length).toBeLessThan(330);
    expect(result.fallbackReason).toContain("...");
  });
});
