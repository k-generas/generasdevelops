export type DiscoveryLimits = {
  dailyLimit: number;
  cooldownSeconds: number;
  maxResults: number;
};

export const DEFAULT_DISCOVERY_LIMITS: DiscoveryLimits = {
  dailyLimit: 20,
  cooldownSeconds: 0,
  maxResults: 20,
};

export const MAX_DISCOVERY_DAILY_LIMIT = 1000;
export const MAX_DISCOVERY_COOLDOWN_SECONDS = 86_400;
export const MAX_DISCOVERY_RESULTS = 20;

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

export function normalizeDiscoveryLimits(
  input?: Partial<Record<keyof DiscoveryLimits, unknown>> | null,
): DiscoveryLimits {
  return {
    dailyLimit: clampInteger(
      input?.dailyLimit,
      0,
      MAX_DISCOVERY_DAILY_LIMIT,
      DEFAULT_DISCOVERY_LIMITS.dailyLimit,
    ),
    cooldownSeconds: clampInteger(
      input?.cooldownSeconds,
      0,
      MAX_DISCOVERY_COOLDOWN_SECONDS,
      DEFAULT_DISCOVERY_LIMITS.cooldownSeconds,
    ),
    maxResults: clampInteger(
      input?.maxResults,
      1,
      MAX_DISCOVERY_RESULTS,
      DEFAULT_DISCOVERY_LIMITS.maxResults,
    ),
  };
}

export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function utcDayReset(now: Date = new Date()): Date {
  return new Date(utcDayStart(now).getTime() + 24 * 60 * 60 * 1000);
}

export type DiscoveryQuotaDecision = {
  allowed: boolean;
  code: "ok" | "disabled" | "daily_limit" | "cooldown";
  message: string;
  remainingAfter: number;
  retryAfterSeconds: number;
  nextAvailableAt: string | null;
  resetAt: string;
};

export function evaluateDiscoveryClaim(input: {
  now?: Date;
  limits: DiscoveryLimits;
  usedToday: number;
  lastRunAt?: string | null;
}): DiscoveryQuotaDecision {
  const now = input.now ?? new Date();
  const limits = normalizeDiscoveryLimits(input.limits);
  const usedToday = Math.max(0, Math.trunc(input.usedToday));
  const resetAt = utcDayReset(now).toISOString();

  if (limits.dailyLimit === 0) {
    return {
      allowed: false,
      code: "disabled",
      message: "Discovery is disabled for this account. Ask an administrator to raise the limit.",
      remainingAfter: 0,
      retryAfterSeconds: 0,
      nextAvailableAt: resetAt,
      resetAt,
    };
  }

  if (usedToday >= limits.dailyLimit) {
    return {
      allowed: false,
      code: "daily_limit",
      message: `Daily discovery limit reached (${usedToday}/${limits.dailyLimit}). Try again tomorrow or ask an administrator to raise the limit.`,
      remainingAfter: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(resetAt) - now.getTime()) / 1000)),
      nextAvailableAt: resetAt,
      resetAt,
    };
  }

  const lastRunMs = input.lastRunAt ? Date.parse(input.lastRunAt) : Number.NaN;
  if (limits.cooldownSeconds > 0 && Number.isFinite(lastRunMs)) {
    const nextAvailableMs = lastRunMs + limits.cooldownSeconds * 1000;
    if (nextAvailableMs > now.getTime()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((nextAvailableMs - now.getTime()) / 1000));
      return {
        allowed: false,
        code: "cooldown",
        message: `Please wait ${retryAfterSeconds}s before running another discovery search.`,
        remainingAfter: Math.max(0, limits.dailyLimit - usedToday),
        retryAfterSeconds,
        nextAvailableAt: new Date(nextAvailableMs).toISOString(),
        resetAt,
      };
    }
  }

  return {
    allowed: true,
    code: "ok",
    message: "Discovery allowed.",
    remainingAfter: Math.max(0, limits.dailyLimit - usedToday - 1),
    retryAfterSeconds: 0,
    nextAvailableAt:
      limits.cooldownSeconds > 0
        ? new Date(now.getTime() + limits.cooldownSeconds * 1000).toISOString()
        : null,
    resetAt,
  };
}

export function discoveryQuotaError(message: string): Error {
  return new Error(`Discovery limit: ${message}`);
}

export function isDiscoveryQuotaErrorMessage(message: string): boolean {
  return /^Discovery limit:/i.test(message.trim());
}
