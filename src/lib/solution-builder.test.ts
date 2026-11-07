import { describe, expect, it } from "vitest";
import {
  allowedMaintenanceTransitions,
  buildSolutionRecommendations,
  canTransitionMaintenance,
  classifySolutionRequest,
  latestPromptPerPlatform,
  maintenanceCompletionError,
  validatePromptQuality,
  type PromptPlatform,
  type SolutionInput,
  type SolutionRecommendationDraft,
} from "./solution-builder";
import { buildPlatformPrompt } from "./solution-prompts";

const AT = "2026-11-05T10:00:00.000Z";

function input(over: Partial<SolutionInput> = {}): SolutionInput {
  return {
    business: {
      id: "biz-1",
      name: "Kigali Salon",
      category: "Beauty salon",
      website: null,
      website_check: { confidence: "none_found", source: "probe" },
      business_status: "OPERATIONAL",
      phone: "+250788000000",
      ...over.business,
    },
    findings: over.findings ?? null,
    report: over.report ?? null,
    observedAt: over.observedAt ?? AT,
    investigationId: over.investigationId ?? "inv-1",
    opportunity: over.opportunity ?? null,
  };
}

function completePrompt(
  platform: PromptPlatform,
  recommendation = buildSolutionRecommendations(input())[0]!,
): string {
  return buildPlatformPrompt({ business: input().business, recommendation }, platform);
}

