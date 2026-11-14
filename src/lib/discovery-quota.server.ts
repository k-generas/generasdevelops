import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  DEFAULT_DISCOVERY_LIMITS,
  evaluateDiscoveryClaim,
  normalizeDiscoveryLimits,
  utcDayReset,
  utcDayStart,
  type DiscoveryLimits,
} from "./discovery-quota";

type Db = SupabaseClient<Database>;

export type ClaimDiscoveryRunInput = {
  query: string;
  location: string | null;
  title: string;
  rerunOf: string | null;
};

export type ClaimDiscoveryRunResult =
  | {
      ok: true;
      runId: string;
      usedToday: number;
      remaining: number;
      limits: DiscoveryLimits;
      nextAvailableAt: string | null;
      resetAt: string;
    }
  | {
      ok: false;
      code: "disabled" | "daily_limit" | "cooldown" | "unauthenticated";
      message: string;
      usedToday: number;
      remaining: number;
      limits: DiscoveryLimits;
      retryAfterSeconds: number;
      nextAvailableAt: string | null;
      resetAt: string;
    };

export type DiscoveryQuotaSnapshot = {
  limits: DiscoveryLimits;
  usedToday: number;
  remaining: number;
  lastRunAt: string | null;
  nextAvailableAt: string | null;
  resetAt: string;
  disabled: boolean;
};

export type ApiRequestEvent = {
  provider: "google" | "geoapify";
  operation: "places_search_text";
  status: "success" | "failed" | "blocked";
  httpStatus?: number | null;
  units?: number;
  durationMs?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

type LimitsRead = { limits: DiscoveryLimits; schemaReady: boolean };

function isMissingSchemaError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find") ||
    (normalized.includes("column") && normalized.includes("not found"))
  );
}

async function readLimits(supabase: Db, userId: string): Promise<LimitsRead> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("discovery_daily_limit, discovery_cooldown_seconds, discovery_max_results")
    .eq("id", userId)
    .maybeSingle();

  if (!error) {
    return {
      limits: normalizeDiscoveryLimits({
        dailyLimit: data?.discovery_daily_limit,
        cooldownSeconds: data?.discovery_cooldown_seconds,
        maxResults: data?.discovery_max_results,
      }),
      schemaReady: true,
    };
  }

  if (isMissingSchemaError(error.message)) {
    return { limits: DEFAULT_DISCOVERY_LIMITS, schemaReady: false };
  }

  throw new Error(error.message);
}

