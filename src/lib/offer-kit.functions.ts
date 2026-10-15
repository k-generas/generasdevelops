// Server functions for the Repeatable Offer Factory (Feature E). Owner-scoped via
// RLS. Kits package an offer's scope and delivery checklist; `createKitTasks`
// materialises the checklist into normal tasks (never a new pipeline).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  deliverableTaskTitle,
  kitTaskKey,
  normalizeKit,
  resolveKit,
  type OfferKit,
} from "./offer-kit";

type KitRow = Database["public"]["Tables"]["offer_kits"]["Row"];

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function toKit(row: KitRow): OfferKit {
  return normalizeKit({
    id: row.id,
    offer: row.offer,
    scopeIncludes: row.scope_includes,
    scopeExcludes: row.scope_excludes,
    deliverables: row.deliverables,
    timelineDays: row.timeline_days,
    revisions: row.revisions,
    depositPercent: row.deposit_percent,
    recurring: row.recurring,
    notes: row.notes,
    active: row.active,
  });
}

export const getOfferKits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OfferKit[]> => {
    const { data, error } = await context.supabase
      .from("offer_kits")
      .select("*")
      .eq("owner_id", context.userId)
      .order("offer", { ascending: true })
      .limit(500);
    if (error) {
      if (isMissing(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map(toKit);
  });

const kitInput = z.object({
  offer: z.string().trim().min(1).max(200),
  scope_includes: z.array(z.string().trim().min(1)).max(100).default([]),
  scope_excludes: z.array(z.string().trim().min(1)).max(100).default([]),
  deliverables: z.array(z.string().trim().min(1)).max(100).default([]),
  timeline_days: z.number().int().min(0).max(1000).nullable().default(null),
  revisions: z.number().int().min(0).max(100).nullable().default(null),
  deposit_percent: z.number().min(0).max(100).nullable().default(null),
  recurring: z.boolean().default(false),
  notes: z.string().trim().max(2000).nullable().default(null),
  active: z.boolean().default(true),
});

export const saveOfferKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => kitInput.parse(d))
  .handler(async ({ data, context }): Promise<OfferKit> => {
    const { data: saved, error } = await context.supabase
      .from("offer_kits")
      .upsert(
        {
          owner_id: context.userId,
          offer: data.offer,
          scope_includes: data.scope_includes,
          scope_excludes: data.scope_excludes,
          deliverables: data.deliverables,
          timeline_days: data.timeline_days,
          revisions: data.revisions,
          deposit_percent: data.deposit_percent,
          recurring: data.recurring,
          notes: data.notes,
          active: data.active,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,offer" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toKit(saved);
  });

export const deleteOfferKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offer: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("offer_kits")
      .delete()
      .eq("owner_id", context.userId)
      .eq("offer", data.offer);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const materializeInput = z.object({
  offer: z.string().trim().min(1).max(200),
  business_id: z.string().uuid().nullable().optional(),
  proposal_id: z.string().uuid().nullable().optional(),
});

export const createKitTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => materializeInput.parse(d))
  .handler(
    async ({ data, context }): Promise<{ created: number; skipped: number; total: number }> => {
      const { data: rows } = await context.supabase
        .from("offer_kits")
        .select("*")
        .eq("owner_id", context.userId)
        .eq("offer", data.offer)
        .limit(1);
      const stored = (rows ?? []).map(toKit);
      const kit = resolveKit(data.offer, stored);
      if (kit.deliverables.length === 0) return { created: 0, skipped: 0, total: 0 };

      const keys = kit.deliverables.map((d, i) =>
        kitTaskKey(data.offer, d, i, data.business_id ?? null),
      );
      const { data: existing } = await context.supabase
        .from("tasks")
        .select("dedupe_key")
        .eq("owner_id", context.userId)
        .in("dedupe_key", keys);
      const have = new Set((existing ?? []).map((e) => e.dedupe_key));

      const toInsert = kit.deliverables
        .map((d, i) => ({ d, i, key: keys[i]! }))
        .filter(({ key }) => !have.has(key))
        .map(({ d, i, key }) => ({
          owner_id: context.userId,
          business_id: data.business_id ?? null,
          proposal_id: data.proposal_id ?? null,
          title: deliverableTaskTitle(data.offer, d),
          description: null,
          source: "offer_kit",
          dedupe_key: key,
          status: "open",
          priority: "medium",
          due_at: new Date(Date.now() + (i + 1) * 2 * 86_400_000).toISOString(),
        }));

      if (toInsert.length > 0) {
        const { error } = await context.supabase.from("tasks").insert(toInsert);
        if (error) throw new Error(error.message);
      }
      return {
        created: toInsert.length,
        skipped: keys.length - toInsert.length,
        total: keys.length,
      };
    },
  );