describe("buildSolutionRecommendations", () => {
  it("recommends a new website only after a double-checked missing website", () => {
    const rows = buildSolutionRecommendations(input());
    const website = rows.find((row) => row.solution_type === "website_new");
    expect(website).toBeDefined();
    expect(website!.hypothesis).toBe(false);
    expect(website!.evidence.some((item) => item.kind === "verified_fact")).toBe(true);
    expect(website!.maintenance_required).toBe(false);
  });

  it("does not claim a missing website when the search was not confirmed", () => {
    const rows = buildSolutionRecommendations(
      input({ business: { ...input().business, website_check: null } }),
    );
    expect(rows.some((row) => row.solution_type === "website_new")).toBe(false);
  });

  it("returns no recommendations for a permanently closed business", () => {
    const rows = buildSolutionRecommendations(
      input({ business: { ...input().business, business_status: "CLOSED_PERMANENTLY" } }),
    );
    expect(rows).toEqual([]);
  });

  it("recommends repair and maintenance for a reachable site with measured issues", () => {
    const rows = buildSolutionRecommendations(
      input({
        business: {
          ...input().business,
          website: "https://salon.rw",
          website_check: { confidence: "verified", source: "business" },
        },
        findings: {
          url: "https://salon.rw",
          reachable: true,
          https: false,
          load_ms: 7200,
          has_viewport_meta: false,
          has_contact_form: false,
          has_email_link: false,
          has_whatsapp_link: false,
          has_online_booking_or_shop: false,
          copyright_year: 2018,
        },
      }),
    );
    expect(rows.map((row) => row.solution_type)).toContain("website_repair");
    expect(rows.map((row) => row.solution_type)).toContain("maintenance");
    const repair = rows.find((row) => row.solution_type === "website_repair")!;
    expect(repair.evidence.map((item) => item.label)).toContain("Website loads slowly");
    expect(repair.hypothesis).toBe(false);
  });

  it("does not recommend repair for a healthy site without recorded findings", () => {
    const rows = buildSolutionRecommendations(
      input({
        business: {
          ...input().business,
          website: "https://salon.rw",
          website_check: { confidence: "verified", source: "business" },
        },
        findings: {
          url: "https://salon.rw",
          reachable: true,
          https: true,
          load_ms: 400,
          has_viewport_meta: true,
          has_contact_form: true,
          has_email_link: true,
          has_whatsapp_link: true,
          has_online_booking_or_shop: true,
          copyright_year: 2026,
        },
      }),
    );
    expect(rows.some((row) => row.solution_type === "website_repair")).toBe(false);
    expect(rows.some((row) => row.solution_type === "maintenance")).toBe(false);
  });

  it("does not turn an unrelated opportunity gap into a website repair", () => {
    const rows = buildSolutionRecommendations(
      input({
        business: {
          ...input().business,
          website: "https://salon.rw",
          website_check: { confidence: "verified", source: "business" },
        },
        findings: {
          url: "https://salon.rw",
          reachable: true,
          https: true,
          load_ms: 400,
          has_viewport_meta: true,
          has_contact_form: true,
          has_email_link: true,
          has_whatsapp_link: true,
          has_online_booking_or_shop: true,
          copyright_year: 2026,
        },
        opportunity: {
          id: "opp-1",
          relevant_service: "Custom software",
          identified_problem: "Orders are tracked in a notebook.",
          validation_status: "CONFIRMED",
          qualification_stage: "QUALIFIED",
          gaps: [
            {
              key: "no_contact_capture",
              category: "Contact capture",
              label: "No contact capture",
              evidence: "Enquiries are copied into a notebook.",
              source: "owner interview",
              verification_status: "officially_verified",
              confidence: 0.9,
              last_checked_at: AT,
            },
          ],
        },
      }),
    );
    expect(rows.some((row) => row.solution_type === "website_repair")).toBe(false);
    expect(rows.some((row) => row.solution_type === "maintenance")).toBe(false);
    expect(rows.some((row) => row.solution_type === "custom_system")).toBe(true);
  });

  it("keeps a retail ordering recommendation labelled as a hypothesis", () => {
    const rows = buildSolutionRecommendations(
      input({
        business: {
          ...input().business,
          category: "Fashion boutique",
          website: "https://shop.rw",
        },
        findings: {
          url: "https://shop.rw",
          reachable: true,
          https: true,
          load_ms: 600,
          has_viewport_meta: true,
          has_contact_form: true,
          has_email_link: true,
          has_whatsapp_link: true,
          has_online_booking_or_shop: false,
        },
      }),
    );
    const ordering = rows.find((row) => row.solution_type === "ordering_ecommerce");
    expect(ordering).toBeDefined();
    expect(ordering!.hypothesis).toBe(true);
    expect(ordering!.evidence.some((item) => item.kind === "hypothesis")).toBe(true);
  });

  it("recommends booking only for appointment-like categories", () => {
    const booking = buildSolutionRecommendations(
      input({
        business: { ...input().business, website: "https://salon.rw" },
        findings: {
          url: "https://salon.rw",
          reachable: true,
          has_online_booking_or_shop: false,
        },
      }),
    );
    expect(booking.some((row) => row.solution_type === "booking_appointments")).toBe(true);

    const unrelated = buildSolutionRecommendations(
      input({
        business: {
          ...input().business,
          category: "Software company",
          website: "https://software.rw",
        },
        findings: {
          url: "https://software.rw",
          reachable: true,
          has_online_booking_or_shop: false,
        },
      }),
    );
    expect(unrelated.some((row) => row.solution_type === "booking_appointments")).toBe(false);
    expect(unrelated.some((row) => row.solution_type === "ordering_ecommerce")).toBe(false);
  });

  it("marks an unconfirmed opportunity system recommendation as a hypothesis", () => {
    const rows = buildSolutionRecommendations(
      input({
        opportunity: {
          id: "opp-1",
          relevant_service: "GENERAS Systems",
          identified_problem: "Orders are tracked in a notebook and messages are lost.",
          validation_status: "UNKNOWN",
          qualification_stage: "NEEDS_VALIDATION",
          gaps: [
            {
              key: "no_contact_capture",
              category: "Contact capture",
              label: "No contact capture",
              evidence: "The owner confirmed enquiries are copied into a notebook.",
              source: "owner interview",
              verification_status: "single_source",
              confidence: 0.8,
              last_checked_at: AT,
            },
          ],
        },
      }),
    );
    const system = rows.find((row) => row.solution_type === "custom_system");
    expect(system).toBeDefined();
    expect(system!.hypothesis).toBe(true);
  });

  it("removes the hypothesis label only after the opportunity is confirmed", () => {
    const rows = buildSolutionRecommendations(
      input({
        opportunity: {
          id: "opp-1",
          relevant_service: "Custom software",
          identified_problem: "Orders are tracked in a notebook and messages are lost.",
          validation_status: "CONFIRMED",
          qualification_stage: "QUALIFIED",
          gaps: [
            {
              key: "social_checkout_not_owned",
              category: "Sales channel",
              label: "Checkout is not owned",
              evidence: "The owner confirmed orders are handled only in DMs.",
              source: "owner interview",
              verification_status: "officially_verified",
              confidence: 0.95,
              last_checked_at: AT,
            },
          ],
        },
      }),
    );
    const system = rows.find((row) => row.solution_type === "custom_system");
    expect(system).toBeDefined();
    expect(system!.hypothesis).toBe(false);
  });

  it("produces unique dedupe keys and solution types", () => {
    const rows = buildSolutionRecommendations(input());
    const keys = rows.map((row) => row.dedupe_key);
    const types = rows.map((row) => row.solution_type);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(types).size).toBe(types.length);
  });

  it("includes prescriptive requirements and acceptance criteria", () => {
    const [website] = buildSolutionRecommendations(input());
    const requirements = website!.requirements.flatMap((group) => group.items);
    expect(requirements.length).toBeGreaterThanOrEqual(4);
    expect(requirements.every((item) => item.acceptance_criteria.length > 0)).toBe(true);
    expect(requirements.some((item) => item.priority === "must")).toBe(true);
  });
});