async function readUsage(
  supabase: Db,
  userId: string,
): Promise<{ usedToday: number; lastRunAt: string | null }> {
  const dayStart = utcDayStart().toISOString();
  const [countResult, lastResult] = await Promise.all([
    supabase
      .from("discovery_runs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .gte("created_at", dayStart),
    supabase
      .from("discovery_runs")
      .select("created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (countResult.error) throw new Error(countResult.error.message);
  if (lastResult.error) throw new Error(lastResult.error.message);

  return {
    usedToday: countResult.count ?? 0,
    lastRunAt: lastResult.data?.created_at ?? null,
  };
}

export async function readDiscoveryQuota(
  supabase: Db,
  userId: string,
): Promise<DiscoveryQuotaSnapshot> {
  const [{ limits }, usage] = await Promise.all([
    readLimits(supabase, userId),
    readUsage(supabase, userId),
  ]);
  const now = Date.now();
  const lastRunMs = usage.lastRunAt ? Date.parse(usage.lastRunAt) : Number.NaN;
  const nextAvailableMs =
    Number.isFinite(lastRunMs) && limits.cooldownSeconds > 0
      ? lastRunMs + limits.cooldownSeconds * 1000
      : 0;

  return {
    limits,
    usedToday: usage.usedToday,
    remaining: Math.max(0, limits.dailyLimit - usage.usedToday),
    lastRunAt: usage.lastRunAt,
    nextAvailableAt: nextAvailableMs > now ? new Date(nextAvailableMs).toISOString() : null,
    resetAt: utcDayReset().toISOString(),
    disabled: limits.dailyLimit === 0,
  };
}

function mapRpcResult(
  raw: unknown,
  fallbackLimits: DiscoveryLimits,
  fallbackResetAt: string,
): ClaimDiscoveryRunResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const limits = normalizeDiscoveryLimits({
    dailyLimit: value["limit"],
    cooldownSeconds: value["cooldown_seconds"],
    maxResults: value["max_results"] ?? fallbackLimits.maxResults,
  });
  const usedToday = Math.max(0, Number(value["used_today"]) || 0);
  const remaining = Math.max(0, Number(value["remaining"]) || 0);
  const resetAt = typeof value["reset_at"] === "string" ? value["reset_at"] : fallbackResetAt;
  const nextAvailableAt =
    typeof value["next_available_at"] === "string" ? value["next_available_at"] : null;

  if (value["ok"] === true && typeof value["run_id"] === "string") {
    return {
      ok: true,
      runId: value["run_id"],
      usedToday,
      remaining,
      limits,
      nextAvailableAt,
      resetAt,
    };
  }

  if (value["ok"] === false) {
    const code = value["code"];
    return {
      ok: false,
      code:
        code === "disabled" || code === "daily_limit" || code === "cooldown" ? code : "daily_limit",
      message:
        typeof value["message"] === "string"
          ? value["message"]
          : "Discovery is temporarily unavailable.",
      usedToday,
      remaining,
      limits,
      retryAfterSeconds: Math.max(0, Number(value["retry_after_seconds"]) || 0),
      nextAvailableAt,
      resetAt,
    };
  }

  return null;
}

export async function claimDiscoveryRun(
  supabase: Db,
  userId: string,
  input: ClaimDiscoveryRunInput,
): Promise<ClaimDiscoveryRunResult> {
  const resetAt = utcDayReset().toISOString();
  const { data, error } = await supabase.rpc("claim_discovery_run", {
    p_query: input.query,
    p_location: input.location,
    p_title: input.title,
    p_rerun_of: input.rerunOf,
  });

  if (!error) {
    const mapped = mapRpcResult(data, DEFAULT_DISCOVERY_LIMITS, resetAt);
    if (mapped) return mapped;
  } else if (!isMissingSchemaError(error.message)) {
    throw new Error(error.message);
  }

  const [{ limits }, usage] = await Promise.all([
    readLimits(supabase, userId),
    readUsage(supabase, userId),
  ]);
  const decision = evaluateDiscoveryClaim({
    limits,
    usedToday: usage.usedToday,
    lastRunAt: usage.lastRunAt,
  });

  if (!decision.allowed) {
    return {
      ok: false,
      code: decision.code === "ok" ? "daily_limit" : decision.code,
      message: decision.message,
      usedToday: usage.usedToday,
      remaining: Math.max(0, limits.dailyLimit - usage.usedToday),
      limits,
      retryAfterSeconds: decision.retryAfterSeconds,
      nextAvailableAt: decision.nextAvailableAt,
      resetAt: decision.resetAt,
    };
  }

  const { data: run, error: insertError } = await supabase
    .from("discovery_runs")
    .insert({
      owner_id: userId,
      query: input.query,
      location: input.location,
      title: input.title,
      status: "running",
      rerun_of: input.rerunOf,
    })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  return {
    ok: true,
    runId: run.id,
    usedToday: usage.usedToday + 1,
    remaining: decision.remainingAfter,
    limits,
    nextAvailableAt: decision.nextAvailableAt,
    resetAt: decision.resetAt,
  };
}

export async function recordApiRequest(
  supabase: Db,
  userId: string,
  discoveryRunId: string | null,
  event: ApiRequestEvent,
): Promise<void> {
  try {
    const { error } = await supabase.from("api_request_logs").insert({
      owner_id: userId,
      discovery_run_id: discoveryRunId,
      provider: event.provider,
      operation: event.operation,
      status: event.status,
      http_status: event.httpStatus ?? null,
      units: Math.max(0, Math.trunc(event.units ?? 1)),
      duration_ms:
        event.durationMs === undefined ? null : Math.max(0, Math.trunc(event.durationMs)),
      error_code: event.errorCode ?? null,
      error_message: event.errorMessage ? event.errorMessage.slice(0, 500) : null,
      metadata: (event.metadata ?? {}) as Json,
    });
    if (error && !isMissingSchemaError(error.message)) {
      console.warn(`[api-usage] could not record request: ${error.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingSchemaError(message)) {
      console.warn(`[api-usage] could not record request: ${message}`);
    }
  }
}
