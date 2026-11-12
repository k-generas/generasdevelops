import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import type { ExportColumn } from "./export-safe";
import {
  PROSPECT_ENTITY_KINDS,
  normalizeProspectFilters,
  readProspectFilters,
  validateProspectList,
  type ProspectEntityKind,
  type ProspectFilters,
  type ProspectList,
} from "./prospect-lists";
import {
  countProspects,
  loadBusinessExportRows,
  loadProfessionalExportRows,
} from "./prospect-queries.server";

type ListRow = Database["public"]["Tables"]["prospect_lists"]["Row"];
type ListInsert = Database["public"]["Tables"]["prospect_lists"]["Insert"];
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type ProfessionalRow = Database["public"]["Tables"]["professionals"]["Row"];

const MISSING_MESSAGE =
  "The prospect_lists table is not available yet. Apply the prospect lists migration and try again.";

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function toProspectList(row: ListRow): ProspectList {
  const kind = row.entity_kind === "professional" ? "professional" : "business";
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    entityKind: kind,
    filters: readProspectFilters(row.filters, kind),
    filterVersion: row.filter_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const filterInput = z.object({
  query: z.string().max(160).optional().default(""),
  location: z.string().max(120).optional().default(""),
  district: z.string().max(120).optional().default(""),
  sector: z.string().max(120).optional().default(""),
  stage: z.string().max(80).optional().default(""),
  country: z.string().max(80).optional().default(""),
  professionalType: z.string().max(40).optional().default(""),
  availability: z.string().max(40).optional().default(""),
});

const kindInput = z.enum([...PROSPECT_ENTITY_KINDS] as [
  ProspectEntityKind,
  ...ProspectEntityKind[],
]);

export type ProspectListResult = {
  rows: ProspectList[];
  applied: boolean;
};

export const getProspectLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProspectListResult> => {
    const { data, error } = await context.supabase
      .from("prospect_lists")
      .select("*")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isMissing(error.message)) return { rows: [], applied: false };
      throw new Error(error.message);
    }
    return { rows: (data ?? []).map(toProspectList), applied: true };
  });

const saveInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  entityKind: kindInput,
  filters: filterInput,
});

export type SaveProspectListInput = z.infer<typeof saveInput>;

export const saveProspectList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }): Promise<ProspectList> => {
    const filters = normalizeProspectFilters(data.filters, data.entityKind);
    const validation = validateProspectList({
      name: data.name,
      entityKind: data.entityKind,
      filters,
    });
    if (!validation.valid) throw new Error(validation.errors.join(" "));

    const row: ListInsert = {
      owner_id: context.userId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      entity_kind: data.entityKind,
      filters: filters as unknown as Json,
      updated_at: new Date().toISOString(),
    };
    if (data.id) row.id = data.id;
    const { data: saved, error } = await context.supabase
      .from("prospect_lists")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (error) {
      if (isMissing(error.message)) throw new Error(MISSING_MESSAGE);
      throw new Error(error.message);
    }
    return toProspectList(saved);
  });

export const deleteProspectList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("prospect_lists")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) {
      if (isMissing(error.message)) throw new Error(MISSING_MESSAGE);
      throw new Error(error.message);
    }
    return { ok: true };
  });

const BUSINESS_COLUMNS: ExportColumn[] = [
  { key: "id", label: "id" },
  { key: "name", label: "name" },
  { key: "category", label: "category" },
  { key: "district", label: "district" },
  { key: "province", label: "province" },
  { key: "address", label: "address" },
  { key: "phone", label: "phone" },
  { key: "emails", label: "emails" },
  { key: "website", label: "website" },
  { key: "do_not_contact", label: "do_not_contact" },
  { key: "suppression_reason", label: "suppression_reason" },
  { key: "sector", label: "sector" },
  { key: "industry", label: "industry" },
  { key: "outreach_stage", label: "outreach_stage" },
  { key: "created_at", label: "created_at" },
  { key: "updated_at", label: "updated_at" },
];

