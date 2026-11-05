import { describe, expect, it } from "vitest";
import {
  allowedStageTransitions,
  buildOpportunity,
  canMoveStage,
  gapsFromAuditEvidence,
  isTerminalStage,
  mergeGaps,
  solutionForGaps,
  stageRequiresConfirmedProblem,
  summarizeOpportunities,
  type OpportunityBuildInput,
  type OpportunityGap,
} from "./opportunity-engine";

const NOW = new Date("2026-11-05T10:00:00.000Z");

function gap(over: Partial<OpportunityGap> = {}): OpportunityGap {
  return {
    key: "no_online_store",
    category: "Sales channel",
    label: "No online ordering path",
    evidence: "Instagram bio says orders are handled only through WhatsApp DMs.",
    source: "instagram",
    verification_status: "single_source",
    confidence: 0.85,
    last_checked_at: "2026-11-04T09:00:00.000Z",
    ...over,
  };
}

function input(over: Partial<OpportunityBuildInput> = {}): OpportunityBuildInput {
  return {
    source: "social_match",
    social_lead_id: "lead-1",
    social_match_id: "match-1",
    business_id: "biz-1",
    business_name: "Kigali Fashion Boutique",
    business_category: "Fashion & apparel",
    business_district: "Gasabo",
    business_website: "https://kigalifashion.rw",
    business_phone: "+250788123456",
    lead_handle: "kigalifashionboutique",
    lead_platform: "instagram",
    account_type: "confirmed_business",
    source_status: "confirmed",
    source_confidence: 0.95,
    gaps: [gap()],
    observed_at: "2026-11-05T09:00:00.000Z",
    has_contact: true,
    is_target_location: true,
    ...over,
  };
}

