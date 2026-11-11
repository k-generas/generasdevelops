import { describe, expect, it } from "vitest";
import type { OutreachEligibility } from "./compliance";
import {
  campaignDedupeKey,
  campaignStatusLabel,
  campaignSummary,
  campaignTargetDedupeKey,
  canApproveQueueItem,
  canMarkQueueSent,
  canTransitionQueue,
  ensureOptOutRoute,
  queueStatusFromEligibility,
  queueStatusLabel,
  renderCampaignDraft,
  renderTemplate,
  stepDelayLabel,
  templateVariables,
  validateCampaign,
  type CampaignStepInput,
  type CampaignTarget,
} from "./campaign";

function eligibility(status: "allowed" | "review_required" | "blocked"): OutreachEligibility {
  return {
    status,
    allowed: status === "allowed",
    reasons: [],
    requirements: [],
    policy: {
      countryCode: "GLOBAL",
      countryName: "Global baseline",
      region: "Global",
      emailBasis: "unknown",
      messagingBasis: "unknown",
      requiresUnsubscribe: true,
      requiresSenderIdentity: true,
      requiresPriorConsentForAutomatedMessaging: true,
      retentionMonths: 24,
      ownerReviewRequired: true,
      notes: "",
    },
    matchedEntries: [],
  };
}

const step: CampaignStepInput = {
  stepOrder: 1,
  channel: "email",
  delayDays: 0,
  subjectTemplate: "Hello {{first_name}} at {{business}}",
  bodyTemplate: "Hi {{name}},\n\nI saw {{website}} and wanted to ask about {{context}}.",
};

const target: CampaignTarget = {
  kind: "business",
  id: "biz-1",
  name: "Acme Ltd",
  email: "hello@acme.test",
  country: "Rwanda",
  website: "https://acme.test",
  context: "your new location",
};

describe("campaign templates", () => {
  it("finds variables in templates", () => {
    expect(templateVariables("Hi {{ name }} {{first_name}} {{name}}")).toEqual([
      "first_name",
      "name",
    ]);
  });

  it("renders target variables and removes empty values", () => {
    expect(renderTemplate("Hi {{first_name}} {{missing}}", { first_name: "Ada" })).toBe("Hi Ada");
  });

  it("renders a business draft with an opt-out route", () => {
    const draft = renderCampaignDraft(step, target);
    expect(draft.subject).toBe("Hello Acme at Acme Ltd");
    expect(draft.body).toContain("Hi Acme Ltd");
    expect(draft.body).toContain("https://acme.test");
    expect(draft.body).toContain("reply STOP");
  });

  it("does not duplicate an existing opt-out route", () => {
    const body = "Hello\n\nUnsubscribe here: https://example.test/unsubscribe";
    expect(ensureOptOutRoute(body)).toBe(body);
    expect(ensureOptOutRoute("Hello")).toMatch(/receive STOP|reply STOP/i);
  });

  it("uses an empty business variable for professionals", () => {
    const draft = renderCampaignDraft(step, {
      ...target,
      kind: "professional",
      name: "Ada Lovelace",
    });
    expect(draft.subject).toBe("Hello Ada at");
    expect(draft.body).toContain("Hi Ada Lovelace");
  });
});

describe("campaign validation", () => {
  it("accepts a valid campaign", () => {
    expect(validateCampaign({ name: "Q1", dailyLimit: 20, steps: [step] }).valid).toBe(true);
  });

  it("rejects missing names, duplicate orders and email without subject", () => {
    const result = validateCampaign({
      name: " ",
      dailyLimit: 0,
      steps: [
        { ...step, subjectTemplate: "" },
        { ...step, stepOrder: 1, channel: "phone", bodyTemplate: "" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("name is required");
    expect(result.errors.join(" ")).toContain("between 1 and 500");
    expect(result.errors.join(" ")).toContain("duplicated");
    expect(result.errors.join(" ")).toContain("needs a subject");
    expect(result.errors.join(" ")).toContain("needs a message body");
  });

  it("rejects excessive delays", () => {
    const result = validateCampaign({
      name: "Slow",
      dailyLimit: 10,
      steps: [{ ...step, delayDays: 91 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("between 0 and 90");
  });
});

describe("campaign queue", () => {
  it("labels statuses and delays", () => {
    expect(campaignStatusLabel("draft")).toBe("Draft");
    expect(queueStatusLabel("needs_review")).toBe("Needs review");
    expect(stepDelayLabel(0)).toBe("Same day");
    expect(stepDelayLabel(1)).toBe("Next day");
    expect(stepDelayLabel(7)).toBe("After 7 days");
  });

  it("maps eligibility to queue status without auto-approving", () => {
    expect(queueStatusFromEligibility(eligibility("blocked"))).toBe("blocked");
    expect(queueStatusFromEligibility(eligibility("review_required"))).toBe("needs_review");
    expect(queueStatusFromEligibility(eligibility("allowed"))).toBe("needs_review");
  });

  it("only allows explicit review transitions", () => {
    expect(canTransitionQueue("needs_review", "approved")).toBe(true);
    expect(canTransitionQueue("needs_review", "sent")).toBe(false);
    expect(canTransitionQueue("blocked", "approved")).toBe(false);
    expect(canTransitionQueue("approved", "sent")).toBe(true);
    expect(canTransitionQueue("sent", "approved")).toBe(false);
  });

  it("requires owner confirmation and non-blocked eligibility to approve", () => {
    const item = {
      status: "needs_review" as const,
      eligibility: eligibility("review_required"),
      draftBody: "Hello",
    };
    expect(canApproveQueueItem(item, false).allowed).toBe(false);
    expect(canApproveQueueItem(item, true).allowed).toBe(true);
    expect(
      canApproveQueueItem({ ...item, eligibility: eligibility("blocked") }, true).allowed,
    ).toBe(false);
    expect(canApproveQueueItem({ ...item, status: "approved" }, true).allowed).toBe(false);
    expect(canApproveQueueItem({ ...item, draftBody: "" }, true).allowed).toBe(false);
  });

  it("requires approval and a manual-send confirmation", () => {
    expect(canMarkQueueSent({ status: "approved" }, false).allowed).toBe(false);
    expect(canMarkQueueSent({ status: "approved" }, true).allowed).toBe(true);
    expect(canMarkQueueSent({ status: "needs_review" }, true).allowed).toBe(false);
  });

  it("summarizes queue items", () => {
    expect(
      campaignSummary([
        { status: "needs_review" },
        { status: "needs_review" },
        { status: "blocked" },
        { status: "approved" },
        { status: "sent" },
        { status: "skipped" },
      ]),
    ).toEqual({
      total: 6,
      needsReview: 2,
      blocked: 1,
      approved: 1,
      sent: 1,
      skipped: 1,
    });
  });

  it("creates stable dedupe keys", () => {
    expect(campaignDedupeKey("business", " ABC ", 2)).toBe("business:abc:step:2");
    expect(campaignTargetDedupeKey(target, 1)).toBe("business:biz-1:step:1");
  });
});
