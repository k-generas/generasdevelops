import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  analyzeSocialLeadAgainstBusinesses,
  type SocialMatchBusiness,
  type SocialMatchLead,
} from "./social-business-match";

type Client = SupabaseClient<Database>;
type LeadRow = Database["public"]["Tables"]["social_leads"]["Row"];
type MatchRow = Database["public"]["Tables"]["social_business_matches"]["Row"];
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type BusinessMatchRow = Pick<
  BusinessRow,
  | "id"
  | "name"
  | "legal_name"
  | "trading_names"
  | "phone"
  | "website"
  | "address"
  | "province"
  | "district"
  | "place_id"
  | "maps_url"
  | "category"
  | "description"
  | "products_services"
  | "website_check"
  | "source"
>;
type LeadMatchRow = Pick<
  LeadRow,
  | "id"
  | "platform"
  | "handle"
  | "profile_url"
  | "display_name"
  | "biography"
  | "category"
  | "district"
  | "website"
  | "website_status"
  | "store_status"
  | "contact_phone"
  | "contact_whatsapp"
  | "followers_count"
  | "last_post_at"
  | "last_checked_at"
  | "updated_at"
  | "source"
  | "business_id"
  | "account_type"
  | "account_type_evidence"
  | "match_checked_at"
>;

const BUSINESS_COLUMNS =
  "id,name,legal_name,trading_names,phone,website,address,province,district,place_id,maps_url,category,description,products_services,website_check,source" as const;
const LEAD_COLUMNS =
  "id,platform,handle,profile_url,display_name,biography,category,district,website,website_status,store_status,contact_phone,contact_whatsapp,followers_count,last_post_at,last_checked_at,updated_at,source,business_id,account_type,account_type_evidence,match_checked_at" as const;
const AUTO_STATUSES = ["high_confidence", "possible", "conflicting"] as const;

export type SocialBusinessMatchLeadSummary = {
  id: string;
  platform: string;
  handle: string;
  profile_url: string;
  display_name: string | null;
  category: string | null;
  district: string | null;
  website: string | null;
  website_status: string;
  store_status: string;
  followers_count: number | null;
  last_post_at: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  account_type: string;
  business_id: string | null;
};

export type SocialBusinessMatchBusinessSummary = {
  id: string;
  name: string;
  district: string | null;
  place_id: string | null;
  maps_url: string | null;
  website: string | null;
};

export type SocialBusinessMatchView = MatchRow & {
  social_lead: SocialBusinessMatchLeadSummary;
  business: SocialBusinessMatchBusinessSummary | null;
};

export type SocialBusinessMatchSummary = {
  total: number;
  high_confidence: number;
  possible: number;
  conflicting: number;
  confirmed: number;
  rejected: number;
};

export type SocialBusinessMatchListResult = {
  matches: SocialBusinessMatchView[];
  summary: SocialBusinessMatchSummary;
  lastCheckedAt: string | null;
  tableReady: boolean;
  tableError: string | null;
  missingLeads: number;
};

export type RunSocialBusinessMatchingResult = {
  leadsScanned: number;
  businessesCompared: number;
  candidatesSaved: number;
  highConfidence: number;
  possible: number;
  conflicting: number;
  autoLinked: number;
  unmatchedLeads: number;
  errors: string[];
  requestCostUsd: 0;
};

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(error?.message ?? ""),
  );
}

function emptySummary(): SocialBusinessMatchSummary {
  return { total: 0, high_confidence: 0, possible: 0, conflicting: 0, confirmed: 0, rejected: 0 };
}

function toBusiness(row: BusinessMatchRow): SocialMatchBusiness {
  return {
    id: row.id,
    name: row.name,
    legal_name: row.legal_name,
    trading_names: row.trading_names,
    phone: row.phone,
    website: row.website,
    address: row.address,
    province: row.province,
    district: row.district,
    place_id: row.place_id,
    maps_url: row.maps_url,
    category: row.category,
    description: row.description,
    products_services: row.products_services,
    website_check: row.website_check,
    source: row.source,
  };
}

