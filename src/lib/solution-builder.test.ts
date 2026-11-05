import { describe, expect, it } from "vitest";
import {
  allowedMaintenanceTransitions,
  buildSolutionRecommendations,
  canTransitionMaintenance,
  latestPromptPerPlatform,
  maintenanceCompletionError,
  validatePromptQuality,
  type PromptPlatform,
  type SolutionInput,
  type SolutionRecommendationDraft,
} from "./solution-builder";

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

function platformLine(platform: PromptPlatform): string {
  if (platform === "opencode")
    return "OpenCode: inspect this repository first, read the existing code, keep the diff focused, run the project tests and typecheck, and report anything unverified.";
  if (platform === "lovable")
    return "Lovable: build the pages and components in the Lovable workspace, use the preview to verify, then publish only after the checks pass.";
  if (platform === "google_ai_studio")
    return "Google AI Studio: use Gemini with a server-side API key, a structured model response, and an evaluation check for malformed output.";
  return "Developer implementation specification: give the developer the interfaces, data contracts, deliverables and acceptance tests.";
}

function completePrompt(platform: PromptPlatform): string {
  return `# Implementation brief

## Objective
Build the smallest confirmed solution for Kigali Salon.

## Business context
Kigali Salon is a beauty salon in Kigali with phone +250788000000.

## Verified facts
- The business name and phone were recorded in the business evidence.
- A double-checked website search found no website.

## Problem and evidence
- Verified fact: no website was found after the double-check.

## Users
- Local customers looking for salon services.
- The owner or staff member who receives enquiries.

## Requirements
- Must show the verified business name and phone.
- Must provide a mobile-ready contact action.
- Should include an empty state when no content is configured.
- Could add a location map only when the owner confirms the address.

## Pages and components
- Home page, contact page and enquiry component.

## User journeys
- A customer opens the home page, reviews the service context and contacts the business.
- A customer on a phone can complete the same path without signing in.

## Data and backend
- Store only validated enquiry fields and timestamps.
- No business fact is inferred by the backend.

## Frontend
- Build accessible forms with labels, focus states and visible validation errors.

## Integrations
- Use the verified phone link; no unconfirmed payment or booking integration.

## Auth, security and privacy
- Validate all input, sanitize displayed content and never expose a secret.
- The public flow requires no account; any owner view must enforce authentication and authorisation.

## Responsive design
- The layout must work at 360px and 1280px viewport widths.

## Error and empty states
- Show an empty state when no services are configured and a retryable error when submission fails.

## Tests
- Run the project tests and typecheck. Test the missing-field path and the successful enquiry path.

## Acceptance criteria
- The home page returns HTTP 200 in production.
- The layout works at 360px and 1280px.
- Invalid input shows an error and is not stored.
- Every displayed business fact is traceable to the evidence.

## Deployment
- Document environment variables and publish only after the checks pass.

## Assumptions and unknowns
- The owner's brand assets and budget are unknown.
- Services and prices must be supplied by the owner.

${platformLine(platform)}`;
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
    const prompt = `${completePrompt("opencode")}\nRebuild the site from scratch and replace the existing website.`;
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
    const quality = validatePromptQuality(completePrompt("lovable"), "lovable", ordering);
    expect(quality.checks.find((check) => check.key === "evidence")!.status).toBe("warn");
    expect(quality.pass).toBe(true);
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
