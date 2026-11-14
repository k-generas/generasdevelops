import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { isMissingDatabaseFunctionError } from "@/lib/access-codes";
import { normalizeDiscoveryLimits } from "@/lib/discovery-quota";

type AccessStatus = Database["public"]["Enums"]["access_status"];
type AuditAction = Database["public"]["Enums"]["audit_action"];
type Db = SupabaseClient<Database>;

export type AdminOverview = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
  admins: number;
  logins24h: number;
  activeCodes: number;
  discoveryRuns24h: number;
  apiRequests24h: number;
  googleRequests24h: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  access_status: AccessStatus;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  notes: string | null;
  discovery_daily_limit: number;
  discovery_cooldown_seconds: number;
  discovery_max_results: number;
  discovery_runs_today: number;
  last_discovery_at: string | null;
};

export type ApiRequestRow = {
  id: string;
  owner_id: string;
  owner_email: string | null;
  discovery_run_id: string | null;
  provider: string;
  operation: string;
  status: string;
  http_status: number | null;
  units: number;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export type LoginEventRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  event_type: string;
  success: boolean;
  failure_reason: string | null;
  user_agent: string | null;
  created_at: string;
};

export type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: AuditAction;
  target_user_id: string | null;
  target_user_email: string | null;
  details: Json | null;
  created_at: string;
};

export type AccessCodeRow = {
  id: string;
  code_prefix: string | null;
  target_email: string | null;
  status: Database["public"]["Enums"]["access_code_status"];
  max_uses: number;
  used_count: number;
  expires_at: string;
  created_at: string;
  redeemed_at: string | null;
};

export type MutationResult = { ok: boolean; error?: string };
export type IssuedCode = { ok: boolean; error?: string; code?: string; id?: string };

async function assertAdmin(supabase: Db): Promise<void> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not authorized: administrator access required");
}

function isMissingSchemaMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find")
  );
}

async function safeCount(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const result = await build();
    return result.count ?? 0;
  } catch {
    return 0;
  }
}

async function confirmAuthEmail(userId: string): Promise<MutationResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function countProfiles(supabase: Db, value: AccessStatus): Promise<number> {
  const { count } = await supabase
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("access_status", value);
  return count ?? 0;
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await assertAdmin(context.supabase);
    const supabase = context.supabase;
    const since = new Date(Date.now() - 86400000).toISOString();
    const [
      total,
      pending,
      approved,
      rejected,
      suspended,
      admins,
      logins,
      codes,
      runs24h,
      api24h,
      google24h,
    ] = await Promise.all([
      supabase.from("user_profiles").select("id", { count: "exact", head: true }),
      countProfiles(supabase, "pending"),
      countProfiles(supabase, "approved"),
      countProfiles(supabase, "rejected"),
      countProfiles(supabase, "suspended"),
      supabase
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_admin", true),
      supabase
        .from("login_history")
        .select("id", { count: "exact", head: true })
        .eq("success", true)
        .gte("created_at", since),
      supabase
        .from("access_codes")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      safeCount(() =>
        supabase
          .from("discovery_runs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since),
      ),
      safeCount(() =>
        supabase
          .from("api_request_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since),
      ),
      safeCount(() =>
        supabase
          .from("api_request_logs")
          .select("id", { count: "exact", head: true })
          .eq("provider", "google")
          .gte("created_at", since),
      ),
    ]);
    return {
      total: total.count ?? 0,
      pending: pending,
      approved: approved,
      rejected: rejected,
      suspended: suspended,
      admins: admins.count ?? 0,
      logins24h: logins.count ?? 0,
      activeCodes: codes.count ?? 0,
      discoveryRuns24h: runs24h,
      apiRequests24h: api24h,
      googleRequests24h: google24h,
    };
  });

type ProfileRow = Omit<
  AdminUserRow,
  | "discovery_runs_today"
  | "last_discovery_at"
  | "discovery_daily_limit"
  | "discovery_cooldown_seconds"
  | "discovery_max_results"
> & {
  discovery_daily_limit?: number | null;
  discovery_cooldown_seconds?: number | null;
  discovery_max_results?: number | null;
};

async function loadDiscoveryUsage(
  supabase: Db,
): Promise<Map<string, { runsToday: number; lastRunAt: string | null }>> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("discovery_runs")
    .select("owner_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    if (isMissingSchemaMessage(error.message)) return new Map();
    throw new Error(error.message);
  }

  const usage = new Map<string, { runsToday: number; lastRunAt: string | null }>();
  for (const row of data ?? []) {
    const current = usage.get(row.owner_id) ?? { runsToday: 0, lastRunAt: null };
    if (new Date(row.created_at) >= dayStart) current.runsToday += 1;
    if (!current.lastRunAt || row.created_at > current.lastRunAt)
      current.lastRunAt = row.created_at;
    usage.set(row.owner_id, current);
  }
  return usage;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.supabase);
    const baseColumns =
      "id, email, access_status, is_admin, created_at, last_login_at, login_count, notes";
    const extended = await context.supabase
      .from("user_profiles")
      .select(
        `${baseColumns}, discovery_daily_limit, discovery_cooldown_seconds, discovery_max_results`,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    let rows: ProfileRow[];
    if (!extended.error) {
      rows = (extended.data ?? []) as unknown as ProfileRow[];
    } else if (isMissingSchemaMessage(extended.error.message)) {
      const base = await context.supabase
        .from("user_profiles")
        .select(baseColumns)
        .order("created_at", { ascending: false })
        .limit(500);
      if (base.error) throw new Error(base.error.message);
      rows = (base.data ?? []) as unknown as ProfileRow[];
    } else {
      throw new Error(extended.error.message);
    }

    const usage = await loadDiscoveryUsage(context.supabase);
    return rows.map((row) => {
      const limits = normalizeDiscoveryLimits({
        dailyLimit: row.discovery_daily_limit,
        cooldownSeconds: row.discovery_cooldown_seconds,
        maxResults: row.discovery_max_results,
      });
      const userUsage = usage.get(row.id);
      return {
        ...row,
        discovery_daily_limit: limits.dailyLimit,
        discovery_cooldown_seconds: limits.cooldownSeconds,
        discovery_max_results: limits.maxResults,
        discovery_runs_today: userUsage?.runsToday ?? 0,
        last_discovery_at: userUsage?.lastRunAt ?? null,
      };
    });
  });

