// Owner-scoped professional intelligence server functions. These only read and
// write records the owner entered or lawfully observed; no social scraping or
// paid enrichment is performed here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  PROFESSIONAL_AVAILABILITY_STATUSES,
  PROFESSIONAL_LINK_TYPES,
  PROFESSIONAL_STAGES,
  PROFESSIONAL_TYPES,
  PROFESSIONAL_VERIFICATION_STATUSES,
  normalizeProfessional,
  professionalDedupeKey,
  suggestConfidence,
  validateProfessional,
  type Professional,
  type ProfessionalAvailabilityStatus,
  type ProfessionalEvidence,
  type ProfessionalInput,
  type ProfessionalLinkType,
  type ProfessionalStage,
  type ProfessionalType,
  type ProfessionalVerificationStatus,
} from "./professional-intelligence";

type ProfessionalRow = Database["public"]["Tables"]["professionals"]["Row"];
type LinkRow = Database["public"]["Tables"]["professional_business_links"]["Row"];

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function missingMessage(table: string): string {
  return `The ${table} table is not available yet. Apply the global intelligence migration and try again.`;
}

function toProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    fullName: row.full_name,
    headline: row.headline,
    professionalType: row.professional_type as ProfessionalType,
    country: row.country,
    region: row.region,
    city: row.city,
    languages: row.languages ?? [],
    expertise: row.expertise ?? [],
    skills: row.skills ?? [],
    website: row.website,
    publicEmail: row.public_email,
    publicPhone: row.public_phone,
    profileUrl: row.profile_url,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    evidence: (row.evidence ?? []) as unknown as ProfessionalEvidence[],
    confidence: row.confidence,
    verificationStatus: row.verification_status as ProfessionalVerificationStatus,
    availabilityStatus: row.availability_status as ProfessionalAvailabilityStatus,
    relationshipStage: row.relationship_stage as ProfessionalStage,
    doNotContact: row.do_not_contact,
    notes: row.notes,
    lastVerifiedAt: row.last_verified_at,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  query: z.string().trim().max(160).optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
  professionalType: z.string().trim().max(40).optional().default(""),
  verificationStatus: z.string().trim().max(40).optional().default(""),
  availabilityStatus: z.string().trim().max(40).optional().default(""),
  relationshipStage: z.string().trim().max(40).optional().default(""),
  doNotContact: z.boolean().nullable().optional(),
});

export type ProfessionalListInput = z.infer<typeof listInput>;

export type ProfessionalListResult = {
  rows: Professional[];
  total: number;
  page: number;
  pageSize: number;
  applied: boolean;
};

export const getProfessionals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ProfessionalListResult> => {
    const empty: ProfessionalListResult = {
      rows: [],
      total: 0,
      page: data.page,
      pageSize: data.pageSize,
      applied: false,
    };
    let query = context.supabase
      .from("professionals")
      .select("*", { count: "exact" })
      .eq("owner_id", context.userId);
    if (data.query) {
      const term = data.query.replace(/[(),]/g, " ").trim();
      if (term) {
        query = query.or(
          `full_name.ilike.%${term}%,headline.ilike.%${term}%,public_email.ilike.%${term}%,website.ilike.%${term}%,city.ilike.%${term}%,country.ilike.%${term}%`,
        );
      }
    }
    if (data.country) query = query.ilike("country", `%${data.country}%`);
    if (data.professionalType) query = query.eq("professional_type", data.professionalType);
    if (data.verificationStatus) query = query.eq("verification_status", data.verificationStatus);
    if (data.availabilityStatus) query = query.eq("availability_status", data.availabilityStatus);
    if (data.relationshipStage) query = query.eq("relationship_stage", data.relationshipStage);
    if (data.doNotContact !== null && data.doNotContact !== undefined) {
      query = query.eq("do_not_contact", data.doNotContact);
    }
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await query.order("updated_at", { ascending: false }).range(from, from + data.pageSize - 1);
    if (error) {
      if (isMissing(error.message)) return empty;
      throw new Error(error.message);
    }
    return {
      rows: (rows ?? []).map(toProfessional),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      applied: true,
    };
  });

export type ProfessionalSummary = {
  total: number;
  verified: number;
  openToWork: number;
  doNotContact: number;
  withEmail: number;
  withPhone: number;
};

