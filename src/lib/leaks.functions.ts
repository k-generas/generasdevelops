// Server functions for the Revenue Leak Detector (Feature A) and the saved
// profit/delivery assumptions behind the Feasibility Engine (Feature F).
// All reads/writes are owner-scoped via RLS + the authenticated user id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defaultFeasibilityAssumptions, readFeasibilityAssumptions } from "./feasibility";
import {
  refreshOwnerLeaks,
  setLeakStatus,
  type RefreshLeaksResult,
  type RevenueLeakRow,
} from "./leaks.server";

export type LeakWithBusiness = RevenueLeakRow & { business_name: string | null };
export type { RefreshLeaksResult };

const LEAK_STATUSES = ["open", "dismissed", "resolved"] as const;

export const getRevenueLeaks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeakWithBusiness[]> => {
    const { data, error } = await context.supabase
      .from("revenue_leaks")
      .select("*, businesses(name)")
      .eq("owner_id", context.userId)
      .order("confidence", { ascending: false })
      .limit(2000);
    if (error) {
      const m = error.message.toLowerCase();
      if (
        m.includes("does not exist") ||
        m.includes("could not find the table") ||
        m.includes("schema cache")
      ) {
        return [];
      }
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => {
      const { businesses, ...leak } = row as RevenueLeakRow & {
        businesses: { name: string } | null;
      };
      return { ...leak, business_name: businesses?.name ?? null };
    });
  });

// Re-derive leaks from stored evidence across the owner's businesses. Idempotent:
// upserts by (owner_id, dedupe_key) and preserves review decisions.
export const refreshRevenueLeaks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RefreshLeaksResult> => {
    return refreshOwnerLeaks(context.supabase, context.userId);
  });

const statusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAK_STATUSES),
  note: z.string().trim().max(500).nullable().optional(),
});

export const setRevenueLeakStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => statusInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await setLeakStatus(context.supabase, context.userId, data.id, data.status, data.note ?? null);
    return { ok: true };
  });

export type FeasibilityDefaults = ReturnType<typeof defaultFeasibilityAssumptions>;

export const getFeasibilityDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeasibilityDefaults> => {
    const { data } = await context.supabase
      .from("user_preferences")
      .select("feasibility_defaults")
      .eq("owner_id", context.userId)
      .maybeSingle();
    return readFeasibilityAssumptions(data?.feasibility_defaults);
  });

export const saveFeasibilityDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => readFeasibilityAssumptions(d))
  .handler(async ({ data, context }): Promise<FeasibilityDefaults> => {
    const { error } = await context.supabase.from("user_preferences").upsert(
      {
        owner_id: context.userId,
        feasibility_defaults: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    return data;
  });
