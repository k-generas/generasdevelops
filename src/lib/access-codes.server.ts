import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  generateAccessCode,
  hashAccessCode,
  type IssuedAccessCode,
  type RedeemAccessCodeResult,
} from "@/lib/access-codes";

type Db = SupabaseClient<Database>;

export async function issueAccessCodeFallback(
  supabase: Db,
  input: {
    userId: string;
    actorEmail?: string | null;
    targetEmail?: string | null;
    maxUses: number;
    expiresInHours: number;
  },
): Promise<IssuedAccessCode> {
  const code = generateAccessCode();
  const codeHash = await hashAccessCode(code);
  const targetEmail = input.targetEmail?.trim().toLowerCase() || null;
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from("access_codes")
    .insert({
      code_hash: codeHash,
      code_prefix: code.slice(0, 9),
      target_email: targetEmail,
      issued_by: input.userId,
      expires_at: expiresAt,
      max_uses: input.maxUses,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "access_code_not_created" };

  await recordAudit(input.userId, input.actorEmail ?? null, "code_issued", null, targetEmail, {
    code_id: data.id,
    max_uses: input.maxUses,
    expires_at: expiresAt,
  });

  return { ok: true, id: data.id, code, expires_at: expiresAt };
}

type AccessCodeRow = Database["public"]["Tables"]["access_codes"]["Row"];

export async function redeemAccessCodeFallback(input: {
  userId: string;
  email?: string | null;
  code: string;
}): Promise<RedeemAccessCodeResult> {
  const normalizedCode = input.code.trim();
  if (!normalizedCode) return { ok: false, error: "empty_code" };

  let supabaseAdmin: Db;
  try {
    const adminModule = await import("@/integrations/supabase/client.server");
    supabaseAdmin = adminModule.supabaseAdmin;
  } catch (error) {
    console.error("[access] service role unavailable for code redemption", error);
    return { ok: false, error: "redeem_unavailable" };
  }

  try {
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
    const { count: recentFailures } = await supabaseAdmin
      .from("access_code_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("success", false)
      .gt("created_at", tenMinutesAgo);

    if ((recentFailures ?? 0) >= 5) return { ok: false, error: "rate_limited" };

    const codeHash = await hashAccessCode(normalizedCode);
    const { data: codeData, error: lookupError } = await supabaseAdmin
      .from("access_codes")
      .select("*")
      .eq("code_hash", codeHash)
      .maybeSingle();
    const codeRow = codeData as AccessCodeRow | null;

    if (lookupError) {
      console.error("[access] code lookup failed", lookupError);
      return { ok: false, error: "unknown_error" };
    }

    if (!codeRow) {
      await recordAttempt(input.userId, false);
      return { ok: false, error: "invalid_code" };
    }

    if (codeRow.status !== "active") {
      await recordAttempt(input.userId, false);
      return { ok: false, error: `code_${codeRow.status}` };
    }

    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      await markCodeStatus(codeRow.id, "expired");
      await recordAttempt(input.userId, false);
      return { ok: false, error: "code_expired" };
    }

    if (codeRow.used_count >= codeRow.max_uses) {
      await markCodeStatus(codeRow.id, "used");
      await recordAttempt(input.userId, false);
      return { ok: false, error: "code_exhausted" };
    }

    if (codeRow.target_email) {
      const email = input.email?.trim().toLowerCase() ?? "";
      if (email !== codeRow.target_email.trim().toLowerCase()) {
        await recordAttempt(input.userId, false);
        return { ok: false, error: "code_not_assigned" };
      }
    }

    const nextUsedCount = codeRow.used_count + 1;
    const nextStatus = nextUsedCount >= codeRow.max_uses ? "used" : "active";
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("access_codes")
      .update({
        used_count: nextUsedCount,
        status: nextStatus,
        redeemed_at: now,
        redeemed_by: input.userId,
        updated_at: now,
      })
      .eq("id", codeRow.id)
      .eq("status", "active")
      .eq("used_count", codeRow.used_count)
      .select("id");

    if (updateError) {
      console.error("[access] code update failed", updateError);
      return { ok: false, error: "unknown_error" };
    }

    if (!updated?.length) {
      await recordAttempt(input.userId, false);
      return { ok: false, error: "code_exhausted" };
    }

    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        access_status: "approved",
        approved_at: now,
        approved_by: codeRow.issued_by,
        notes: null,
        updated_at: now,
      })
      .eq("id", input.userId);

    if (profileError) {
      console.error("[access] profile approval failed", profileError);
      return { ok: false, error: "unknown_error" };
    }

    await recordAttempt(input.userId, true);
    await recordAudit(
      input.userId,
      input.email ?? null,
      "code_redeemed",
      input.userId,
      input.email ?? null,
      { code_id: codeRow.id },
    );

    return { ok: true };
  } catch (error) {
    console.error("[access] code redemption failed", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Missing Supabase environment variable")) {
      return { ok: false, error: "redeem_unavailable" };
    }
    return { ok: false, error: "unknown_error" };
  }
}

async function markCodeStatus(
  codeId: string,
  status: Database["public"]["Enums"]["access_code_status"],
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("access_codes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", codeId);
  } catch (error) {
    console.error("[access] could not update code status", error);
  }
}

async function recordAttempt(userId: string, success: boolean): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("access_code_attempts").insert({ user_id: userId, success });
  } catch (error) {
    console.error("[access] could not record code attempt", error);
  }
}

async function recordAudit(
  actorId: string | null,
  actorEmail: string | null,
  action: Database["public"]["Enums"]["audit_action"],
  targetUserId: string | null,
  targetEmail: string | null,
  details: Json,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      target_user_id: targetUserId,
      target_user_email: targetEmail,
      details,
    });
  } catch (error) {
    console.error("[access] could not write audit log", error);
  }
}
