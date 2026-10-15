import { describe, expect, it } from "vitest";
import {
  classifyRecovery,
  recoveryCandidates,
  recoveryTaskKey,
  type ProposalLike,
} from "./recovery";

const NOW = new Date("2026-10-14T00:00:00.000Z");

function proposal(over: Partial<ProposalLike> = {}): ProposalLike {
  return {
    id: "p1",
    business_id: "b1",
    title: "Website proposal",
    price: 500,
    currency: "USD",
    status: "SENT",
    outcome: null,
    sent_at: "2026-10-10T00:00:00.000Z",
    updated_at: "2026-10-10T00:00:00.000Z",
    created_at: "2026-10-10T00:00:00.000Z",
    ...over,
  };
}

describe("classifyRecovery", () => {
  it("returns null for a fresh sent proposal", () => {
    expect(classifyRecovery(proposal(), NOW)).toBeNull();
  });

  it("flags a stale sent proposal as no_response", () => {
    const c = classifyRecovery(
      proposal({ sent_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" }),
      NOW,
    );
    expect(c?.reason).toBe("no_response");
    expect(c?.ageDays).toBeGreaterThanOrEqual(14);
  });

  it("flags a rejected proposal with a budget reason as soft_no (high priority)", () => {
    const c = classifyRecovery(
      proposal({ status: "REJECTED", outcome: "not enough budget this quarter" }),
      NOW,
    );
    expect(c?.reason).toBe("soft_no");
    expect(c?.priority).toBe("high");
  });

  it("flags a plain rejection as lost", () => {
    const c = classifyRecovery(
      proposal({ status: "REJECTED", outcome: "went with a competitor" }),
      NOW,
    );
    expect(c?.reason).toBe("lost");
  });

  it("does not touch drafts or accepted proposals", () => {
    expect(classifyRecovery(proposal({ status: "DRAFT" }), NOW)).toBeNull();
    expect(classifyRecovery(proposal({ status: "ACCEPTED" }), NOW)).toBeNull();
  });

  it("keeps stale-and-old proposals at low priority", () => {
    const c = classifyRecovery(
      proposal({ sent_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z" }),
      NOW,
    );
    expect(c?.priority).toBe("low");
  });
});

describe("recoveryCandidates", () => {
  it("orders high priority first, then by value", () => {
    const out = recoveryCandidates(
      [
        proposal({
          id: "a",
          sent_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        }),
        proposal({ id: "b", status: "REJECTED", outcome: "timing", price: 900 }),
        proposal({ id: "c", status: "REJECTED", outcome: "no", price: 5000 }),
      ],
      NOW,
    );
    // b and c are both high priority (fresh rejection / soft no); higher value first.
    expect(out[0]!.proposalId).toBe("c");
    expect(out[1]!.proposalId).toBe("b");
    expect(out[1]!.reason).toBe("soft_no");
    expect(out[out.length - 1]!.proposalId).toBe("a");
  });
});

describe("recoveryTaskKey", () => {
  it("is stable per proposal", () => {
    expect(recoveryTaskKey("p1")).toBe("recover-proposal-p1");
  });
});
