// Server functions for the Agency Overflow Work Finder (Feature B). Owner-scoped
// via RLS + the authenticated user id. No partner is ever contacted automatically.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HANDOFF_STATUSES, PARTNER_KINDS, type Partner, type PartnerKind } from "./partners";
import {
  computeOverflowCandidates,
  type HandoffRow,
  type OverflowResult,
  type PartnerRow,
} from "./partners.server";

export type { OverflowResult };
export type HandoffWithNames = HandoffRow & {
  partner_name: string | null;
  business_name: string | null;
};

function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as PartnerKind,
    services: row.services,
    industries: row.industries,
    districts: row.districts,
    availableHoursPerWeek: row.available_hours_per_week,
    rate: row.rate,
    currency: row.currency,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    source: row.source,
    notes: row.notes,
    active: row.active,
  };
}

function cleanList(values: string[], max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export const getPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Partner[]> => {
    const { data, error } = await context.supabase
      .from("partners")
      .select("*")
      .eq("owner_id", context.userId)
      .order("name", { ascending: true })
      .limit(1000);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("does not exist") || m.includes("schema cache")) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map(toPartner);
  });

const partnerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PARTNER_KINDS as [PartnerKind, ...PartnerKind[]]).default("agency"),
  services: z.array(z.string()).max(40).default([]),
  industries: z.array(z.string()).max(40).default([]),
  districts: z.array(z.string()).max(60).default([]),
  available_hours_per_week: z.number().min(0).max(168).default(0),
  rate: z.number().min(0).default(0),
  currency: z.string().trim().min(1).max(8).default("USD"),
  contact_email: z.string().trim().max(200).nullable().optional(),
  contact_phone: z.string().trim().max(60).nullable().optional(),
  source: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  active: z.boolean().default(true),
});

export const savePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => partnerInput.parse(d))
  .handler(async ({ data, context }): Promise<Partner> => {
    const row = {
      owner_id: context.userId,
      name: data.name,
      kind: data.kind,
      services: cleanList(data.services),
      industries: cleanList(data.industries),
      districts: cleanList(data.districts),
      available_hours_per_week: data.available_hours_per_week,
      rate: data.rate,
      currency: data.currency,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      source: data.source ?? null,
      notes: data.notes ?? null,
      active: data.active,
      updated_at: new Date().toISOString(),
      ...(data.id ? { id: data.id } : {}),
    };
    const { data: saved, error } = await context.supabase
      .from("partners")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toPartner(saved);
  });

export const deletePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("partners")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getHandoffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HandoffWithNames[]> => {
    const { data, error } = await context.supabase
      .from("partner_handoffs")
      .select("*, partners(name), businesses(name)")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("does not exist") || m.includes("schema cache")) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map((row) => {
      const { partners, businesses, ...rest } = row as HandoffRow & {
        partners: { name: string } | null;
        businesses: { name: string } | null;
      };
      return {
        ...rest,
        partner_name: partners?.name ?? null,
        business_name: businesses?.name ?? null,
      };
    });
  });

const handoffInput = z.object({
  partner_id: z.string().uuid(),
  business_id: z.string().uuid().nullable().optional(),
  leak_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(300).nullable().optional(),
  service: z.string().trim().max(200).nullable().optional(),
  delivery_value: z.number().min(0).default(0),
  owner_cut: z.number().min(0).default(0),
  currency: z.string().trim().min(1).max(8).default("USD"),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const createHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => handoffInput.parse(d))
  .handler(async ({ data, context }): Promise<HandoffRow> => {
    const { data: saved, error } = await context.supabase
      .from("partner_handoffs")
      .insert({
        owner_id: context.userId,
        partner_id: data.partner_id,
        business_id: data.business_id ?? null,
        leak_id: data.leak_id ?? null,
        title: data.title,
        reason: data.reason ?? null,
        service: data.service ?? null,
        delivery_value: data.delivery_value,
        owner_cut: data.owner_cut,
        currency: data.currency,
        note: data.note ?? null,
        status: "planned",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const setHandoffStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(HANDOFF_STATUSES as [string, ...string[]]) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("partner_handoffs")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOverflowCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OverflowResult> => {
    return computeOverflowCandidates(context.supabase, context.userId);
  });
