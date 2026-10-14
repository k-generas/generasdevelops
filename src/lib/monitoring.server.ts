// Daily monitoring: runs the saved radar scan and records a digest of what it
// found. Shared by the manual "Run daily scan now" action and the scheduled job.
import type { Database } from "@/integrations/supabase/types";
import type { IndustryKey } from "@/lib/rwanda";
import { performRwandaScan, type RwandaScanResult, type SupabaseDb } from "./rwanda-scan.server";
import { industriesForCategory, utcDateString, type DigestBusiness } from "./monitoring";

export type MonitoringSettingsRow = Database["public"]["Tables"]["monitoring_settings"]["Row"];
export type DailyDigestRow = Database["public"]["Tables"]["daily_digests"]["Row"];
export type { DigestBusiness };

function sanitizeBusinesses(rows: DigestBusiness[]): DigestBusiness[] {
  return rows.slice(0, 50);
}

export type MonitoredScanOutcome = {
  digestId: string;
  status: "ok" | "failed";
  result: RwandaScanResult | null;
  added: number;
  newBusinesses: DigestBusiness[];
  error: string | null;
};

export type RunMonitoredScanOptions = {
  title?: string;
  forDate?: string;
};

// Run one monitored scan for an owner and persist the digest (one row per day).
// Never throws for scan failures: the failure is recorded as a "failed" digest so
// the daily job reports it instead of silently dying. The failure message is
// rethrown only when `rethrow` is set (used by the interactive "run now").
export async function runMonitoredScan(
  supabase: SupabaseDb,
  settings: MonitoringSettingsRow,
  options: RunMonitoredScanOptions & { rethrow?: boolean } = {},
): Promise<MonitoredScanOutcome> {
  const forDate = options.forDate ?? utcDateString();
  const industries =
    settings.industries && settings.industries.length
      ? (settings.industries as IndustryKey[])
      : industriesForCategory(settings.category);
  const title =
    options.title ??
    `Daily scan · ${settings.district ?? "Rwanda"} · ${settings.category} · ${forDate}`;

  try {
    const result = await performRwandaScan(supabase, settings.owner_id, {
      industries,
      districts: settings.district ? [settings.district] : undefined,
      maxQueries: settings.max_queries,
      title,
    });

    let newBusinesses: DigestBusiness[] = [];
    if (result.newIds.length) {
      const { data } = await supabase
        .from("businesses")
        .select("id, name, category, address, district, website, score")
        .in("id", result.newIds);
      newBusinesses = sanitizeBusinesses((data ?? []) as DigestBusiness[]);
    }

    const { data: digest, error } = await supabase
      .from("daily_digests")
      .upsert(
        {
          owner_id: settings.owner_id,
          for_date: forDate,
          status: "ok",
          district: settings.district,
          category: settings.category,
          queries: result.queries,
          found: result.found,
          added: result.added,
          duplicates: result.duplicatesAgainstDb + result.duplicatesWithinRun,
          failed_queries: result.failedQueries,
          cost_usd: result.estimatedCostUsd,
          run_id: result.runId,
          scan_id: result.scanId,
          new_businesses: newBusinesses,
          error: null,
          read_at: null,
        },
        { onConflict: "owner_id,for_date" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("monitoring_settings")
      .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("owner_id", settings.owner_id);

    return {
      digestId: digest.id,
      status: "ok",
      result,
      added: result.added,
      newBusinesses,
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { data: digest } = await supabase
      .from("daily_digests")
      .upsert(
        {
          owner_id: settings.owner_id,
          for_date: forDate,
          status: "failed",
          district: settings.district,
          category: settings.category,
          queries: 0,
          found: 0,
          added: 0,
          duplicates: 0,
          failed_queries: 0,
          cost_usd: 0,
          new_businesses: [],
          error: message,
          read_at: null,
        },
        { onConflict: "owner_id,for_date" },
      )
      .select("id")
      .single();

    await supabase
      .from("monitoring_settings")
      .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("owner_id", settings.owner_id);

    if (options.rethrow) throw e;
    return {
      digestId: digest?.id ?? "",
      status: "failed",
      result: null,
      added: 0,
      newBusinesses: [],
      error: message,
    };
  }
}

// Run every enabled target (single-owner app, so normally just one).
export async function runAllEnabledScans(
  supabase: SupabaseDb,
): Promise<{ ownerId: string; outcome: MonitoredScanOutcome }[]> {
  const { data: settings, error } = await supabase
    .from("monitoring_settings")
    .select("*")
    .eq("enabled", true);
  if (error) throw new Error(error.message);

  const outcomes: { ownerId: string; outcome: MonitoredScanOutcome }[] = [];
  for (const s of settings ?? []) {
    const outcome = await runMonitoredScan(supabase, s);
    outcomes.push({ ownerId: s.owner_id, outcome });
  }
  return outcomes;
}
