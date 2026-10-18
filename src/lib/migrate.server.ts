import postgres from "postgres";
import pendingSql from "../../docs/APPLY_PENDING_MIGRATIONS.sql?raw";

// Candidate environment variables that may hold a Postgres connection string in
// the Lovable Cloud runtime. We try them in order so the one-click runner works
// wherever Lovable exposes the database URL.
const DB_URL_ENV_KEYS = [
  "LOVABLE_DB_MIGRATION_URL",
  "LOVABLE_DB_URL",
  "LOVABLE_POSTGRES_URL",
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_URL",
  "PG_URL",
  "PG_CONNECTION_STRING",
  "SUPABASE_DB_POOLER_URL",
] as const;

export function presentDbEnvKeys(): string[] {
  return DB_URL_ENV_KEYS.filter((key) => Boolean(process.env[key]?.trim()));
}

export function resolveConnectionString(override?: string): string | null {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  for (const key of DB_URL_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function migrationBundle(): string {
  return pendingSql;
}

export type MigrationRunResult = { ok: boolean; error?: string };

export async function executeMigrations(connectionString: string): Promise<MigrationRunResult> {
  const sql = postgres(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20,
    prepare: false,
    fetch_types: false,
    ssl: "require",
    onnotice: () => {},
  });
  try {
    // prepare:false uses the simple query protocol, which accepts the whole
    // multi-statement bundle as one atomic implicit transaction.
    await sql.unsafe(pendingSql);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}
