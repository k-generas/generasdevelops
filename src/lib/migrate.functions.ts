import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Accounts allowed to trigger the one-click migration runner.
export const OWNER_EMAILS = ["generaskagiraneza@gmail.com", "generaskagiraneza9@gmail.com"];

export type MigrationDiagnostics = {
  isOwner: boolean;
  email: string | null;
  dbEnvKeysPresent: string[];
  hasConnectionString: boolean;
  profileTableExists: boolean;
  accessCodesTableExists: boolean;
};

function claimEmail(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const email = (claims as Record<string, unknown>)["email"];
  return typeof email === "string" ? email : null;
}

export const getMigrationDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MigrationDiagnostics> => {
    const email = claimEmail(context.claims);
    const migrate = await import("./migrate.server");
    const dbEnvKeysPresent = migrate.presentDbEnvKeys();

    let profileTableExists = false;
    let accessCodesTableExists = false;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const profiles = await supabaseAdmin.from("user_profiles").select("id").limit(1);
      profileTableExists = !profiles.error;
      const codes = await supabaseAdmin.from("access_codes").select("id").limit(1);
      accessCodesTableExists = !codes.error;
    } catch {
      /* service role not available (e.g. local dev) */
    }

    return {
      isOwner: email ? OWNER_EMAILS.includes(email.toLowerCase()) : false,
      email,
      dbEnvKeysPresent,
      hasConnectionString: dbEnvKeysPresent.length > 0,
      profileTableExists,
      accessCodesTableExists,
    };
  });

export type MigrationRunResponse = {
  ok: boolean;
  error?: string;
  hint?: string;
  dbEnvKeysPresent?: string[];
};

export const runPendingMigrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ connectionString: z.string().trim().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MigrationRunResponse> => {
    const email = claimEmail(context.claims);
    if (!email || !OWNER_EMAILS.includes(email.toLowerCase())) {
      throw new Error("Not authorized: only the project owner can run migrations");
    }

    const migrate = await import("./migrate.server");
    const connectionString = migrate.resolveConnectionString(data.connectionString);
    if (!connectionString) {
      return {
        ok: false,
        error: "no_connection_string",
        hint: "No database URL was found in the server environment. Paste your Supabase connection string below and run again.",
        dbEnvKeysPresent: migrate.presentDbEnvKeys(),
      };
    }

    const result = await migrate.executeMigrations(connectionString);
    return {
      ok: result.ok,
      dbEnvKeysPresent: migrate.presentDbEnvKeys(),
      ...(result.error ? { error: result.error } : {}),
    };
  });