const PROFESSIONAL_COLUMNS: ExportColumn[] = [
  { key: "id", label: "id" },
  { key: "full_name", label: "full_name" },
  { key: "headline", label: "headline" },
  { key: "professional_type", label: "professional_type" },
  { key: "country", label: "country" },
  { key: "city", label: "city" },
  { key: "languages", label: "languages" },
  { key: "expertise", label: "expertise" },
  { key: "skills", label: "skills" },
  { key: "website", label: "website" },
  { key: "public_email", label: "public_email" },
  { key: "public_phone", label: "public_phone" },
  { key: "profile_url", label: "profile_url" },
  { key: "source_name", label: "source_name" },
  { key: "source_url", label: "source_url" },
  { key: "availability_status", label: "availability_status" },
  { key: "relationship_stage", label: "relationship_stage" },
  { key: "do_not_contact", label: "do_not_contact" },
  { key: "created_at", label: "created_at" },
  { key: "updated_at", label: "updated_at" },
];

function businessRecord(row: BusinessRow): Record<string, string> {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? "",
    district: row.district ?? "",
    province: row.province ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    emails: (row.emails ?? []).join("; "),
    website: row.website ?? "",
    do_not_contact: row.contact_suppressed ? "yes" : "no",
    suppression_reason: row.suppression_reason ?? "",
    sector: row.sector ?? "",
    industry: row.industry ?? "",
    outreach_stage: row.outreach_stage ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

function professionalRecord(row: ProfessionalRow): Record<string, string> {
  return {
    id: row.id,
    full_name: row.full_name,
    headline: row.headline ?? "",
    professional_type: row.professional_type ?? "",
    country: row.country ?? "",
    city: row.city ?? "",
    languages: (row.languages ?? []).join("; "),
    expertise: (row.expertise ?? []).join("; "),
    skills: (row.skills ?? []).join("; "),
    website: row.website ?? "",
    public_email: row.public_email ?? "",
    public_phone: row.public_phone ?? "",
    profile_url: row.profile_url ?? "",
    source_name: row.source_name ?? "",
    source_url: row.source_url ?? "",
    availability_status: row.availability_status ?? "",
    relationship_stage: row.relationship_stage ?? "",
    do_not_contact: row.do_not_contact ? "yes" : "no",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

async function loadResults(
  supabase: Parameters<typeof countProspects>[0],
  ownerId: string,
  kind: ProspectEntityKind,
  filters: ProspectFilters,
  limit: number,
): Promise<{
  count: number;
  rows: Record<string, string>[];
  columns: ExportColumn[];
}> {
  const count = await countProspects(supabase, ownerId, kind, filters);
  if (kind === "business") {
    const rows = await loadBusinessExportRows(supabase, ownerId, filters, limit);
    return { count, rows: rows.map(businessRecord), columns: BUSINESS_COLUMNS };
  }
  const rows = await loadProfessionalExportRows(supabase, ownerId, filters, limit);
  return { count, rows: rows.map(professionalRecord), columns: PROFESSIONAL_COLUMNS };
}

export type ProspectResults = {
  list: ProspectList | null;
  count: number;
  rows: Record<string, string>[];
  columns: ExportColumn[];
  truncated: boolean;
  applied: boolean;
};

const resultsInput = z
  .object({
    id: z.string().uuid().optional(),
    entityKind: kindInput.optional(),
    filters: filterInput.optional(),
    limit: z.number().int().min(1).max(5000).default(100),
  })
  .refine((value) => !!value.id || !!value.entityKind, {
    message: "Choose a saved list or an audience.",
  });

export type ProspectResultsInput = z.infer<typeof resultsInput>;

export const getProspectResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => resultsInput.parse(d))
  .handler(async ({ data, context }): Promise<ProspectResults> => {
    let list: ProspectList | null = null;
    let kind: ProspectEntityKind;
    let filters: ProspectFilters;

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("prospect_lists")
        .select("*")
        .eq("owner_id", context.userId)
        .eq("id", data.id)
        .maybeSingle();
      if (error) {
        if (isMissing(error.message)) {
          return {
            list: null,
            count: 0,
            rows: [],
            columns: [],
            truncated: false,
            applied: false,
          };
        }
        throw new Error(error.message);
      }
      if (!row) throw new Error("Prospect list not found.");
      list = toProspectList(row);
      kind = list.entityKind;
      filters = list.filters;
    } else {
      kind = data.entityKind!;
      filters = normalizeProspectFilters(data.filters ?? {}, kind);
    }

    const loaded = await loadResults(context.supabase, context.userId, kind, filters, data.limit);
    return {
      list,
      count: loaded.count,
      rows: loaded.rows,
      columns: loaded.columns,
      truncated: loaded.count > loaded.rows.length,
      applied: true,
    };
  });
