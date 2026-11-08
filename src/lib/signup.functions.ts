import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const signUpInput = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
});

export type SignUpResult = { ok: boolean; error?: string };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(): string {
  try {
    const headers = getRequest()?.headers;
    const forwarded = headers?.get("x-forwarded-for");
    return forwarded?.split(",")[0]?.trim() || headers?.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

function allowAttempt(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export const createEarlyAccessAccount = createServerFn({ method: "POST" })
  .inputValidator((data) => data)
  .handler(async ({ data }): Promise<SignUpResult> => {
    const parsed = signUpInput.safeParse(data);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    if (!allowAttempt(clientKey())) return { ok: false, error: "rate_limited" };

    const email = parsed.data.email.trim().toLowerCase();

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: parsed.data.password,
        email_confirm: true,
      });

      if (!error) return { ok: true };

      const message = error.message.toLowerCase();
      if (message.includes("already") || message.includes("exists")) {
        return { ok: false, error: "email_exists" };
      }
      if (message.includes("password")) return { ok: false, error: "weak_password" };
      if (message.includes("email") && message.includes("valid")) {
        return { ok: false, error: "invalid_email" };
      }
      console.error("[signup] createUser failed", error.message);
      return { ok: false, error: "unknown" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        return { ok: false, error: "service_unconfigured" };
      }
      console.error("[signup] unexpected failure", message);
      return { ok: false, error: "unknown" };
    }
  });
