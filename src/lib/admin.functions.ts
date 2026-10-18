import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";

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
    const [total, pending, approved, rejected, suspended, admins, logins, codes] =
      await Promise.all([
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
          .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
        supabase
          .from("access_codes")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
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
    };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("user_profiles")
      .select("id, email, access_status, is_admin, created_at, last_login_at, login_count, notes")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminUserRow[];
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
    return result as MutationResult;
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
    if (error) return { ok: false, error: error.message };
    return result as IssuedCode;
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
