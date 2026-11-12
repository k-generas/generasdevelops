import { describe, expect, it } from "vitest";
import {
  aiUsageLimitMessage,
  consumeAiUsage,
  type AiUsageEntry,
  type AiUsageLimits,
} from "./ai-usage";

const limits: AiUsageLimits = {
  windowMs: 1_000,
  maxPerWindow: 2,
  dayMs: 10_000,
  maxPerDay: 3,
};

function store(): Map<string, AiUsageEntry> {
  return new Map();
}

describe("AI usage limiter", () => {
  it("allows calls until the window limit and reports retry timing", () => {
    const usage = store();

    const first = consumeAiUsage(usage, "owner-a", 0, limits);
    const second = consumeAiUsage(usage, "owner-a", 100, limits);
    const third = consumeAiUsage(usage, "owner-a", 200, limits);

    expect(first).toMatchObject({ allowed: true, remainingWindow: 1, remainingDay: 2 });
    expect(second).toMatchObject({ allowed: true, remainingWindow: 0, remainingDay: 1 });
    expect(third).toMatchObject({ allowed: false, reason: "window", retryAfterMs: 800 });
    if (!third.allowed) {
      expect(aiUsageLimitMessage(third, limits)).toContain("2 calls per minute");
    }
  });

  it("resets the burst window without resetting the daily count", () => {
    const usage = store();
    consumeAiUsage(usage, "owner-a", 0, limits);
    consumeAiUsage(usage, "owner-a", 100, limits);

    const afterWindow = consumeAiUsage(usage, "owner-a", 1_000, limits);
    const dayLimit = consumeAiUsage(usage, "owner-a", 1_100, limits);

    expect(afterWindow).toMatchObject({ allowed: true, remainingWindow: 1, remainingDay: 0 });
    expect(dayLimit).toMatchObject({ allowed: false, reason: "day", retryAfterMs: 8_900 });
    if (!dayLimit.allowed) {
      expect(aiUsageLimitMessage(dayLimit, limits)).toContain("daily limit of 3 calls");
    }
  });

  it("resets the daily count after a rolling day", () => {
    const usage = store();
    consumeAiUsage(usage, "owner-a", 0, limits);
    consumeAiUsage(usage, "owner-a", 100, limits);
    consumeAiUsage(usage, "owner-a", 1_000, limits);

    const nextDay = consumeAiUsage(usage, "owner-a", 10_000, limits);

    expect(nextDay).toMatchObject({ allowed: true, remainingWindow: 1, remainingDay: 2 });
  });

  it("keeps separate counters per owner", () => {
    const usage = store();
    consumeAiUsage(usage, "owner-a", 0, limits);
    consumeAiUsage(usage, "owner-a", 100, limits);

    const other = consumeAiUsage(usage, "owner-b", 200, limits);

    expect(other).toMatchObject({ allowed: true, remainingWindow: 1, remainingDay: 2 });
  });
});