describe("maintenance lifecycle", () => {
  it("allows the documented forward transitions", () => {
    expect(allowedMaintenanceTransitions("recommended")).toEqual(["accepted", "cancelled"]);
    expect(canTransitionMaintenance("accepted", "scheduled")).toBe(true);
    expect(canTransitionMaintenance("scheduled", "in_progress")).toBe(true);
    expect(canTransitionMaintenance("in_progress", "completed")).toBe(true);
    expect(canTransitionMaintenance("cancelled", "recommended")).toBe(true);
  });

  it("rejects skipped or reversed transitions", () => {
    expect(canTransitionMaintenance("recommended", "completed")).toBe(false);
    expect(canTransitionMaintenance("completed", "in_progress")).toBe(false);
    expect(canTransitionMaintenance("scheduled", "accepted")).toBe(false);
  });

  it("requires completion evidence before closing a record", () => {
    expect(maintenanceCompletionError("completed", "")).toBeTruthy();
    expect(maintenanceCompletionError("completed", "   ")).toBeTruthy();
    expect(
      maintenanceCompletionError("completed", "Uptime and contact links checked 2026-11-05."),
    ).toBe(null);
  });
});

describe("prompt quality validator", () => {
  function recommendation(
    over: Partial<SolutionRecommendationDraft> = {},
  ): SolutionRecommendationDraft {
    const base = buildSolutionRecommendations(input())[0]!;
    return { ...base, ...over };
  }

  it("accepts a complete platform prompt", () => {
    for (const platform of ["opencode", "lovable", "google_ai_studio", "developer_spec"] as const) {
      const quality = validatePromptQuality(completePrompt(platform), platform, recommendation());
      expect(quality.pass).toBe(true);
      expect(quality.score).toBe(100);
    }
  });

  it("fails when required sections are missing", () => {
    const quality = validatePromptQuality(
      "## Objective\nBuild a page.",
      "opencode",
      recommendation(),
    );
    expect(quality.pass).toBe(false);
    expect(quality.checks.find((check) => check.key === "sections")!.status).toBe("fail");
  });

  it("fails a repair prompt that calls for a rebuild", () => {
    const repair = buildSolutionRecommendations(
      input({
        business: { ...input().business, website: "https://salon.rw" },
        findings: { url: "https://salon.rw", reachable: false, status: 500 },
      }),
    ).find((row) => row.solution_type === "website_repair")!;
    const prompt = `${completePrompt("opencode", repair)}\nRebuild the site from scratch and replace the existing website.`;
    const quality = validatePromptQuality(prompt, "opencode", repair);
    expect(quality.pass).toBe(false);
    expect(quality.checks.find((check) => check.key === "contradiction")!.status).toBe("fail");
  });

  it("fails when platform-specific workflow terms are absent", () => {
    const quality = validatePromptQuality(
      completePrompt("opencode"),
      "google_ai_studio",
      recommendation(),
    );
    expect(quality.pass).toBe(false);
    expect(quality.checks.find((check) => check.key === "platform")!.status).toBe("fail");
  });

  it("fails a recommendation with no evidence", () => {
    const quality = validatePromptQuality(
      completePrompt("lovable"),
      "lovable",
      recommendation({ evidence: [] }),
    );
    expect(quality.pass).toBe(false);
    expect(quality.checks.find((check) => check.key === "evidence")!.status).toBe("fail");
  });

  it("warns but can still pass when hypotheses remain labelled", () => {
    const rows = buildSolutionRecommendations(
      input({
        business: { ...input().business, category: "Fashion boutique", website: "https://shop.rw" },
        findings: {
          url: "https://shop.rw",
          reachable: true,
          has_online_booking_or_shop: false,
        },
      }),
    );
    const ordering = rows.find((row) => row.solution_type === "ordering_ecommerce")!;
    const quality = validatePromptQuality(completePrompt("lovable", ordering), "lovable", ordering);
    expect(quality.checks.find((check) => check.key === "evidence")!.status).toBe("warn");
    expect(quality.pass).toBe(true);
  });
});

