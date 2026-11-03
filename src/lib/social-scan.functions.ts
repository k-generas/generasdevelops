import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  mergePrimarySocialMap,
  parseSocialProfileUrl,
  platformFromSourceId,
  removeSocialUrl,
  SOCIAL_PLATFORM_LABELS,
  socialMap,
  type SocialProfile,
  type SocialProfileMethod,
  type SocialProfileStatus,
} from "./social-profiles";
import { scanSocialProfiles } from "./social-scan.server";

type Client = SupabaseClient<Database>;

type SourceRow = {
  source_id: string;
  source_name: string;
  method: string;
  url: string | null;
  excerpt: string | null;
  confidence: number;
  status: string;
  first_seen_at: string;
  last_checked_at: string;
  last_verified_at: string | null;
};

export type SocialScanSummary = {
  profiles: SocialProfile[];
  scanned: number;
  confirmed: number;
  blocked: number;
  inaccessible: number;
  unverified: number;
  skipped: number;
  errors: string[];
  checkedAt: string;
};

function readStatus(value: string): SocialProfileStatus {
  return value === "confirmed" || value === "blocked" || value === "inaccessible"
    ? value
    : "unverified";
}

function readMethod(value: string): SocialProfileMethod {
  return value === "manual" ? "manual" : "website_link";
}

function rowToProfile(row: SourceRow): SocialProfile {
  const parsed = parseSocialProfileUrl(row.url ?? "");
  const platform = parsed.ok ? parsed.profile.platform : platformFromSourceId(row.source_id);
  const base = parsed.ok
    ? parsed.profile
    : {
        sourceId: row.source_id,
        platform,
        platformLabel: SOCIAL_PLATFORM_LABELS[platform],
        handle: null,
        url: row.url ?? "",
      };
  return {
    ...base,
    sourceId: row.source_id,
    status: readStatus(row.status),
    method: readMethod(row.method),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.5,
    excerpt: row.excerpt,
    firstSeenAt: row.first_seen_at,
    lastCheckedAt: row.last_checked_at,
    lastVerifiedAt: row.last_verified_at,
    persisted: true,
  };
}

async function readProfiles(
  supabase: Client,
  businessId: string,
  savedSocials: unknown,
): Promise<SocialProfile[]> {
  const { data, error } = await supabase
    .from("business_sources")
    .select(
      "source_id, source_name, method, url, excerpt, confidence, status, first_seen_at, last_checked_at, last_verified_at",
    )
    .eq("business_id", businessId)
    .eq("source_type", "social")
    .order("last_checked_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const profiles = (data ?? []).map((row) => rowToProfile(row as SourceRow));
  const seen = new Set(profiles.map((profile) => profile.sourceId));
  const now = new Date().toISOString();
  for (const url of Object.values(socialMap(savedSocials))) {
    const parsed = parseSocialProfileUrl(url);
    if (!parsed.ok || seen.has(parsed.profile.sourceId)) continue;
    profiles.push({
      ...parsed.profile,
      status: "unverified",
      method: "website_link",
      confidence: 0.6,
      excerpt: "Detected in the saved business record; run a public profile check to confirm it.",
      firstSeenAt: now,
      lastCheckedAt: now,
      lastVerifiedAt: null,
      persisted: false,
    });
    seen.add(parsed.profile.sourceId);
  }

  return profiles.sort(
    (a, b) =>
      a.platformLabel.localeCompare(b.platformLabel) ||
      (a.handle ?? "").localeCompare(b.handle ?? ""),
  );
}

async function loadBusiness(supabase: Client, businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, socials")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Business not found or not accessible to this account.");
  return data;
}

const businessInput = z.object({ businessId: z.string().uuid() });

export const getBusinessSocialProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => businessInput.parse(d))
  .handler(async ({ data, context }): Promise<SocialProfile[]> => {
    const business = await loadBusiness(context.supabase, data.businessId);
    return readProfiles(context.supabase, data.businessId, business.socials);
  });

const saveInput = z.object({
  businessId: z.string().uuid(),
  url: z.string().trim().min(1).max(1000),
});

