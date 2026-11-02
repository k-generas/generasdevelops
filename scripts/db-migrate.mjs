// Applies every file in supabase/migrations to the Lovable Cloud database in
// filename order. All files are idempotent, so re-running is safe and converges
// the hosted schema.
//
// Usage:
//   LOVABLE_DB_MIGRATION_URL="postgres://..." npm run db:migrate
//   (DATABASE_URL and SUPABASE_DB_URL are accepted as fallbacks.)
//
// The connection string is never printed.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFiles() {
  const values = {};
  for (const file of [".env", ".env.local"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[match[1]] = value;
    }
  }
  return values;
}

const fileEnv = loadEnvFiles();
const env = (key) => process.env[key] ?? fileEnv[key];

const url =
  env("LOVABLE_DB_MIGRATION_URL") ?? env("DATABASE_URL") ?? env("SUPABASE_DB_URL") ?? "";

if (!url) {
  console.error(
    "Missing database URL. Set LOVABLE_DB_MIGRATION_URL (preferred, same var as drizzle.config.ts), DATABASE_URL, or SUPABASE_DB_URL.",
  );
  console.error(
    "Lovable Cloud keeps this URL in its hosted environment; if you do not have it locally, ask Lovable to apply supabase/migrations instead.",
  );
  process.exit(1);
}

const migrationsDir = join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No .sql files found in supabase/migrations.");
  process.exit(1);
}

let host = "unknown";
try {
  host = new URL(url).hostname;
} catch {
  host = "configured database";
}

console.log(`Target  ${host}`);
console.log(`Files   ${files.length}\n`);

const sql = postgres(url, { max: 1, onnotice: () => {} });
let failed = false;

try {
  for (const file of files) {
    const contents = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await sql.unsafe(contents);
      console.log(`applied  ${file}`);
    } catch (err) {
      failed = true;
      console.error(`FAILED   ${file}`);
      console.error(`         ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }

  const probe = await sql`
    SELECT
      to_regclass('public.business_audits') IS NOT NULL AS business_audits,
      to_regclass('public.opportunity_signals') IS NOT NULL AS opportunity_signals,
      to_regclass('public.opportunities') IS NOT NULL AS opportunities
  `;
  const row = probe[0] ?? {};
  console.log(
    `\nTables  business_audits=${row.business_audits} opportunity_signals=${row.opportunity_signals} opportunities=${row.opportunities}`,
  );
  if (!row.business_audits || !row.opportunity_signals || !row.opportunities) {
    failed = true;
    console.error("One or more expected tables are still missing.");
  }
} catch (err) {
  failed = true;
  console.error(`ERROR    ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await sql.end({ timeout: 5 });
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("\nOK - supabase/migrations applied. Run npm run db:verify next.");
}
