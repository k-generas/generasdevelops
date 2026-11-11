// Owner-scoped compliance and suppression server functions. These enforce the
// owner's own suppression list and expose a review-required policy check. They
// are not a legal-advice engine and they never send outreach.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  CONTACT_CHANNELS,
  SUPPRESSION_CHANNELS,
  SUPPRESSION_SCOPES,
  complianceSummary,
  normalizeSuppressionValue,
  outreachEligibility,
  policyForCountry,
  type ComplianceSummary,
  type ContactChannel,
  type OutreachEligibility,
  type SuppressionChannel,
  type SuppressionEntry,
  type SuppressionScope,
} from "./compliance";
import { normalizeUrl } from "./professional-intelligence";

type SuppressionRow = Database["public"]["Tables"]["suppression_entries"]["Row"];

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function toEntry(row: SuppressionRow): SuppressionEntry {
  return {
    id: row.id,
    scope: row.scope as SuppressionScope,
    value: row.value,
    channel: row.channel as SuppressionChannel,
    reason: row.reason,
    source: row.source,
    country: row.country,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(160).optional().default(""),
  scope: z.string().trim().max(30).optional().default(""),
  channel: z.string().trim().max(30).optional().default(""),
  includeExpired: z.boolean().default(true),
});

export type SuppressionListResult = {
  rows: SuppressionEntry[];
  total: number;
  page: number;
  pageSize: number;
  applied: boolean;
};

export const getSuppressionEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<SuppressionListResult> => {
    const empty: SuppressionListResult = {
      rows: [],
      total: 0,
      page: data.page,
      pageSize: data.pageSize,
      applied: false,
    };
    let query = context.supabase
      .from("suppression_entries")
      .select("*", { count: "exact" })
      .eq("owner_id", context.userId);
    if (data.query) query = query.ilike("value", `%${data.query.replace(/[%_]/g, "")}%`);
    if (data.scope) query = query.eq("scope", data.scope);
    if (data.channel) query = query.eq("channel", data.channel);
    if (!data.includeExpired) {
      query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    }
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await query.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) {
      if (isMissing(error.message)) return empty;
      throw new Error(error.message);
    }
    return {
      rows: (rows ?? []).map(toEntry),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      applied: true,
    };
  });

export const getComplianceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ComplianceSummary & { applied: boolean }> => {
    const { data, error } = await context.supabase
      .from("suppression_entries")
      .select("*")
      .eq("owner_id", context.userId)
      .limit(10000);
    if (error) {
      if (isMissing(error.message)) {
        return { total: 0, active: 0, expired: 0, byChannel: {}, applied: false };
      }
      throw new Error(error.message);
    }
    return { ...complianceSummary((data ?? []).map(toEntry)), applied: true };
  });

const saveInput = z.object({
  id: z.string().uuid().optional(),
  scope: z
    .enum([...SUPPRESSION_SCOPES] as [SuppressionScope, ...SuppressionScope[]])
    .default("contact"),
  value: z.string().trim().min(1).max(500),
  channel: z
    .enum([...SUPPRESSION_CHANNELS] as [SuppressionChannel, ...SuppressionChannel[]])
    .default("all"),
  reason: z.string().trim().min(1).max(500),
  source: z.string().trim().max(500).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  expiresAt: z.string().trim().max(60).nullable().optional(),
});

export const saveSuppressionEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }): Promise<SuppressionEntry> => {
    const value = normalizeSuppressionValue(data.scope, data.value);
    if (!value) {
      throw new Error(
        data.scope === "email"
          ? "Enter a valid email address."
          : data.scope === "phone"
            ? "Enter a valid phone number."
            : "Enter a valid suppression value.",
      );
    }
    if (data.expiresAt && Number.isNaN(Date.parse(data.expiresAt))) {
      throw new Error("Expiry date is invalid.");
    }
    const { data: saved, error } = await context.supabase
      .from("suppression_entries")
      .upsert(
        {
          owner_id: context.userId,
          scope: data.scope,
          value,
          channel: data.channel,
          reason: data.reason,
          source: data.source ?? null,
          country: data.country ?? null,
          expires_at: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
          updated_at: new Date().toISOString(),
          ...(data.id ? { id: data.id } : {}),
        },
        { onConflict: data.id ? "id" : "owner_id,scope,value,channel" },
      )
      .select("*")
      .single();
    if (error) {
      if (isMissing(error.message)) {
        throw new Error(
          "The suppression_entries table is not available yet. Apply the global intelligence migration.",
        );
      }
      throw new Error(error.message);
    }
    return toEntry(saved);
  });

