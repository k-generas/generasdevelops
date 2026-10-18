import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccessStatus = "pending" | "approved" | "rejected" | "suspended";

export type AccessInfo = {
  status: AccessStatus;
  email: string;
  name: string | null;
  isAdmin: boolean;
};

export const ADMIN_EMAIL = "generaskagiraneza@gmail.com";
export const ADMIN_WHATSAPP = "250794144738";
export const ACCESS_EMAIL_SUBJECT = "GARE Access Request";

function readName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["full_name", "name", "display_name"]) {
    const value = m[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// Returns null when access can't be determined yet (table not migrated, or no
// session); callers treat null as "no restriction" so the app keeps working.
export async function fetchAccessInfo(): Promise<AccessInfo | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("access_status, is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) return null;
  return {
    status: data?.access_status ?? "pending",
    email: userData.user.email ?? "",
    name: readName(userData.user.user_metadata),
    isAdmin: data?.is_admin ?? false,
  };
}

export function useAccessInfo() {
  return useQuery({
    queryKey: ["access-info"],
    queryFn: fetchAccessInfo,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 15000 : false),
  });
}

export function accessRequestBody(info: AccessInfo): string {
  const lines = [
    "Hello, I have created a GARE account and would like to request access approval.",
    "",
  ];
  if (info.name) lines.push(`Name: ${info.name}`);
  lines.push(`Registered email: ${info.email || "(no email on file)"}`);
  lines.push("", "Please review my request. Thank you.");
  return lines.join("\n");
}

export function accessEmailText(info: AccessInfo): string {
  return `Subject: ${ACCESS_EMAIL_SUBJECT}\n\n${accessRequestBody(info)}`;
}

export function whatsappAccessLink(info: AccessInfo): string {
  return `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(accessRequestBody(info))}`;
}

export type RedeemResult = { ok: boolean; error?: string };

export async function redeemAccessCode(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc("redeem_access_code", { p_code: code.trim() });
  if (error) return { ok: false, error: error.message };
  return (data as RedeemResult | null) ?? { ok: false, error: "unknown_error" };
}

export const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "You are not signed in. Sign in and try again.",
  empty_code: "Enter an access code first.",
  invalid_code: "That access code is not valid.",
  code_used: "That access code has already been used.",
  code_expired: "That access code has expired.",
  code_revoked: "That access code was revoked by the administrator.",
  code_exhausted: "That access code has reached its usage limit.",
  code_not_assigned: "That access code was issued to a different email address.",
  rate_limited: "Too many attempts. Wait a few minutes before trying again.",
  unknown_error: "Could not verify the code. Try again.",
};

export function redeemErrorMessage(key?: string): string {
  const fallback = "Could not verify the code. Try again.";
  if (!key) return fallback;
  return REDEEM_ERROR_MESSAGES[key] ?? fallback;
}

export async function recordLoginEvent(eventType = "sign_in"): Promise<void> {
  try {
    await supabase.rpc("record_login_event", {
      p_event_type: eventType,
      p_success: true,
      p_failure_reason: null,
      p_user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
    });
  } catch {
    /* login history is best-effort */
  }
}
