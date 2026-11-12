import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CampaignTarget } from "./campaign";
import { normalizeUrl } from "./professional-intelligence";
import type { ProspectEntityKind, ProspectFilters } from "./prospect-lists";

type Client = SupabaseClient<Database>;
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type ProfessionalRow = Database["public"]["Tables"]["professionals"]["Row"];

type FilterableQuery<Q> = {
  or(filters: string): Q;
  ilike(column: string, pattern: string): Q;
  eq(column: string, value: string): Q;
};

const BUSINESS_TARGET_COLUMNS =
  "id,name,emails,phone,website,district,province,sector,industry,outreach_stage,address,contact_suppressed";
const PROFESSIONAL_TARGET_COLUMNS =
  "id,full_name,public_email,public_phone,website,country,headline,do_not_contact,availability_status,professional_type";
const BUSINESS_EXPORT_COLUMNS =
  "id,name,category,district,province,address,phone,emails,website,contact_suppressed,suppression_reason,sector,industry,outreach_stage,created_at,updated_at";
const PROFESSIONAL_EXPORT_COLUMNS =
  "id,full_name,headline,professional_type,country,city,languages,expertise,skills,website,public_email,public_phone,profile_url,source_name,source_url,availability_status,relationship_stage,do_not_contact,created_at,updated_at";

function term(value: string): string {
  return value.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

function applyBusinessFilters<Q extends FilterableQuery<Q>>(query: Q, filters: ProspectFilters): Q {
  let next = query;
  const search = term(filters.query);
  if (search) {
    next = next.or(
      `name.ilike.%${search}%,sector.ilike.%${search}%,industry.ilike.%${search}%,district.ilike.%${search}%`,
    );
  }
  const location = term(filters.location);
  if (location) {
    next = next.or(
      `district.ilike.%${location}%,province.ilike.%${location}%,address.ilike.%${location}%`,
    );
  }
  if (filters.district) next = next.ilike("district", `%${filters.district}%`);
  if (filters.sector) next = next.eq("sector", filters.sector);
  if (filters.stage) next = next.eq("outreach_stage", filters.stage);
  return next;
}

function applyProfessionalFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  filters: ProspectFilters,
): Q {
  let next = query;
  const search = term(filters.query);
  if (search) {
    next = next.or(
      `full_name.ilike.%${search}%,headline.ilike.%${search}%,country.ilike.%${search}%,city.ilike.%${search}%`,
    );
  }
  const location = term(filters.location);
  if (location) {
    next = next.or(
      `country.ilike.%${location}%,region.ilike.%${location}%,city.ilike.%${location}%`,
    );
  }
  if (filters.country) next = next.ilike("country", `%${filters.country}%`);
  if (filters.professionalType) next = next.eq("professional_type", filters.professionalType);
  if (filters.availability) next = next.eq("availability_status", filters.availability);
  return next;
}

export function businessTargetQuery(client: Client, ownerId: string, filters: ProspectFilters) {
  const query = client.from("businesses").select(BUSINESS_TARGET_COLUMNS).eq("owner_id", ownerId);
  return applyBusinessFilters(query, filters);
}

export function professionalTargetQuery(client: Client, ownerId: string, filters: ProspectFilters) {
  const query = client
    .from("professionals")
    .select(PROFESSIONAL_TARGET_COLUMNS)
    .eq("owner_id", ownerId);
  return applyProfessionalFilters(query, filters);
}

function businessCountQuery(client: Client, ownerId: string, filters: ProspectFilters) {
  const query = client
    .from("businesses")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  return applyBusinessFilters(query, filters);
}

function professionalCountQuery(client: Client, ownerId: string, filters: ProspectFilters) {
  const query = client
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  return applyProfessionalFilters(query, filters);
}

export async function countProspects(
  client: Client,
  ownerId: string,
  kind: ProspectEntityKind,
  filters: ProspectFilters,
): Promise<number> {
  const { count, error } =
    kind === "business"
      ? await businessCountQuery(client, ownerId, filters)
      : await professionalCountQuery(client, ownerId, filters);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function loadProspectTargets(
  client: Client,
  ownerId: string,
  kind: ProspectEntityKind,
  filters: ProspectFilters,
  limit: number,
): Promise<CampaignTarget[]> {
  if (kind === "business") {
    const { data, error } = await businessTargetQuery(client, ownerId, filters)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as BusinessRow[]).map((row) => ({
      kind: "business" as const,
      id: row.id,
      name: row.name,
      email: row.emails?.[0] ?? null,
      phone: row.phone,
      domain: normalizeUrl(row.website),
      country: row.province ?? row.district,
      website: row.website,
      context: row.sector ?? row.industry ?? row.address,
      doNotContact: !!row.contact_suppressed,
    }));
  }

  const { data, error } = await professionalTargetQuery(client, ownerId, filters)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProfessionalRow[]).map((row) => ({
    kind: "professional" as const,
    id: row.id,
    name: row.full_name,
    email: row.public_email,
    phone: row.public_phone,
    domain: normalizeUrl(row.website),
    country: row.country,
    website: row.website,
    context: row.headline,
    doNotContact: !!row.do_not_contact,
  }));
}

export async function loadBusinessExportRows(
  client: Client,
  ownerId: string,
  filters: ProspectFilters,
  limit: number,
): Promise<BusinessRow[]> {
  const query = client.from("businesses").select(BUSINESS_EXPORT_COLUMNS).eq("owner_id", ownerId);
  const { data, error } = await applyBusinessFilters(query, filters)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BusinessRow[];
}

export async function loadProfessionalExportRows(
  client: Client,
  ownerId: string,
  filters: ProspectFilters,
  limit: number,
): Promise<ProfessionalRow[]> {
  const query = client
    .from("professionals")
    .select(PROFESSIONAL_EXPORT_COLUMNS)
    .eq("owner_id", ownerId);
  const { data, error } = await applyProfessionalFilters(query, filters)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfessionalRow[];
}
