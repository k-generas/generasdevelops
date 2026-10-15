import { describe, expect, it } from "vitest";
import {
  computeBuyerIntent,
  rankByIntent,
  summarizeIntent,
  toActivityEvent,
  type IntentSignals,
} from "./intent";
import type { ActivityEvent } from "./activity";

const NOW = new Date("2026-10-14T00:00:00.000Z");

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    key: "e1",
    kind: "expansion",
    title: "Opened a new branch",
    first_seen_at: "2026-10-01T00:00:00.000Z",
    last_seen_at: "2026-10-01T00:00:00.000Z",
    source_date: "2026-10-01T00:00:00.000Z",
    status: "active",
    source_id: null,
    url: null,
    confidence: 0.7,
    ...over,
  };
}

function signals(over: Partial<IntentSignals> = {}): IntentSignals {
  return {
    businessId: "b1",
    name: "Acme",
    industry: "retail",
    district: "Kigali",
    website: "https://acme.rw",
    businessStatus: "OPERATIONAL",
    reviewsLast90d: 3,
    lastActivityAt: "2026-10-05T00:00:00.000Z",
    events: [],
    openLeaks: 2,
    recurringFit: false,
    inPipeline: false,
    ...over,
  };
}

describe("computeBuyerIntent", () => {
  it("marks an active, gap-rich business as hot", () => {
    const intent = computeBuyerIntent(signals({ inPipeline: true }), NOW);
    expect(intent.tier).toBe("hot");
    expect(intent.reasons.some((r) => /measured gap/i.test(r))).toBe(true);
  });

  it("returns cold with no live opportunity for a permanently closed business", () => {
    const intent = computeBuyerIntent(signals({ businessStatus: "CLOSED_PERMANENTLY" }), NOW);
    expect(intent.tier).toBe("cold");
    expect(intent.score).toBe(0);
  });

  it("flags dormant businesses via uncertainty, not as a false positive", () => {
    const intent = computeBuyerIntent(
      signals({ reviewsLast90d: 0, lastActivityAt: "2025-01-01T00:00:00.000Z", openLeaks: 0 }),
      NOW,
    );
    expect(intent.uncertainties.some((u) => /dormant/i.test(u))).toBe(true);
    expect(["cool", "cold", "unknown"]).toContain(intent.tier);
    expect(intent.limitation).toMatch(/does not prove budget/i);
  });

  it("adds the hiring disclaimer when a hiring signal is present", () => {
    const intent = computeBuyerIntent(
      signals({ events: [event({ kind: "vacancy", title: "Hiring a sales manager" })] }),
      NOW,
    );
    expect(intent.hiringSignal).toBe(true);
    expect(
      intent.uncertainties.some((u) => /does not prove the company has a budget/i.test(u)),
    ).toBe(true);
  });

  it("is unknown when there is no signal at all", () => {
    const intent = computeBuyerIntent(
      signals({
        openLeaks: 0,
        lastActivityAt: null,
        reviewsLast90d: null,
        events: [],
        inPipeline: false,
      }),
      NOW,
    );
    expect(intent.tier).toBe("unknown");
  });
});

describe("rankByIntent / summarizeIntent", () => {
  it("orders hotter tiers first and counts each tier", () => {
    const items = [
      computeBuyerIntent(
        signals({
          businessId: "cold",
          openLeaks: 0,
          lastActivityAt: "2024-01-01T00:00:00.000Z",
          reviewsLast90d: 0,
        }),
        NOW,
      ),
      computeBuyerIntent(signals({ businessId: "hot", inPipeline: true }), NOW),
    ];
    const ranked = rankByIntent(items);
    expect(ranked[0]!.businessId).toBe("hot");
    const counts = summarizeIntent(items);
    expect(counts.hot + counts.warm + counts.cool + counts.cold + counts.unknown).toBe(2);
  });
});

describe("toActivityEvent", () => {
  it("maps a stored row to an activity event with a stable key", () => {
    const e = toActivityEvent({
      dedupe_key: "d1",
      event_kind: "tender",
      title: "Public tender",
      last_seen_at: "2026-10-02T00:00:00.000Z",
      status: "active",
    });
    expect(e.key).toBe("d1");
    expect(e.kind).toBe("tender");
    expect(e.status).toBe("active");
  });
});
