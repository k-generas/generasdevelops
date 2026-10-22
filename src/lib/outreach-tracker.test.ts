import { describe, expect, it } from "vitest";
import {
  OUTREACH_STAGES,
  contactChannels,
  isContacted,
  normalizeStage,
  stageCounts,
  stageLabel,
  stagePatch,
} from "@/lib/outreach-tracker";

describe("outreach-tracker", () => {
  it("keeps the six pipeline stages in order", () => {
    expect(OUTREACH_STAGES).toEqual([
      "not_contacted",
      "messaged",
      "replied",
      "negotiating",
      "won",
      "lost",
    ]);
  });

  it("normalizes unknown or missing stages to not_contacted", () => {
    expect(normalizeStage("replied")).toBe("replied");
    expect(normalizeStage("SOMETHING_ELSE")).toBe("not_contacted");
    expect(normalizeStage(null)).toBe("not_contacted");
    expect(normalizeStage(undefined)).toBe("not_contacted");
  });

  it("labels stages for the UI", () => {
    expect(stageLabel("negotiating")).toBe("Negotiating");
    expect(stageLabel(null)).toBe("Not contacted");
  });

  it("treats every stage except not_contacted as contacted", () => {
    expect(isContacted("messaged")).toBe(true);
    expect(isContacted("not_contacted")).toBe(false);
  });

  it("falls back from phone to cell and picks the first email", () => {
    expect(
      contactChannels({ phone: " 0788 123 456 ", emails: ["A@X.com", "a@x.com", "b@x.com"] }),
    ).toEqual({ phone: "0788 123 456", email: "a@x.com", extraEmails: ["b@x.com"] });
    expect(contactChannels({ phone: "", cell: "0722 000 111" })).toEqual({
      phone: "0722 000 111",
      email: null,
      extraEmails: [],
    });
    expect(contactChannels({})).toEqual({ phone: null, email: null, extraEmails: [] });
  });

  it("counts stages over all scanned businesses", () => {
    const counts = stageCounts([
      {},
      { outreach_stage: "messaged" },
      { outreach_stage: "messaged" },
      { outreach_stage: "replied" },
      { outreach_stage: "negotiating" },
      { outreach_stage: "won" },
      { outreach_stage: "lost" },
    ]);
    expect(counts).toEqual({
      total: 7,
      not_contacted: 1,
      messaged: 2,
      replied: 1,
      negotiating: 1,
      won: 1,
      lost: 1,
    });
  });

  it("stamps last_contacted_at unless moving back to not_contacted", () => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    expect(stagePatch("messaged", now)).toEqual({
      outreach_stage: "messaged",
      last_contacted_at: "2026-01-02T03:04:05.000Z",
    });
    expect(stagePatch("not_contacted", now)).toEqual({
      outreach_stage: "not_contacted",
      last_contacted_at: null,
    });
  });
});