type CountQuery = PromiseLike<{ count: number | null }>;

async function n(q: CountQuery): Promise<number> {
  const { count } = await q;
  return count ?? 0;
}

export const getProfessionalSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfessionalSummary> => {
    const head = () =>
      context.supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", context.userId);
    try {
      const [total, verified, openToWork, doNotContact, withEmail, withPhone] = await Promise.all([
        n(head()),
        n(head().in("verification_status", ["corroborated", "owner_confirmed"])),
        n(head().eq("availability_status", "open")),
        n(head().eq("do_not_contact", true)),
        n(head().not("public_email", "is", null)),
        n(head().not("public_phone", "is", null)),
      ]);
      return { total, verified, openToWork, doNotContact, withEmail, withPhone };
    } catch {
      return { total: 0, verified: 0, openToWork: 0, doNotContact: 0, withEmail: 0, withPhone: 0 };
    }
  });

const evidenceInput = z.object({
  kind: z.enum(["public_profile", "website", "registry", "owner", "other"]),
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000).nullable().optional(),
  observedAt: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const saveInput = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(1).max(200),
  headline: z.string().trim().max(300).nullable().optional(),
  professionalType: z
    .enum([...PROFESSIONAL_TYPES] as [ProfessionalType, ...ProfessionalType[]])
    .default("other"),
  country: z.string().trim().max(80).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  languages: z.array(z.string().trim().max(60)).max(20).default([]),
  expertise: z.array(z.string().trim().max(80)).max(40).default([]),
  skills: z.array(z.string().trim().max(80)).max(40).default([]),
  website: z.string().trim().max(2000).nullable().optional(),
  publicEmail: z.string().trim().max(320).nullable().optional(),
  publicPhone: z.string().trim().max(40).nullable().optional(),
  profileUrl: z.string().trim().max(2000).nullable().optional(),
  sourceName: z.string().trim().max(200).nullable().optional(),
  sourceUrl: z.string().trim().max(2000).nullable().optional(),
  evidence: z.array(evidenceInput).max(50).default([]),
  confidence: z.number().min(0).max(1).optional(),
  verificationStatus: z
    .enum([...PROFESSIONAL_VERIFICATION_STATUSES] as [
      ProfessionalVerificationStatus,
      ...ProfessionalVerificationStatus[],
    ])
    .default("unverified"),
  availabilityStatus: z
    .enum([...PROFESSIONAL_AVAILABILITY_STATUSES] as [
      ProfessionalAvailabilityStatus,
      ...ProfessionalAvailabilityStatus[],
    ])
    .default("unknown"),
  relationshipStage: z
    .enum([...PROFESSIONAL_STAGES] as [ProfessionalStage, ...ProfessionalStage[]])
    .default("researching"),
  doNotContact: z.boolean().default(false),
  notes: z.string().trim().max(4000).nullable().optional(),
  lastVerifiedAt: z.string().trim().max(60).nullable().optional(),
});

export type SaveProfessionalInput = z.infer<typeof saveInput>;

export const saveProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }): Promise<Professional> => {
    const normalized = normalizeProfessional(data as unknown as ProfessionalInput);
    const validation = validateProfessional(normalized);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const dedupeKey = professionalDedupeKey(normalized);
    const row = {
      owner_id: context.userId,
      full_name: normalized.fullName,
      headline: normalized.headline ?? null,
      professional_type: normalized.professionalType ?? "other",
      country: normalized.country ?? null,
      region: normalized.region ?? null,
      city: normalized.city ?? null,
      languages: normalized.languages ?? [],
      expertise: normalized.expertise ?? [],
      skills: normalized.skills ?? [],
      website: normalized.website ?? null,
      public_email: normalized.publicEmail ?? null,
      public_phone: normalized.publicPhone ?? null,
      profile_url: normalized.profileUrl ?? null,
      source_name: normalized.sourceName ?? null,
      source_url: normalized.sourceUrl ?? null,
      evidence: (normalized.evidence ?? []) as unknown as Json,
      confidence: normalized.confidence ?? suggestConfidence(normalized),
      verification_status: normalized.verificationStatus ?? "unverified",
      availability_status: normalized.availabilityStatus ?? "unknown",
      relationship_stage: normalized.relationshipStage ?? "researching",
      do_not_contact: normalized.doNotContact ?? false,
      notes: normalized.notes ?? null,
      last_verified_at: normalized.lastVerifiedAt ?? null,
      dedupe_key: dedupeKey,
      updated_at: new Date().toISOString(),
      ...(data.id ? { id: data.id } : {}),
    };
    const { data: saved, error } = await context.supabase
      .from("professionals")
      .upsert(row, { onConflict: data.id ? "id" : "owner_id,dedupe_key" })
      .select("*")
      .single();
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("professionals"));
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error(
          "Another professional already uses this profile, email or phone. Open that record instead.",
        );
      }
      throw new Error(error.message);
    }
    return toProfessional(saved);
  });