export const saveManualSocialProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveInput.parse(d))
  .handler(async ({ data, context }): Promise<SocialProfile> => {
    const parsed = parseSocialProfileUrl(data.url);
    if (!parsed.ok) throw new Error(parsed.error);

    const business = await loadBusiness(context.supabase, data.businessId);
    const { error } = await context.supabase.from("business_sources").upsert(
      {
        owner_id: context.userId,
        business_id: data.businessId,
        source_id: parsed.profile.sourceId,
        source_name: parsed.profile.platformLabel,
        source_type: "social",
        method: "manual",
        url: parsed.profile.url,
        excerpt: "Added manually by the owner.",
        confidence: 0.6,
        status: "unverified",
        last_checked_at: new Date().toISOString(),
        last_verified_at: null,
      },
      { onConflict: "business_id,source_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);

    const profiles = await readProfiles(context.supabase, data.businessId, business.socials);
    const saved = profiles.find((profile) => profile.sourceId === parsed.profile.sourceId);
    if (!saved) throw new Error("The social profile was saved but could not be read back.");

    const nextSocials = mergePrimarySocialMap(business.socials, profiles);
    const { error: updateError } = await context.supabase
      .from("businesses")
      .update({ socials: nextSocials })
      .eq("id", data.businessId);
    if (updateError) throw new Error(updateError.message);

    return saved;
  });

const scanInput = z.object({
  businessId: z.string().uuid(),
  urls: z.array(z.string().trim().min(1).max(1000)).max(8).optional(),
});

export const scanBusinessSocialProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scanInput.parse(d))
  .handler(async ({ data, context }): Promise<SocialScanSummary> => {
    const business = await loadBusiness(context.supabase, data.businessId);
    const existing = await readProfiles(context.supabase, data.businessId, business.socials);

    const candidates = new Map<
      string,
      {
        sourceId: string;
        method: SocialProfileMethod;
        confidence: number;
        url: string;
        platform: string;
        handle: string | null;
      }
    >();
    const errors: string[] = [];

    for (const profile of existing) {
      if (!profile.url) continue;
      const parsed = parseSocialProfileUrl(profile.url);
      if (!parsed.ok) continue;
      candidates.set(profile.sourceId, {
        sourceId: profile.sourceId,
        method: profile.method,
        confidence: profile.confidence,
        url: parsed.profile.url,
        platform: parsed.profile.platformLabel,
        handle: parsed.profile.handle,
      });
    }

    for (const [index, url] of (data.urls ?? []).entries()) {
      const parsed = parseSocialProfileUrl(url);
      if (!parsed.ok) {
        errors.push(`URL ${index + 1}: ${parsed.error}`);
        continue;
      }
      candidates.set(parsed.profile.sourceId, {
        sourceId: parsed.profile.sourceId,
        method: "manual",
        confidence: 0.6,
        url: parsed.profile.url,
        platform: parsed.profile.platformLabel,
        handle: parsed.profile.handle,
      });
    }

    const parsedCandidates = [...candidates.values()]
      .map((candidate) => {
        const parsed = parseSocialProfileUrl(candidate.url);
        return parsed.ok ? parsed.profile : null;
      })
      .filter((profile) => profile !== null);

    const scan = await scanSocialProfiles(parsedCandidates);
    const checkedAt = new Date().toISOString();

    for (const result of scan.results) {
      const candidate = candidates.get(result.sourceId);
      if (!candidate) continue;
      const { error } = await context.supabase.from("business_sources").upsert(
        {
          owner_id: context.userId,
          business_id: data.businessId,
          source_id: result.sourceId,
          source_name: candidate.platform,
          source_type: "social",
          method: candidate.method,
          url: candidate.url,
          excerpt: result.excerpt,
          confidence:
            result.status === "confirmed"
              ? Math.max(candidate.confidence, 0.8)
              : candidate.confidence,
          status: result.status,
          last_checked_at: result.checkedAt,
          last_verified_at: result.verifiedAt,
        },
        { onConflict: "business_id,source_id" },
      );
      if (error) errors.push(`${candidate.platform}: ${error.message}`);
    }

    const profiles = await readProfiles(context.supabase, data.businessId, business.socials);
    const nextSocials = mergePrimarySocialMap(business.socials, profiles);
    const { error: updateError } = await context.supabase
      .from("businesses")
      .update({ socials: nextSocials })
      .eq("id", data.businessId);
    if (updateError) throw new Error(updateError.message);

    const count = (status: SocialProfileStatus) =>
      scan.results.filter((result) => result.status === status).length;
    const summary = `Social profile scan: ${count("confirmed")} confirmed, ${count(
      "blocked",
    )} blocked, ${count("inaccessible")} unavailable, ${count("unverified")} unverified.`;

    await context.supabase.from("business_activity_events").insert({
      owner_id: context.userId,
      business_id: data.businessId,
      event_type: "social_scan",
      summary,
      details: {
        scanned: scan.results.length,
        confirmed: count("confirmed"),
        blocked: count("blocked"),
        inaccessible: count("inaccessible"),
        unverified: count("unverified"),
        skipped: scan.skipped,
        errors,
      },
      ref_table: "business_sources",
      ref_id: null,
    });

    return {
      profiles,
      scanned: scan.results.length,
      confirmed: count("confirmed"),
      blocked: count("blocked"),
      inaccessible: count("inaccessible"),
      unverified: count("unverified"),
      skipped: scan.skipped,
      errors,
      checkedAt,
    };
  });

const removeInput = z.object({
  businessId: z.string().uuid(),
  sourceId: z.string().trim().min(1).max(300),
});

export const removeSocialProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => removeInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const business = await loadBusiness(context.supabase, data.businessId);
    const { data: row, error: readError } = await context.supabase
      .from("business_sources")
      .select("url")
      .eq("business_id", data.businessId)
      .eq("source_id", data.sourceId)
      .eq("source_type", "social")
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const { error } = await context.supabase
      .from("business_sources")
      .delete()
      .eq("business_id", data.businessId)
      .eq("source_id", data.sourceId)
      .eq("source_type", "social");
    if (error) throw new Error(error.message);

    if (row?.url) {
      const nextSocials = removeSocialUrl(business.socials, data.sourceId, row.url);
      const { error: updateError } = await context.supabase
        .from("businesses")
        .update({ socials: nextSocials })
        .eq("id", data.businessId);
      if (updateError) throw new Error(updateError.message);
    }

    return { ok: true };
  });