describe("intent classification and website generation", () => {
  function websiteRecommendation(
    over: Partial<SolutionRecommendationDraft> = {},
  ): SolutionRecommendationDraft {
    return { ...buildSolutionRecommendations(input())[0]!, ...over };
  }

  it("classifies a construction materials recommendation as CREATE, not an audit app", () => {
    const business = {
      ...input().business,
      name: "Kigali Construction Materials",
      category: "Building materials supplier",
    };
    const recommendation = buildSolutionRecommendations(input({ business })).find(
      (row) => row.solution_type === "website_new",
    )!;
    expect(recommendation.intent).toBe("CREATE");
    expect(recommendation.requested_deliverable).toBe("business_website");

    const prompt = buildPlatformPrompt({ business, recommendation }, "google_ai_studio");
    expect(prompt).toContain("Build a complete, responsive, customer-facing website");
    expect(prompt).toContain("Products and materials");
    expect(prompt).toContain("Intent: CREATE");
    expect(prompt).toContain("Requested deliverable: Customer-facing business website");
    expect(prompt).not.toMatch(/use Gemini with a server-side API key/i);
    expect(validatePromptQuality(prompt, "google_ai_studio", recommendation).pass).toBe(true);
  });

  it("gives an explicit client website request priority over the recommendation type", () => {
    const classification = classifySolutionRequest({
      solution_type: "other",
      requested_outcome: "Build a customer-facing website demo for this supplier.",
    });
    expect(classification.intent).toBe("CREATE");
    expect(classification.requested_deliverable).toBe("business_website");
    expect(classification.ambiguous).toBe(false);
  });

  it("keeps repair prompts focused on the existing website", () => {
    const rows = buildSolutionRecommendations(
      input({
        business: { ...input().business, website: "https://salon.rw" },
        findings: { url: "https://salon.rw", reachable: false, status: 500 },
      }),
    );
    const repair = rows.find((row) => row.solution_type === "website_repair")!;
    expect(repair.intent).toBe("REPAIR");
    const prompt = buildPlatformPrompt(
      { business: input().business, recommendation: repair },
      "opencode",
    );
    expect(prompt).toContain("Repair the existing website");
    expect(validatePromptQuality(prompt, "opencode", repair).pass).toBe(true);
  });

  it("classifies adding ordering to an existing site as IMPROVE", () => {
    const classification = classifySolutionRequest({
      solution_type: "ordering_ecommerce",
      has_website: true,
    });
    expect(classification.intent).toBe("IMPROVE");
    const recommendation = websiteRecommendation({
      solution_type: "ordering_ecommerce",
      intent: classification.intent,
      requested_deliverable: classification.requested_deliverable,
    });
    const prompt = buildPlatformPrompt({ business: input().business, recommendation }, "lovable");
    expect(prompt).toContain("Improve the existing website");
    expect(validatePromptQuality(prompt, "lovable", recommendation).pass).toBe(true);
  });

  it.each([
    ["ANALYZE", "Audit our online presence and prioritise improvements.", "analysis", "analysis"],
    ["AUTOMATE", "Automate quote follow-up and customer reminders.", "automation", "automation"],
    ["MAINTAIN", "Maintain the website and keep it secure.", "website_maintenance", "maintenance"],
  ] as const)(
    "produces a %s deliverable instead of a website",
    (intent, outcome, deliverable, expectedText) => {
      const classification = classifySolutionRequest({
        solution_type: "other",
        requested_outcome: outcome,
      });
      expect(classification.intent).toBe(intent);
      expect(classification.requested_deliverable).toBe(deliverable);
      const recommendation = websiteRecommendation({
        intent: classification.intent,
        requested_deliverable: classification.requested_deliverable,
      });
      const prompt = buildPlatformPrompt(
        { business: input().business, recommendation },
        "developer_spec",
      );
      expect(prompt).toContain(`Intent: ${intent}`);
      expect(prompt.toLowerCase()).toContain(expectedText);
      expect(validatePromptQuality(prompt, "developer_spec", recommendation).pass).toBe(true);
    },
  );

  it("asks for clarification when the client request is ambiguous", () => {
    const classification = classifySolutionRequest({
      solution_type: "other",
      requested_outcome: "Not sure, maybe a website or an audit.",
    });
    expect(classification.ambiguous).toBe(true);
    expect(classification.clarification).toMatch(/clarify/i);
  });

  it("rejects a website prompt that drifts into an auditing application", () => {
    const recommendation = websiteRecommendation();
    const prompt = buildPlatformPrompt(
      { business: input().business, recommendation },
      "google_ai_studio",
    ).replace(
      "The target deliverable is the website itself.",
      "Build an AI content auditing application as the primary deliverable.",
    );
    const quality = validatePromptQuality(prompt, "google_ai_studio", recommendation);
    expect(quality.pass).toBe(false);
    expect(quality.checks.find((check) => check.key === "deliverable")!.status).toBe("fail");
  });

  it("includes verified facts and missing information without inventing prices", () => {
    const business = {
      ...input().business,
      name: "Kigali Construction Materials",
      category: "Building materials supplier",
      phone: null,
    };
    const recommendation = buildSolutionRecommendations(input({ business })).find(
      (row) => row.solution_type === "website_new",
    )!;
    const prompt = buildPlatformPrompt({ business, recommendation }, "opencode");
    expect(prompt).toContain("## J. Missing information");
    expect(prompt).toContain("prices");
    expect(prompt).not.toContain("+250788000000");
  });
});

describe("latestPromptPerPlatform", () => {
  it("returns only the newest ready version for each platform", () => {
    const rows = latestPromptPerPlatform([
      { id: "a1", platform: "opencode", version: 1 },
      { id: "a2", platform: "opencode", version: 2 },
      { id: "b1", platform: "lovable", version: 1 },
      { id: "c1", platform: "developer_spec", version: 3 },
    ]);
    expect(rows).toEqual([
      { id: "a2", platform: "opencode", version: 2 },
      { id: "b1", platform: "lovable", version: 1 },
      { id: "c1", platform: "developer_spec", version: 3 },
    ]);
  });

  it("ignores unknown platforms and preserves canonical platform order", () => {
    const rows = latestPromptPerPlatform([
      { id: "x", platform: "unknown", version: 9 },
      { id: "g", platform: "google_ai_studio", version: 1 },
      { id: "o", platform: "opencode", version: 1 },
    ]);
    expect(rows.map((row) => row.platform)).toEqual(["opencode", "google_ai_studio"]);
  });
});