function toLead(row: LeadMatchRow): SocialMatchLead {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    profile_url: row.profile_url,
    display_name: row.display_name,
    biography: row.biography,
    category: row.category,
    district: row.district,
    website: row.website,
    website_status: row.website_status,
    store_status: row.store_status,
    contact_phone: row.contact_phone,
    contact_whatsapp: row.contact_whatsapp,
    followers_count: row.followers_count,
    last_post_at: row.last_post_at,
    last_checked_at: row.last_checked_at,
    updated_at: row.updated_at,
    source: row.source,
    business_id: row.business_id,
  };
}

function leadSummary(row: LeadMatchRow): SocialBusinessMatchLeadSummary {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    profile_url: row.profile_url,
    display_name: row.display_name,
    category: row.category,
    district: row.district,
    website: row.website,
    website_status: row.website_status,
    store_status: row.store_status,
    followers_count: row.followers_count,
    last_post_at: row.last_post_at,
    contact_phone: row.contact_phone,
    contact_whatsapp: row.contact_whatsapp,
    account_type: row.account_type,
    business_id: row.business_id,
  };
}

function businessSummary(
  row: BusinessMatchRow | undefined,
): SocialBusinessMatchBusinessSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    place_id: row.place_id,
    maps_url: row.maps_url,
    website: row.website,
  };
}

