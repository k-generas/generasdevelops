export type AiUsageLimits = {
  windowMs: number;
  maxPerWindow: number;
  dayMs: number;
  maxPerDay: number;
};

export type AiUsageEntry = {
  windowStartedAt: number;
  windowCount: number;
  dayStartedAt: number;
  dayCount: number;
};

export type AiUsageDecision =
  | {
      allowed: true;
      remainingWindow: number;
      remainingDay: number;
      resetAt: number;
    }
  | {
      allowed: false;
      reason: "window" | "day";
      retryAfterMs: number;
      resetAt: number;
    };

// Bounded by owner, so one owner cannot spend unbounded AI credits on prompt
// interpretation. The counters are per server isolate and reset on deploy.
export const PROSPECT_AI_LIMITS: AiUsageLimits = {
  windowMs: 60_000,
  maxPerWindow: 5,
  dayMs: 24 * 60 * 60 * 1000,
  maxPerDay: 40,
};

export function consumeAiUsage(
  store: Map<string, AiUsageEntry>,
  key: string,
  now = Date.now(),
  limits: AiUsageLimits = PROSPECT_AI_LIMITS,
): AiUsageDecision {
  const existing = store.get(key);
  const entry: AiUsageEntry = existing ?? {
    windowStartedAt: now,
    windowCount: 0,
    dayStartedAt: now,
    dayCount: 0,
  };
  store.set(key, entry);

  if (now < entry.windowStartedAt || now - entry.windowStartedAt >= limits.windowMs) {
    entry.windowStartedAt = now;
    entry.windowCount = 0;
  }
  if (now < entry.dayStartedAt || now - entry.dayStartedAt >= limits.dayMs) {
    entry.dayStartedAt = now;
    entry.dayCount = 0;
  }

  if (entry.windowCount >= limits.maxPerWindow) {
    const resetAt = entry.windowStartedAt + limits.windowMs;
    return { allowed: false, reason: "window", retryAfterMs: resetAt - now, resetAt };
  }
  if (entry.dayCount >= limits.maxPerDay) {
    const resetAt = entry.dayStartedAt + limits.dayMs;
    return { allowed: false, reason: "day", retryAfterMs: resetAt - now, resetAt };
  }

  entry.windowCount += 1;
  entry.dayCount += 1;
  return {
    allowed: true,
    remainingWindow: limits.maxPerWindow - entry.windowCount,
    remainingDay: limits.maxPerDay - entry.dayCount,
    resetAt: entry.windowStartedAt + limits.windowMs,
  };
}

export function aiUsageLimitMessage(
  decision: Extract<AiUsageDecision, { allowed: false }>,
  limits: AiUsageLimits = PROSPECT_AI_LIMITS,
): string {
  if (decision.reason === "day") {
    return `AI interpretation reached its daily limit of ${limits.maxPerDay} calls.`;
  }
  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  return `AI interpretation is limited to ${limits.maxPerWindow} calls per minute. Try again in ${seconds}s.`;
}
