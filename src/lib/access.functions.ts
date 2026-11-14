import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { isMissingDatabaseFunctionError, type RedeemAccessCodeResult } from "@/lib/access-codes";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const requireSupabaseUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Access code redemption is not configured on this deployment");
  }

  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: sign in to redeem an access code");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || token.split(".").length !== 3) {
    throw new Error("Unauthorized: invalid session token");
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: {
      fetch: createSupabaseFetch(supabaseKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: invalid session token");
  }

  return next({
    context: {
      supabase,
      userId: data.claims.sub,
      claims: data.claims,
    },
  });
});

export const redeemAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseUser])
  .inputValidator((data) => z.object({ code: z.string().trim().min(1).max(64) }).parse(data))
  .handler(async ({ data, context }): Promise<RedeemAccessCodeResult> => {
    const { data: result, error } = await context.supabase.rpc("redeem_access_code", {
      p_code: data.code,
    });

    if (!error) {
      return (result as RedeemAccessCodeResult | null) ?? { ok: false, error: "unknown_error" };
    }

    if (!isMissingDatabaseFunctionError(error.message)) {
      return { ok: false, error: error.message };
    }

    const { redeemAccessCodeFallback } = await import("@/lib/access-codes.server");
    const claims = context.claims as { email?: unknown };
    return redeemAccessCodeFallback({
      userId: context.userId,
      email: typeof claims.email === "string" ? claims.email : null,
      code: data.code,
    });
  });
