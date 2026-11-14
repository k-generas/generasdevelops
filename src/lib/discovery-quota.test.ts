import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCOVERY_LIMITS,
  evaluateDiscoveryClaim,
  normalizeDiscoveryLimits,
  utcDayReset,
  utcDayStart,
} from "./discovery-quota";

const NOW = new Date("2026-11-14T12:00:00.000Z");

describe("normalizeDiscoveryLimits", () => {
  it("uses safe defaults for missing values", () => {
    expect(normalizeDiscoveryLimits()).toEqual(DEFAULT_DISCOVERY_LIMITS);
    expect(normalizeDiscoveryLimits(null)).toEqual(DEFAULT_DISCOVERY_LIMITS);
  });

  it("clamps unsafe admin values", () => {
    expect(
      normalizeDiscoveryLimits({
        dailyLimit: -10,
        cooldownSeconds: 999_999,
        maxResults: 99,
      }),
    ).toEqual({ dailyLimit: 0, cooldownSeconds: 86_400, maxResults: 20 });
    expect(
      normalizeDiscoveryLimits({
        dailyLimit: 10_000,
        cooldownSeconds: -1,
        maxResults: 0,
      }),
    ).toEqual({ dailyLimit: 1000, cooldownSeconds: 0, maxResults: 1 });
  });
});

describe("UTC quota window", () => {
  it("starts and resets at midnight UTC", () => {
    expect(utcDayStart(NOW).toISOString()).toBe("2026-11-14T00:00:00.000Z");
    expect(utcDayReset(NOW).toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
});

describe("evaluateDiscoveryClaim", () => {
  const limits = { dailyLimit: 3, cooldownSeconds: 0, maxResults: 20 };

  it("allows a run below the daily limit", () => {
    const decision = evaluateDiscoveryClaim({ now: NOW, limits, usedToday: 1 });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("ok");
    expect(decision.remainingAfter).toBe(1);
  });

  it("blocks when the daily limit is reached", () => {
    const decision = evaluateDiscoveryClaim({ now: NOW, limits, usedToday: 3 });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("daily_limit");
    expect(decision.remainingAfter).toBe(0);
    expect(decision.nextAvailableAt).toBe("2026-11-15T00:00:00.000Z");
  });

  it("blocks when discovery is disabled", () => {
    const decision = evaluateDiscoveryClaim({
      now: NOW,
      limits: { ...limits, dailyLimit: 0 },
      usedToday: 0,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("disabled");
  });

  it("enforces the minimum gap between runs", () => {
    const decision = evaluateDiscoveryClaim({
      now: NOW,
      limits: { ...limits, cooldownSeconds: 60 },
      usedToday: 1,
      lastRunAt: "2026-11-14T11:59:30.000Z",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("cooldown");
    expect(decision.retryAfterSeconds).toBe(30);
    expect(decision.nextAvailableAt).toBe("2026-11-14T12:00:30.000Z");
  });

  it("allows the run once the gap has elapsed", () => {
    const decision = evaluateDiscoveryClaim({
      now: NOW,
      limits: { ...limits, cooldownSeconds: 60 },
      usedToday: 1,
      lastRunAt: "2026-11-14T11:58:00.000Z",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.nextAvailableAt).toBe("2026-11-14T12:01:00.000Z");
  });
});
