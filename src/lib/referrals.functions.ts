// Server functions for Referral & partnership intelligence (Feature H).
// Owner-scoped. The referral ledger is stored; partnership candidates are derived
// from recorded clients + recorded partners, never invented.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { industryLabel, type IndustryKey } from "@/lib/rwanda";
import type { Partner, PartnerKind } from "./partners";
import {
  partnershipCandidates,
  REFERRAL_REWARD_TYPES,
  REFERRAL_STATUSES,
  type ClientTie,
  type PartnershipCandidate,
  type Referral,
  type ReferralRewardType,
  type ReferralStatus,
} from "./referrals";

type ReferralRow = Database["public"]["Tables"]["referrals"]["Row"];

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function toReferral(row: ReferralRow): Referral {
  return {
    id: row.id,
    referrerName: row.referrer_name,
    referrerBusinessId: row.referrer_business_id,
    referredBusinessId: row.referred_business_id,
    referredName: row.referred_name,
    status: row.status as ReferralStatus,
    rewardType: row.reward_type as ReferralRewardType,
    rewardValue: row.reward_value,
    currency: row.currency,
    notes: row.notes,
    source: row.source,
  };
}

export const getReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Referral[]> => {
    const { data, error } = await context.supabase
      .from("referrals")
      .select("*")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      if (isMissing(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map(toReferral);
  });

const referralInput = z.object({
  id: z.string().uuid().optional(),
  referrer_name: z.string().trim().min(1).max(200),
  referrer_business_id: z.string().uuid().nullable().optional(),
  referred_business_id: z.string().uuid().nullable().optional(),
  referred_name: z.string().trim().max(200).nullable().optional(),
  status: z
    .enum([...REFERRAL_STATUSES] as [ReferralStatus, ...ReferralStatus[]])
    .default("invited"),
  reward_type: z
    .enum([...REFERRAL_REWARD_TYPES] as [ReferralRewardType, ...ReferralRewardType[]])
    .default("none"),
  reward_value: z.number().min(0).default(0),
  currency: z.string().trim().min(1).max(8).default("USD"),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(300).nullable().optional(),
});

export const saveReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => referralInput.parse(d))
  .handler(async ({ data, context }): Promise<Referral> => {
    const { data: saved, error } = await context.supabase
      .from("referrals")
      .upsert(
        {
          owner_id: context.userId,
          referrer_name: data.referrer_name,
          referrer_business_id: data.referrer_business_id ?? null,
          referred_business_id: data.referred_business_id ?? null,
          referred_name: data.referred_name ?? null,
          status: data.status,
          reward_type: data.reward_type,
          reward_value: data.reward_value,
          currency: data.currency,
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
    return toReferral(saved);
  });

export const deleteReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("referrals")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPartnershipCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PartnershipCandidate[]> => {
    const label = (k: string | null) => (k ? industryLabel(k as IndustryKey) : "Unknown industry");

    // Recorded recurring clients: active subscriptions.
    const clients = new Map<string, ClientTie>();
    const { data: subs } = await context.supabase
      .from("subscriptions")
      .select("business_id")
      .eq("owner_id", context.userId)
      .eq("status", "active")
      .not("business_id", "is", null)
      .limit(2000);
    // subscriptions has no `recurring` column; every active subscription is recurring work.
    for (const s of subs ?? []) {
      if (!s.business_id) continue;
      clients.set(s.business_id, {
        businessId: s.business_id,
        name: "",
        industry: null,
        recurring: true,
      });
    }

    // Accepted proposals also count as recorded clients.
    const { data: won } = await context.supabase
      .from("proposals")
      .select("business_id")
      .eq("owner_id", context.userId)
      .eq("status", "ACCEPTED")
      .limit(2000);
    for (const w of won ?? []) {
      if (!clients.has(w.business_id)) {
        clients.set(w.business_id, {
          businessId: w.business_id,
          name: "",
          industry: null,
          recurring: false,
        });
      }
    }

    const clientList = [...clients.values()];
    if (clientList.length > 0) {
      const ids = clientList.map((c) => c.businessId);
      const { data: biz } = await context.supabase
        .from("businesses")
        .select("id, name, industry")
        .in("id", ids)
        .limit(2000);
      const byId = new Map((biz ?? []).map((b) => [b.id, b]));
      for (const c of clientList) {
        const b = byId.get(c.businessId);
        c.name = b?.name ?? "Unnamed";
        c.industry = b?.industry ?? null;
      }
    }

    const { data: partnerRows } = await context.supabase
      .from("partners")
      .select(
        "id, name, kind, services, industries, districts, available_hours_per_week, rate, currency, contact_email, contact_phone, source, notes, active",
      )
      .eq("owner_id", context.userId)
      .eq("active", true)
      .limit(500);
    const partners: Partner[] = (partnerRows ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind as PartnerKind,
      services: p.services ?? [],
      industries: p.industries ?? [],
      districts: p.districts ?? [],
      availableHoursPerWeek: p.available_hours_per_week,
      rate: p.rate,
      currency: p.currency,
      contactEmail: p.contact_email,
      contactPhone: p.contact_phone,
      source: p.source,
      notes: p.notes,
      active: p.active,
    }));

    return partnershipCandidates(clientList, partners, label);
  });