describe("opportunity build", () => {
  it("builds a scored draft from a confirmed social match with evidence", () => {
    const draft = buildOpportunity(input(), NOW);
    expect(draft).not.toBeNull();
    expect(draft?.business_id).toBe("biz-1");
    expect(draft?.relevant_service).toBe("DukaLinka");
    expect(draft?.confidence).toBeGreaterThan(0.6);
    expect(draft?.score).toBeGreaterThan(0);
    expect(draft?.dedupe_key).toBe("social:match-1");
    expect(draft?.questionnaire.length).toBeGreaterThan(0);
  });

  it("refuses to invent an opportunity without usable evidence", () => {
    expect(buildOpportunity(input({ gaps: [] }), NOW)).toBeNull();
    expect(
      buildOpportunity(
        input({
          gaps: [gap({ evidence: "", verification_status: "unknown", confidence: 0.9 })],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("caps confidence when the social match is only possible", () => {
    const draft = buildOpportunity(
      input({ source_status: "possible", source_confidence: 0.4 }),
      NOW,
    );
    expect(draft?.confidence).toBeLessThanOrEqual(0.6);
    expect(draft?.needs_verification).toBe(true);
  });

  it("does not call an opportunity high priority when confidence is weak", () => {
    const draft = buildOpportunity(
      input({
        source_status: "possible",
        source_confidence: 0.35,
        gaps: [gap({ confidence: 0.42, verification_status: "ai_inference" })],
      }),
      NOW,
    );
    expect(draft?.priority).not.toBe("critical");
    expect(draft?.needs_verification).toBe(true);
  });

  it("marks old evidence as needing re-checking", () => {
    const draft = buildOpportunity(
      input({ gaps: [gap({ last_checked_at: "2026-01-01T00:00:00.000Z" })] }),
      NOW,
    );
    expect(draft?.score_reasons.join(" ")).toMatch(/old|re-check|stale/i);
  });
});

describe("solution mapping", () => {
  it("maps several gaps to multiple service fits, including a custom hypothesis", () => {
    const fits = solutionForGaps([
      gap(),
      gap({
        key: "no_website",
        category: "Digital presence",
        label: "No website",
        confidence: 0.9,
      }),
    ]);
    expect(fits.map((fit) => fit.solution)).toEqual(
      expect.arrayContaining(["DukaLinka", "GENERAS Digital", "Custom software"]),
    );
    expect(fits.find((fit) => fit.solution === "Custom software")?.hypothesis).toBe(true);
  });

  it("does not offer a service when no recorded gap supports it", () => {
    const fits = solutionForGaps([gap({ key: "not_mobile" })]);
    expect(fits.map((fit) => fit.solution)).toEqual(["GENERAS Digital"]);
  });
});

describe("gap merging and audit evidence", () => {
  it("keeps the stronger duplicate gap", () => {
    const merged = mergeGaps(
      [gap({ confidence: 0.5, evidence: "Old evidence" })],
      [gap({ confidence: 0.9, evidence: "New evidence" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.evidence).toBe("New evidence");
  });

  it("converts observed audit issues to factual gaps and ignores observations without an issue", () => {
    const gaps = gapsFromAuditEvidence([
      {
        category: "technical",
        check: "reachability",
        status: "OBSERVED",
        severity: "CRITICAL",
        evidence: "Site unreachable (status 404)",
        source: "probe",
        observed_at: "2026-11-05T09:00:00.000Z",
        confidence: 0.9,
      },
      {
        category: "technical",
        check: "mobile_viewport",
        status: "OBSERVED",
        severity: "LOW",
        evidence: "Viewport meta tag present",
        source: "probe",
        observed_at: "2026-11-05T09:00:00.000Z",
        confidence: 0.9,
      },
      {
        category: "conversion",
        check: "booking_ordering",
        status: "INFERRED",
        severity: "MEDIUM",
        evidence: "No booking/shop signals detected",
        source: "probe",
        observed_at: "2026-11-05T09:00:00.000Z",
        confidence: 0.6,
      },
    ]);
    expect(gaps.map((item) => item.key)).toEqual(["dead_website", "no_booking"]);
    expect(gaps.find((item) => item.key === "dead_website")?.verification_status).toBe(
      "single_source",
    );
    expect(gaps.find((item) => item.key === "no_booking")?.verification_status).toBe(
      "ai_inference",
    );
  });
});

describe("qualification workflow", () => {
  it("allows only documented stage transitions", () => {
    expect(canMoveStage("DISCOVERED", "NEEDS_VALIDATION")).toBe(true);
    expect(canMoveStage("DISCOVERED", "QUALIFIED")).toBe(false);
    expect(canMoveStage("QUALIFIED", "READY_TO_PROPOSE")).toBe(true);
    expect(allowedStageTransitions("VALIDATION_IN_PROGRESS")).toContain("QUALIFIED");
  });

  it("requires a confirmed problem before qualifying and treats WON as terminal", () => {
    expect(stageRequiresConfirmedProblem("QUALIFIED")).toBe(true);
    expect(stageRequiresConfirmedProblem("READY_TO_PROPOSE")).toBe(true);
    expect(stageRequiresConfirmedProblem("DISCOVERED")).toBe(false);
    expect(isTerminalStage("WON")).toBe(true);
    expect(isTerminalStage("QUALIFIED")).toBe(false);
  });

  it("summarizes validation and commercial pipeline counts", () => {
    const summary = summarizeOpportunities([
      { qualification_stage: "QUALIFIED", priority: "high", validation_status: "CONFIRMED" },
      {
        qualification_stage: "READY_TO_PROPOSE",
        priority: "critical",
        validation_status: "CONFIRMED",
      },
      { qualification_stage: "DISCOVERED", priority: "low", validation_status: "UNKNOWN" },
      { qualification_stage: "WON", priority: "medium", validation_status: "CONFIRMED" },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.needs_validation).toBe(1);
    expect(summary.qualified).toBe(1);
    expect(summary.ready_to_propose).toBe(1);
    expect(summary.high_priority).toBe(2);
    expect(summary.won).toBe(1);
  });
});
