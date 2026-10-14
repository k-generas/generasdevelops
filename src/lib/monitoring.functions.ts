// Server functions for automatic daily monitoring. Reads/writes are owner-scoped
// via RLS; the scheduled function authenticates with the cron secret instead of a
// user session and uses the service-role client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_DISTRICTS } from "./rwanda";
import { RADAR_CATEGORIES } from "./radar";
import {
  runAllEnabledScans,
  runMonitoredScan,
  type MonitoredScanOutcome,
  type MonitoringSettingsRow,
} from "./monitoring.server";

const CATEGORY_KEYS = RADAR_CATEGORIES.map((c) => c.key) as [string, ...string[]];

const settingsInput = z.object({
  enabled: z.boolean().optional(),
  district: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .refine((d) => !d || ALL_DISTRICTS.includes(d), "Unknown district"),
  category: z.enum(CATEGORY_KEYS).optional(),
  maxQueries: z.number().int().min(1).max(10).optional(),
});

export const getMonitoringSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitoringSettingsRow | null> => {
    const { data } = await context.supabase
      .from("monitoring_settings")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const saveMonitoringSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsInput.parse(d))
  .handler(async ({ data, context }): Promise<MonitoringSettingsRow> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("monitoring_settings")
      .upsert(
        {
          owner_id: userId,
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
          ...(data.district !== undefined ? { district: data.district } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.maxQueries !== undefined ? { max_queries: data.maxQueries } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export type MonitoringOutcome = MonitoredScanOutcome;

// Manual "run the daily scan now" for the signed-in owner.
export const runMonitoringNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitoredScanOutcome> => {
    const { supabase, userId } = context;
    const { data: settings, error } = await supabase
      .from("monitoring_settings")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settings) throw new Error("No monitored target saved yet. Set one on the Radar page.");
    return runMonitoredScan(supabase, settings, { rethrow: true, title: "Manual daily scan" });
  });

// Called by the scheduled job. No user session: authenticates with the cron
// secret header and writes with the service-role client.
export const runScheduledMonitoring = createServerFn({ method: "POST" }).handler(async () => {
  const [{ getRequest }, { authenticateCronRequest }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/integrations/supabase/cron-auth"),
  ]);
  const request = getRequest();
  if (!request) return { ok: false, error: "no request" };
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const outcomes = await runAllEnabledScans(supabaseAdmin);
  return {
    ok: true,
    ran: outcomes.length,
    results: outcomes.map((o) => ({
      ownerId: o.ownerId,
      status: o.outcome.status,
      added: o.outcome.added,
      error: o.outcome.error,
    })),
  };
});