export const deleteProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("professionals")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ProfessionalLink = {
  id: string;
  professionalId: string;
  businessId: string;
  businessName: string;
  role: string | null;
  relationshipType: string;
  confidence: number;
  verified: boolean;
  evidence: ProfessionalEvidence[];
};

export const getProfessionalLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ professionalIds: z.array(z.string().uuid()).max(100).default([]) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ProfessionalLink[]> => {
    if (data.professionalIds.length === 0) return [];
    const { data: links, error } = await context.supabase
      .from("professional_business_links")
      .select("*")
      .eq("owner_id", context.userId)
      .in("professional_id", data.professionalIds)
      .order("updated_at", { ascending: false });
    if (error) {
      if (isMissing(error.message)) return [];
      throw new Error(error.message);
    }
    const rows = (links ?? []) as LinkRow[];
    const businessIds = [...new Set(rows.map((r) => r.business_id))];
    if (businessIds.length === 0) return [];
    const { data: businesses, error: bizErr } = await context.supabase
      .from("businesses")
      .select("id,name")
      .eq("owner_id", context.userId)
      .in("id", businessIds);
    if (bizErr) throw new Error(bizErr.message);
    const names = new Map((businesses ?? []).map((b) => [b.id, b.name]));
    return rows.map((r) => ({
      id: r.id,
      professionalId: r.professional_id,
      businessId: r.business_id,
      businessName: names.get(r.business_id) ?? "Business",
      role: r.role,
      relationshipType: r.relationship_type,
      confidence: r.confidence,
      verified: r.verified,
      evidence: (r.evidence ?? []) as unknown as ProfessionalEvidence[],
    }));
  });

const linkInput = z.object({
  professionalId: z.string().uuid(),
  businessId: z.string().uuid(),
  role: z.string().trim().max(200).nullable().optional(),
  relationshipType: z
    .enum([...PROFESSIONAL_LINK_TYPES] as [ProfessionalLinkType, ...ProfessionalLinkType[]])
    .default("works_at"),
  confidence: z.number().min(0).max(1).default(0.5),
  verified: z.boolean().default(false),
  evidence: z.array(evidenceInput).max(50).default([]),
});

export const linkProfessionalToBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => linkInput.parse(d))
  .handler(async ({ data, context }): Promise<ProfessionalLink> => {
    const { data: professional, error: pErr } = await context.supabase
      .from("professionals")
      .select("id")
      .eq("owner_id", context.userId)
      .eq("id", data.professionalId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!professional) throw new Error("Professional not found.");
    const { data: business, error: bErr } = await context.supabase
      .from("businesses")
      .select("id,name")
      .eq("owner_id", context.userId)
      .eq("id", data.businessId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!business) throw new Error("Business not found.");
    const { data: link, error } = await context.supabase
      .from("professional_business_links")
      .upsert(
        {
          owner_id: context.userId,
          professional_id: data.professionalId,
          business_id: data.businessId,
          role: data.role ?? null,
          relationship_type: data.relationshipType,
          confidence: data.confidence,
          verified: data.verified,
          evidence: (data.evidence ?? []) as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,professional_id,business_id,relationship_type" },
      )
      .select("*")
      .single();
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("professional_business_links"));
      throw new Error(error.message);
    }
    return {
      id: link.id,
      professionalId: link.professional_id,
      businessId: link.business_id,
      businessName: business.name,
      role: link.role,
      relationshipType: link.relationship_type,
      confidence: link.confidence,
      verified: link.verified,
      evidence: (link.evidence ?? []) as unknown as ProfessionalEvidence[],
    };
  });

export const unlinkProfessionalFromBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("professional_business_links")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
