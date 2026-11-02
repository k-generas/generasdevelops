// Verifies that the hosted Lovable Cloud database has every table/column the
// app expects, and that the hosted site is responding.
//
// Usage:
//   npm run db:verify
//   HOSTED_URL="https://..." npm run db:verify
//
// Reads SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY from the environment or from
// .env / .env.local. Only public publishable keys are used; no secrets printed.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const supabaseUrl = (env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL") ?? "").replace(/\/+$/, "");
const publishableKey =
  env("SUPABASE_PUBLISHABLE_KEY") ?? env("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "";
const hostedUrl = (env("HOSTED_URL") ?? "https://generasdevelops.lovable.app").replace(/\/+$/, "");

if (!supabaseUrl || !publishableKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Set them in the environment or .env.",
  );
  process.exit(1);
}

const expectedTables = [
  "access_code_attempts",
  "access_codes",
  "audit_logs",
  "business_activity_events",
  "business_audits",
  "business_facts",
  "business_notes",
  "business_sources",
  "businesses",
  "company_events",
  "daily_digests",
  "discovery_runs",
  "expenses",
  "investigations",
  "invoices",
  "login_history",
  "monitoring_settings",
  "offer_kits",
  "offers",
  "opportunities",
  "opportunity_signals",
  "orders",
  "partner_handoffs",
  "partners",
  "payments",
  "proposal_versions",
  "proposals",
  "referrals",
  "revenue_leaks",
  "search_run_results",
  "source_scans",
  "subscriptions",
  "tasks",
  "user_preferences",
  "user_profiles",
];

const expectedBusinessColumns = [
  "activity_checked_at",
  "business_model",
  "cell",
  "contact_page",
  "contact_suppressed",
  "description",
  "district",
  "emails",
  "employee_count_status",
  "employees_max",
  "employees_min",
  "exports",
  "founded_date",
  "founded_status",
  "industry",
  "industry_secondary",
  "intel_updated_at",
  "last_activity_at",
  "last_contacted_at",
  "last_investigated_at",
  "last_opened_at",
  "legal_name",
  "legal_structure",
  "location_verified",
  "markets_served",
  "open_now",
  "opening_hours",
  "outreach_note",
  "outreach_stage",
  "parent_organization",
  "preferred_channel",
  "products_services",
  "profile_confidence",
  "profile_verified_at",
  "province",
  "recent_reviews",
  "registration_date",
  "registration_id",
  "registration_status",
  "reviews_last_90d",
  "sector",
  "socials",
  "supply_chain_role",
  "suppression_reason",
  "target_customers",
  "trading_names",
  "validation_plan",
  "visibility_score",
  "website_check",
  "website_checked_at",
  "website_source",
];

const headers = {
  apikey: publishableKey,
  Authorization: `Bearer ${publishableKey}`,
};

async function get(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function checkTable(table) {
  const result = await get(`${table}?select=*&limit=1`);
  if (result.ok) return null;
  if (result.status === 404 || result.body.includes("PGRST205")) return "missing table";
  return `HTTP ${result.status}: ${result.body.slice(0, 160)}`;
}

async function checkBusinessColumn(column) {
  const result = await get(`businesses?select=${column}&limit=1`);
  if (result.ok) return null;
  if (result.body.includes("42703") || result.body.includes("PGRST204")) return "missing column";
  return `HTTP ${result.status}: ${result.body.slice(0, 160)}`;
}

console.log(`Database  ${supabaseUrl}`);
console.log(`Site      ${hostedUrl}\n`);

const missingTables = [];
for (const table of expectedTables) {
  const problem = await checkTable(table);
  if (problem) missingTables.push(`${table} (${problem})`);
}

const missingColumns = [];
for (const column of expectedBusinessColumns) {
  const problem = await checkBusinessColumn(column);
  if (problem) missingColumns.push(`businesses.${column} (${problem})`);
}

let siteOk = false;
let siteStatus = 0;
try {
  const res = await fetch(hostedUrl, {
    headers: { "user-agent": "gare-db-verify" },
    signal: AbortSignal.timeout(20000),
  });
  siteStatus = res.status;
  const body = await res.text();
  siteOk = res.ok && body.includes("<title>");
} catch (err) {
  siteStatus = 0;
  console.error(`Site check failed: ${err instanceof Error ? err.message : String(err)}`);
}

console.log(
  `Tables    ${expectedTables.length - missingTables.length}/${expectedTables.length} present`,
);
for (const entry of missingTables) console.log(`  MISSING  ${entry}`);

console.log(
  `Columns   ${expectedBusinessColumns.length - missingColumns.length}/${expectedBusinessColumns.length} present`,
);
for (const entry of missingColumns) console.log(`  MISSING  ${entry}`);

console.log(`Site      HTTP ${siteStatus} ${siteOk ? "ok" : "not ok"}`);

const failed = missingTables.length > 0 || missingColumns.length > 0 || !siteOk;
console.log(`\n${failed ? "RESULT: FAIL" : "RESULT: PASS"}`);
process.exitCode = failed ? 1 : 0;