export const deleteSuppressionEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("suppression_entries")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const checkInput = z.object({
  channel: z.enum([...CONTACT_CHANNELS] as [ContactChannel, ...ContactChannel[]]),
  country: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  domain: z.string().trim().max(300).nullable().optional(),
  businessId: z.string().uuid().nullable().optional(),
  professionalId: z.string().uuid().nullable().optional(),
  ownerConfirmedLawfulBasis: z.boolean().default(false),
});

export type OutreachCheckResult = OutreachEligibility & {
  ledgerApplied: boolean;
  contact: { email: string | null; phone: string | null; domain: string | null };
};

export const checkOutreachEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => checkInput.parse(d))
  .handler(async ({ data, context }): Promise<OutreachCheckResult> => {
    let email = data.email?.trim() || null;
    let phone = data.phone?.trim() || null;
    let domain = data.domain?.trim() || null;
    let country = data.country ?? null;
    let businessDoNotContact = false;
    let professionalDoNotContact = false;

    if (data.businessId) {
      const { data: business, error } = await context.supabase
        .from("businesses")
        .select("name,phone,emails,website,contact_suppressed")
        .eq("owner_id", context.userId)
        .eq("id", data.businessId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (business) {
        businessDoNotContact = !!business.contact_suppressed;
        email = email ?? business.emails?.[0] ?? null;
        phone = phone ?? business.phone ?? null;
        domain = domain ?? normalizeUrl(business.website);
      }
    }

    if (data.professionalId) {
      const { data: professional, error } = await context.supabase
        .from("professionals")
        .select("full_name,public_email,public_phone,website,do_not_contact,country")
        .eq("owner_id", context.userId)
        .eq("id", data.professionalId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (professional) {
        professionalDoNotContact = !!professional.do_not_contact;
        email = email ?? professional.public_email ?? null;
        phone = phone ?? professional.public_phone ?? null;
        domain = domain ?? normalizeUrl(professional.website);
        country = country ?? professional.country ?? null;
      }
    }

    const { data: entries, error } = await context.supabase
      .from("suppression_entries")
      .select("*")
      .eq("owner_id", context.userId)
      .limit(10000);
    const ledgerApplied = !error || !isMissing(error.message);
    if (error && !isMissing(error.message)) throw new Error(error.message);

    const result = outreachEligibility({
      channel: data.channel,
      country,
      contact: {
        email,
        phone,
        domain,
        businessId: data.businessId ?? null,
        professionalId: data.professionalId ?? null,
      },
      entries: (entries ?? []).map(toEntry),
      businessDoNotContact,
      professionalDoNotContact,
      ownerConfirmedLawfulBasis: data.ownerConfirmedLawfulBasis,
    });
    return {
      ...result,
      ledgerApplied,
      contact: { email, phone, domain: domain ? normalizeUrl(domain) : null },
    };
  });

export const setBusinessDoNotContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        businessId: z.string().uuid(),
        doNotContact: z.boolean(),
        reason: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch = {
      contact_suppressed: data.doNotContact,
      suppression_reason: data.doNotContact ? (data.reason ?? "Owner marked do-not-contact") : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("businesses")
      .update(patch)
      .eq("owner_id", context.userId)
      .eq("id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPolicyForCountry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ country: z.string().trim().max(80).nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<ReturnType<typeof policyForCountry>> => {
    return policyForCountry(data.country);
  });