export const listLoginHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoginEventRow[]> => {
    await assertAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("login_history")
      .select("id, user_id, email, event_type, success, failure_reason, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("does not exist") || m.includes("schema cache")) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as LoginEventRow[];
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditRow[]> => {
    await assertAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select(
        "id, actor_id, actor_email, action, target_user_id, target_user_email, details, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("does not exist") || m.includes("schema cache")) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as AuditRow[];
  });

export const listAccessCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccessCodeRow[]> => {
    await assertAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("access_codes")
      .select(
        "id, code_prefix, target_email, status, max_uses, used_count, expires_at, created_at, redeemed_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("does not exist") || m.includes("schema cache")) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as AccessCodeRow[];
  });

export const listApiRequestLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApiRequestRow[]> => {
    await assertAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("api_request_logs")
      .select(
        "id, owner_id, discovery_run_id, provider, operation, status, http_status, units, duration_ms, error_code, error_message, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      if (isMissingSchemaMessage(error.message)) return [];
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Omit<ApiRequestRow, "owner_email">[];
    const ownerIds = Array.from(new Set(rows.map((row) => row.owner_id)));
    const emails = new Map<string, string>();
    if (ownerIds.length) {
      const { data: profiles } = await context.supabase
        .from("user_profiles")
        .select("id, email")
        .in("id", ownerIds);
      for (const profile of profiles ?? []) emails.set(profile.id, profile.email);
    }
    return rows.map((row) => ({ ...row, owner_email: emails.get(row.owner_id) ?? null }));
  });

const statusInput = z.object({
  userId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  note: z.string().trim().max(500).nullable().optional(),
});

export const setUserAccessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => statusInput.parse(d))
  .handler(async ({ data, context }): Promise<MutationResult> => {
    await assertAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc("admin_set_access_status", {
      p_user_id: data.userId,
      p_status: data.status,
      p_note: data.note ?? null,
    });
    if (error) return { ok: false, error: error.message };
    const outcome = result as MutationResult;
    if (outcome.ok && data.status === "approved") {
      const confirmed = await confirmAuthEmail(data.userId);
      if (!confirmed.ok) {
        return {
          ok: false,
          error: `Access approved, but email confirmation failed: ${confirmed.error ?? "unknown error"}`,
        };
      }
    }
    return outcome;
  });

export const confirmUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MutationResult> => {
    await assertAdmin(context.supabase);
    return confirmAuthEmail(data.userId);
  });

const quotaInput = z.object({
  userId: z.string().uuid(),
  dailyLimit: z.number().int().min(0).max(1000),
  cooldownSeconds: z.number().int().min(0).max(86400),
  maxResults: z.number().int().min(1).max(20),
});

export const setUserDiscoveryQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => quotaInput.parse(d))
  .handler(async ({ data, context }): Promise<MutationResult> => {
    await assertAdmin(context.supabase);
    const limits = normalizeDiscoveryLimits(data);
    const { data: updated, error } = await context.supabase
      .from("user_profiles")
      .update({
        discovery_daily_limit: limits.dailyLimit,
        discovery_cooldown_seconds: limits.cooldownSeconds,
        discovery_max_results: limits.maxResults,
      })
      .eq("id", data.userId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (isMissingSchemaMessage(error.message)) {
        return {
          ok: false,
          error:
            "Discovery quota columns are not installed yet. Apply migration 20261114000000_discovery_quotas.sql.",
        };
      }
      return { ok: false, error: error.message };
    }
    if (!updated) return { ok: false, error: "User not found." };
    return { ok: true };
  });

const issueInput = z.object({
  targetEmail: z.string().trim().email().nullable().optional(),
  maxUses: z.number().int().min(1).max(100).default(1),
  expiresInHours: z.number().int().min(1).max(8760).default(168),
});

export const issueAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => issueInput.parse(d))
  .handler(async ({ data, context }): Promise<IssuedCode> => {
    await assertAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc("admin_issue_access_code", {
      p_target_email: data.targetEmail ?? null,
      p_max_uses: data.maxUses,
      p_expires_in_hours: data.expiresInHours,
    });

    if (!error) return result as IssuedCode;
    if (!isMissingDatabaseFunctionError(error.message)) {
      return { ok: false, error: error.message };
    }

    const { issueAccessCodeFallback } = await import("@/lib/access-codes.server");
    const claims = context.claims as { email?: unknown };
    return issueAccessCodeFallback(context.supabase, {
      userId: context.userId,
      actorEmail: typeof claims.email === "string" ? claims.email : null,
      targetEmail: data.targetEmail ?? null,
      maxUses: data.maxUses,
      expiresInHours: data.expiresInHours,
    });
  });

export const revokeAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MutationResult> => {
    await assertAdmin(context.supabase);
    const { data: result, error } = await context.supabase.rpc("admin_revoke_access_code", {
      p_id: data.id,
    });
    if (error) return { ok: false, error: error.message };
    return result as MutationResult;
  });
