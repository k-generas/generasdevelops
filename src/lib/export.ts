// Owner-scoped backup export. Every table here is protected by RLS, so the
// signed-in owner only ever reads their own rows.
import { supabase } from "@/integrations/supabase/client";

export const BACKUP_TABLES = [
  "businesses",
  "business_facts",
  "business_audits",
  "business_sources",
  "business_notes",
  "business_activity_events",
  "company_events",
  "investigations",
  "revenue_leaks",
  "offers",
  "offer_kits",
  "proposals",
  "proposal_versions",
  "invoices",
  "payments",
  "expenses",
  "orders",
  "tasks",
  "partners",
  "partner_handoffs",
  "subscriptions",
  "referrals",
  "discovery_runs",
  "search_run_results",
  "source_scans",
  "daily_digests",
  "monitoring_settings",
  "user_preferences",
  "user_profiles",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupFile = {
  app: "GARE";
  version: 1;
  exported_at: string;
  tables: Record<string, unknown[]>;
  errors: { table: string; message: string }[];
};

const PAGE = 1000;

async function readTable(table: BackupTable): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function exportAllData(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  const errors: { table: string; message: string }[] = [];
  for (const table of BACKUP_TABLES) {
    try {
      tables[table] = await readTable(table);
    } catch (e) {
      // A table missing from an older database should not abort the whole backup.
      tables[table] = [];
      errors.push({ table, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return {
    app: "GARE",
    version: 1,
    exported_at: new Date().toISOString(),
    tables,
    errors,
  };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
