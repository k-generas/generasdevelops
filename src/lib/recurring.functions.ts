// Server functions for the Recurring Revenue Builder (Feature C). Owner-scoped via
// RLS. Subscriptions are created by the owner (manually or from a won recurring
// proposal); nothing is forecast or auto-billed.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUBSCRIPTION_STATUSES, type Subscription, type SubscriptionStatus } from "./recurring";
import type { Database } from "@/integrations/supabase/types";

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    businessId: row.business_id,
    offer: row.offer,
    status: row.status as SubscriptionStatus,
    monthlyValue: row.monthly_value,
    currency: row.currency,
    startedAt: row.started_at,
    nextRenewalAt: row.next_renewal_at,
    canceledAt: row.canceled_at,
    notes: row.notes,
    source: row.source,
  };
}

export type SubscriptionWithBusiness = Subscription & { businessName: string | null };

export const getSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionWithBusiness[]> => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("*, businesses(name)")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      if (isMissing(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => {
      const { businesses, ...rest } = row as SubscriptionRow & {
        businesses: { name: string } | null;
      };
      return { ...toSubscription(rest as SubscriptionRow), businessName: businesses?.name ?? null };
    });
  });

const subscriptionInput = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid().nullable().optional(),
  offer: z.string().trim().min(1).max(200),
  status: z
    .enum(SUBSCRIPTION_STATUSES as [SubscriptionStatus, ...SubscriptionStatus[]])
    .default("proposed"),
  monthly_value: z.number().min(0).default(0),
  currency: z.string().trim().min(1).max(8).default("USD"),
  started_at: z.string().regex(DATE_RE).nullable().optional(),
  next_renewal_at: z.string().regex(DATE_RE).nullable().optional(),
  canceled_at: z.string().regex(DATE_RE).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(300).nullable().optional(),
});

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => subscriptionInput.parse(d))
  .handler(async ({ data, context }): Promise<Subscription> => {
    const { data: saved, error } = await context.supabase
      .from("subscriptions")
      .upsert(
        {
          owner_id: context.userId,
          business_id: data.business_id ?? null,
          offer: data.offer,
          status: data.status,
          monthly_value: data.monthly_value,
          currency: data.currency,
          started_at: data.started_at ?? null,
          next_renewal_at: data.next_renewal_at ?? null,
          canceled_at: data.canceled_at ?? null,
          notes: data.notes ?? null,
          source: data.source ?? null,
          updated_at: new Date().toISOString(),
          ...(data.id ? { id: data.id } : {}),
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toSubscription(saved);
  });

export const deleteSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("subscriptions")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const statusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(SUBSCRIPTION_STATUSES as [SubscriptionStatus, ...SubscriptionStatus[]]),
});

export const setSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => statusInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("subscriptions")
      .update({
        status: data.status,
        updated_at: now,
        ...(data.status === "churned" ? { canceled_at: now.slice(0, 10) } : {}),
      })
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