async function loadBusinesses(
  supabase: Client,
  businessId: string | null,
): Promise<BusinessMatchRow[]> {
  if (businessId) {
    const { data, error } = await supabase
      .from("businesses")
      .select(BUSINESS_COLUMNS)
      .eq("id", businessId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data && data.source === "google_places" && !data.place_id.startsWith("social:")
      ? [data]
      : [];
  }

  const rows: BusinessMatchRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("businesses")
      .select(BUSINESS_COLUMNS)
      .eq("source", "google_places")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).filter((row) => !row.place_id.startsWith("social:"));
    rows.push(...page);
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadLeads(
  supabase: Client,
  socialLeadId: string | null,
  limit: number,
): Promise<LeadMatchRow[]> {
  if (socialLeadId) {
    const { data, error } = await supabase
      .from("social_leads")
      .select(LEAD_COLUMNS)
      .eq("id", socialLeadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? [data] : [];
  }

  const { data, error } = await supabase
    .from("social_leads")
    .select(LEAD_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const listInput = z
  .object({
    businessId: z.string().uuid().optional(),
    socialLeadId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .optional();

export const getSocialBusinessMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => listInput.parse(data))
  .handler(async ({ data, context }): Promise<SocialBusinessMatchListResult> => {
    let query = context.supabase
      .from("social_business_matches")
      .select("*")
      .order("confidence", { ascending: false })
      .limit(data?.limit ?? 200);
    if (data?.businessId) query = query.eq("business_id", data.businessId);
    if (data?.socialLeadId) query = query.eq("social_lead_id", data.socialLeadId);

    const { data: rows, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return {
          matches: [],
          summary: emptySummary(),
          lastCheckedAt: null,
          tableReady: false,
          tableError: error.message,
          missingLeads: 0,
        };
      }
      throw new Error(error.message);
    }

    const matches = rows ?? [];
    const countScoped = () => {
      let countQuery = context.supabase
        .from("social_business_matches")
        .select("*", { count: "exact", head: true });
      if (data?.businessId) countQuery = countQuery.eq("business_id", data.businessId);
      if (data?.socialLeadId) countQuery = countQuery.eq("social_lead_id", data.socialLeadId);
      return countQuery;
    };
    const statusKeys = [
      "high_confidence",
      "possible",
      "conflicting",
      "confirmed",
      "rejected",
    ] as const;
    const statusCounts = await Promise.all(
      statusKeys.map(async (status) => {
        const { count, error: countError } = await countScoped().eq("status", status);
        if (countError) throw new Error(countError.message);
        return count ?? 0;
      }),
    );
    const exactSummary = emptySummary();
    statusKeys.forEach((status, index) => {
      const count = statusCounts[index] ?? 0;
      exactSummary[status] = count;
      exactSummary.total += count;
    });

    if (matches.length === 0) {
      return {
        matches: [],
        summary: exactSummary,
        lastCheckedAt: null,
        tableReady: true,
        tableError: null,
        missingLeads: 0,
      };
    }

    const leadIds = Array.from(new Set(matches.map((row) => row.social_lead_id)));
    const businessIds = Array.from(new Set(matches.map((row) => row.business_id)));
    const [leadsResult, businessesResult] = await Promise.all([
      context.supabase.from("social_leads").select(LEAD_COLUMNS).in("id", leadIds),
      context.supabase.from("businesses").select(BUSINESS_COLUMNS).in("id", businessIds),
    ]);
    if (leadsResult.error) throw new Error(leadsResult.error.message);
    if (businessesResult.error) throw new Error(businessesResult.error.message);

    const leads = new Map((leadsResult.data ?? []).map((row) => [row.id, row]));
    const businesses = new Map((businessesResult.data ?? []).map((row) => [row.id, row]));
    const views: SocialBusinessMatchView[] = [];
    for (const row of matches) {
      const lead = leads.get(row.social_lead_id);
      if (!lead) continue;
      views.push({
        ...row,
        social_lead: leadSummary(lead),
        business: businessSummary(businesses.get(row.business_id)),
      });
    }

    const lastCheckedAt =
      views.map((row) => row.matched_at).sort((a, b) => b.localeCompare(a))[0] ?? null;
    return {
      matches: views,
      summary: exactSummary,
      lastCheckedAt,
      tableReady: true,
      tableError: null,
      missingLeads: matches.length - views.length,
    };
  });

const runInput = z.object({
  businessId: z.string().uuid().optional(),
  socialLeadId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(1000),
});

export const runSocialBusinessMatching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => runInput.parse(data))
  .handler(async ({ data, context }): Promise<RunSocialBusinessMatchingResult> => {
    const [businesses, leads] = await Promise.all([
      loadBusinesses(context.supabase, data.businessId ?? null),
      loadLeads(context.supabase, data.socialLeadId ?? null, data.limit),
    ]);

    const result: RunSocialBusinessMatchingResult = {
      leadsScanned: 0,
      businessesCompared: businesses.length,
      candidatesSaved: 0,
      highConfidence: 0,
      possible: 0,
      conflicting: 0,
      autoLinked: 0,
      unmatchedLeads: 0,
      errors: [],
      requestCostUsd: 0,
    };
    if (leads.length === 0 || businesses.length === 0) return result;

    const leadIds = leads.map((lead) => lead.id);
    const existingResult = await context.supabase
      .from("social_business_matches")
      .select("*")
      .in("social_lead_id", leadIds);
    if (existingResult.error) {
      if (isMissingTable(existingResult.error)) {
        throw new Error(
          "Social matching is not set up yet. Apply supabase/migrations/20261105000000_social_business_matches.sql.",
        );
      }
      throw new Error(existingResult.error.message);
    }

    const existingByLead = new Map<string, MatchRow[]>();
    for (const row of existingResult.data ?? []) {
      const list = existingByLead.get(row.social_lead_id) ?? [];
      list.push(row);
      existingByLead.set(row.social_lead_id, list);
    }
    const businessById = new Map(businesses.map((business) => [business.id, business]));
    const now = new Date();
    const scannedAt = now.toISOString();

    for (const lead of leads) {
      if (lead.business_id && data.businessId && lead.business_id !== data.businessId) continue;

      const analysis = analyzeSocialLeadAgainstBusinesses(
        toLead(lead),
        businesses.map(toBusiness),
        now,
      );
      const existing = existingByLead.get(lead.id) ?? [];
      const reviewedBusinessIds = new Set(
        existing
          .filter((row) => row.status === "confirmed" || row.status === "rejected")
          .map((row) => row.business_id),
      );
      const autoBusiness =
        analysis.auto_link_business_id && businessById.has(analysis.auto_link_business_id)
          ? analysis.auto_link_business_id
          : null;
      const shouldAutoLink = Boolean(autoBusiness && !lead.business_id);
      const nextBusinessId = shouldAutoLink ? autoBusiness : lead.business_id;

      const leadUpdate: Database["public"]["Tables"]["social_leads"]["Update"] = {
        account_type: analysis.account.type,
        account_type_evidence: analysis.account.evidence as unknown as Json,
        match_checked_at: scannedAt,
        business_id: nextBusinessId,
        updated_at: scannedAt,
      };
      const leadSave = await context.supabase
        .from("social_leads")
        .update(leadUpdate)
        .eq("id", lead.id)
        .eq("owner_id", context.userId);
      if (leadSave.error) {
        result.errors.push(`@${lead.handle}: ${leadSave.error.message}`);
      } else {
        result.leadsScanned += 1;
        if (shouldAutoLink) result.autoLinked += 1;
      }

      const candidateIds = new Set<string>();
      for (const candidate of analysis.candidates) {
        candidateIds.add(candidate.business_id);
        if (reviewedBusinessIds.has(candidate.business_id)) continue;

        const { error } = await context.supabase.from("social_business_matches").upsert(
          {
            owner_id: context.userId,
            social_lead_id: lead.id,
            business_id: candidate.business_id,
            status: candidate.status,
            confidence: candidate.confidence,
            signals: candidate.signals as unknown as Json,
            evidence: candidate.evidence as unknown as Json,
            opportunity_gaps: candidate.opportunity_gaps as unknown as Json,
            solution_fits: candidate.solution_fits as unknown as Json,
            reason: candidate.reason,
            matched_at: candidate.matched_at,
            updated_at: scannedAt,
          },
          { onConflict: "owner_id,social_lead_id,business_id" },
        );
        if (error) {
          result.errors.push(`@${lead.handle}: ${error.message}`);
          continue;
        }
        result.candidatesSaved += 1;
        if (candidate.status === "high_confidence") result.highConfidence += 1;
        if (candidate.status === "possible") result.possible += 1;
        if (candidate.status === "conflicting") result.conflicting += 1;
      }

      if (!data.businessId) {
        const staleIds = existing
          .filter(
            (row) =>
              AUTO_STATUSES.includes(row.status as (typeof AUTO_STATUSES)[number]) &&
              !candidateIds.has(row.business_id),
          )
          .map((row) => row.id);
        if (staleIds.length > 0) {
          const staleDelete = await context.supabase
            .from("social_business_matches")
            .delete()
            .eq("owner_id", context.userId)
            .in("id", staleIds);
          if (staleDelete.error) {
            result.errors.push(`@${lead.handle}: ${staleDelete.error.message}`);
          }
        }
      }

      if (analysis.candidates.length === 0) result.unmatchedLeads += 1;
    }

    return result;
  });

const reviewInput = z.object({
  matchId: z.string().uuid(),
  action: z.enum(["confirm", "reject"]),
  note: z.string().trim().max(2000).optional(),
});

export const reviewSocialBusinessMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => reviewInput.parse(data))
  .handler(async ({ data, context }): Promise<MatchRow> => {
    const { data: match, error } = await context.supabase
      .from("social_business_matches")
      .select("*")
      .eq("id", data.matchId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) throw new Error("Match not found or not accessible to this account.");

    const { data: lead, error: leadError } = await context.supabase
      .from("social_leads")
      .select("*")
      .eq("id", match.social_lead_id)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Social lead not found or not accessible to this account.");

    if (data.action === "confirm" && lead.business_id && lead.business_id !== match.business_id) {
      throw new Error(
        "This social lead is already linked to another business. Reject that link before confirming this one.",
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await context.supabase
      .from("social_business_matches")
      .update({
        status: data.action === "confirm" ? "confirmed" : "rejected",
        review_note: data.note ?? null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", match.id)
      .eq("owner_id", context.userId)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    const nextBusinessId =
      data.action === "confirm"
        ? match.business_id
        : lead.business_id === match.business_id
          ? null
          : lead.business_id;
    if (nextBusinessId !== lead.business_id) {
      const { error: linkError } = await context.supabase
        .from("social_leads")
        .update({
          business_id: nextBusinessId,
          updated_at: now,
        })
        .eq("id", lead.id)
        .eq("owner_id", context.userId);
      if (linkError) throw new Error(linkError.message);
    }

    return updated;
  });
