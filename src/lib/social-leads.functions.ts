import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  buildSocialLeadNeeds,
  parseSocialLeadInput,
  scoreSocialLead,
  splitSocialLeadInputs,
  SOCIAL_LEAD_STATUS_LABELS,
  type SocialLeadPlatform,
  type SocialLeadStatus,
} from "./social-leads";
import {
  businessDiscovery,
  discoverInstagramLeads as runInstagramDiscovery,
  getMetaConfig,
  leadFromInstagram,
  probeWebsite,
  type DiscoveredSocialLead,
} from "./social-leads.server";

type Client = SupabaseClient<Database>;
type LeadRow = Database["public"]["Tables"]["social_leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["social_leads"]["Insert"];

export type SocialLeadConnection = {
  configured: boolean;
  missing: string[];
  graphVersion: string;
  tableReady: boolean;
  tableError: string | null;
};

export type SocialLeadListResult = {
  leads: LeadRow[];
  connection: SocialLeadConnection;
  lastRun: {
    id: string;
    query: string;
    status: string;
    results_count: number;
    new_count: number;
    error: string | null;
    created_at: string;
  } | null;
};

function connectionFor(tableError: string | null = null): SocialLeadConnection {
  const config = getMetaConfig();
  return {
    configured: config.configured,
    missing: config.missing,
    graphVersion: config.graphVersion,
    tableReady: tableError === null,
    tableError,
  };
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(error?.message ?? ""),
  );
}

async function lastDiscoveryRun(supabase: Client) {
  const { data } = await supabase
    .from("discovery_runs")
    .select("id, query, status, results_count, new_count, error, created_at")
    .like("query", "instagram hashtags:%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export const getSocialLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialLeadListResult> => {
    const { data, error } = await context.supabase
      .from("social_leads")
      .select("*")
      .order("lead_score", { ascending: false })
      .order("last_post_at", { ascending: false })
      .limit(1000);

    if (error) {
      if (isMissingTable(error)) {
        return {
          leads: [],
          connection: connectionFor(error.message),
          lastRun: null,
        };
      }
      throw new Error(error.message);
    }

    return {
      leads: data ?? [],
      connection: connectionFor(),
      lastRun: await lastDiscoveryRun(context.supabase),
    };
  });

export const getSocialLeadConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialLeadConnection> => {
    const { error } = await context.supabase.from("social_leads").select("id").limit(1);
    return connectionFor(error && isMissingTable(error) ? error.message : null);
  });

function manualLead(
  platform: SocialLeadPlatform,
  handle: string,
  profileUrl: string,
): DiscoveredSocialLead {
  const score = scoreSocialLead({
    followersCount: null,
    mediaCount: null,
    lastPostAt: null,
    engagementRate: null,
    websiteStatus: "unknown",
    storeStatus: "unknown",
    hasContact: false,
    district: null,
  });
  return {
    platform,
    handle,
    profileUrl,
    displayName: handle,
    biography: null,
    category: null,
    district: null,
    website: null,
    websiteStatus: "unknown",
    storeStatus: "unknown",
    followersCount: null,
    mediaCount: null,
    lastPostAt: null,
    engagementRate: null,
    contactPhone: null,
    contactWhatsapp: null,
    leadScore: score.score,
    scoreFactors: score.factors,
    needs: [
      "Connect the Instagram API to read followers, posts and website data",
      ...buildSocialLeadNeeds({
        websiteStatus: "unknown",
        storeStatus: "unknown",
        lastPostAt: null,
        followersCount: null,
        hasContact: false,
        district: null,
        biography: null,
      }),
    ],
    evidence: {
      source: "manual_import",
      checkedAt: new Date().toISOString(),
      note: "Profile URL imported without Meta API access. Run a refresh after connecting Instagram.",
    },
    source: "manual_import",
  };
}

function toInsert(
  ownerId: string,
  lead: DiscoveredSocialLead,
  discoveryRunId: string | null = null,
): LeadInsert {
  return {
    owner_id: ownerId,
    discovery_run_id: discoveryRunId,
    platform: lead.platform,
    handle: lead.handle,
    profile_url: lead.profileUrl,
    display_name: lead.displayName,
    biography: lead.biography,
    category: lead.category,
    district: lead.district,
    website: lead.website,
    website_status: lead.websiteStatus,
    store_status: lead.storeStatus,
    followers_count: lead.followersCount,
    media_count: lead.mediaCount,
    last_post_at: lead.lastPostAt,
    engagement_rate: lead.engagementRate,
    contact_phone: lead.contactPhone,
    contact_whatsapp: lead.contactWhatsapp,
    lead_score: lead.leadScore,
    score_factors: lead.scoreFactors as Json,
    needs: lead.needs as Json,
    evidence: lead.evidence as Json,
    source: lead.source,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const importInput = z.object({
  raw: z.string().trim().min(1).max(20_000),
  liveLookup: z.boolean().optional().default(true),
});

export type SocialLeadImportResult = {
  saved: number;
  skipped: number;
  errors: string[];
  leads: LeadRow[];
};

export const importSocialLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => importInput.parse(d))
  .handler(async ({ data, context }): Promise<SocialLeadImportResult> => {
    const inputs = splitSocialLeadInputs(data.raw);
    const errors: string[] = [];
    const savedHandles: Array<{ platform: SocialLeadPlatform; handle: string }> = [];
    const config = getMetaConfig();
    let skipped = 0;

    for (const [index, input] of inputs.entries()) {
      const parsed = parseSocialLeadInput(input);
      if (!parsed.ok) {
        errors.push(`Line ${index + 1}: ${parsed.error}`);
        skipped += 1;
        continue;
      }

      let lead: DiscoveredSocialLead;
      if (data.liveLookup && parsed.platform === "instagram" && config.configured) {
        try {
          const profile = await businessDiscovery(parsed.handle);
          const probe = await probeWebsite(profile.website);
          lead = leadFromInstagram(profile, probe, "instagram_api");
        } catch (error) {
          errors.push(
            `@${parsed.handle}: ${
              error instanceof Error ? error.message : "Instagram lookup failed."
            }. Saved as a manual lead.`,
          );
          lead = manualLead(parsed.platform, parsed.handle, parsed.url);
        }
      } else {
        lead = manualLead(parsed.platform, parsed.handle, parsed.url);
      }

      const { error } = await context.supabase
        .from("social_leads")
        .upsert(toInsert(context.userId, lead), { onConflict: "owner_id,platform,handle" });
      if (error) {
        errors.push(`@${parsed.handle}: ${error.message}`);
        skipped += 1;
        continue;
      }
      savedHandles.push({ platform: lead.platform, handle: lead.handle });
    }

    let leads: LeadRow[] = [];
    if (savedHandles.length > 0) {
      const { data: rows } = await context.supabase
        .from("social_leads")
        .select("*")
        .in(
          "handle",
          savedHandles.map((item) => item.handle),
        )
        .order("lead_score", { ascending: false });
      leads = rows ?? [];
    }

    return { saved: savedHandles.length, skipped, errors, leads };
  });

const discoverInput = z.object({
  hashtags: z.array(z.string().trim().min(1).max(60)).min(1).max(5),
  limit: z.number().int().min(1).max(20).optional().default(20),
});

export type SocialLeadDiscoveryResult = {
  saved: number;
  found: number;
  hashtags: string[];
  usernames: string[];
  errors: string[];
  leads: LeadRow[];
  requestCount: number;
};

export const discoverInstagramLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => discoverInput.parse(d))
  .handler(async ({ data, context }): Promise<SocialLeadDiscoveryResult> => {
    const query = `instagram hashtags: ${data.hashtags.join(", ")}`;
    const startedAt = new Date().toISOString();
    const { data: run, error: runError } = await context.supabase
      .from("discovery_runs")
      .insert({
        owner_id: context.userId,
        query,
        location: "Rwanda",
        status: "running",
        results_count: 0,
        new_count: 0,
        created_at: startedAt,
      })
      .select("id")
      .single();
    if (runError) throw new Error(runError.message);

    try {
      const discovery = await runInstagramDiscovery({
        hashtags: data.hashtags,
        limit: data.limit,
      });

      const existing = await context.supabase
        .from("social_leads")
        .select("handle")
        .eq("platform", "instagram")
        .in(
          "handle",
          discovery.leads.map((lead) => lead.handle),
        );
      const existingHandles = new Set((existing.data ?? []).map((row) => row.handle));

      for (const lead of discovery.leads) {
        const { error } = await context.supabase
          .from("social_leads")
          .upsert(toInsert(context.userId, lead, run.id), {
            onConflict: "owner_id,platform,handle",
          });
        if (error) discovery.errors.push(`@${lead.handle}: ${error.message}`);
      }

      await context.supabase
        .from("discovery_runs")
        .update({
          status: discovery.errors.length > 0 ? "partial" : "completed",
          results_count: discovery.leads.length,
          new_count: discovery.leads.filter((lead) => !existingHandles.has(lead.handle)).length,
          error: discovery.errors.length > 0 ? discovery.errors.slice(0, 5).join(" | ") : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      const savedHandles = discovery.leads.map((lead) => lead.handle);
      const { data: rows } = savedHandles.length
        ? await context.supabase
            .from("social_leads")
            .select("*")
            .eq("platform", "instagram")
            .in("handle", savedHandles)
            .order("lead_score", { ascending: false })
        : { data: [] as LeadRow[] };

      return {
        saved: discovery.leads.length,
        found: discovery.usernames.length,
        hashtags: discovery.hashtags,
        usernames: discovery.usernames,
        errors: discovery.errors,
        leads: rows ?? [],
        requestCount: discovery.requests,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Instagram discovery failed.";
      await context.supabase
        .from("discovery_runs")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      throw error;
    }
  });

const idInput = z.object({ id: z.string().uuid() });

export const refreshSocialLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const { data: existing, error } = await context.supabase
      .from("social_leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) throw new Error("Social lead not found.");
    if (existing.platform !== "instagram") {
      throw new Error("Live refresh is only available for Instagram leads.");
    }
    if (!getMetaConfig().configured) {
      throw new Error("Instagram API is not connected. Add META_ACCESS_TOKEN and IG_USER_ID.");
    }

    const profile = await businessDiscovery(existing.handle);
    const probe = await probeWebsite(profile.website);
    const lead = leadFromInstagram(profile, probe, "instagram_api");
    const { data: saved, error: saveError } = await context.supabase
      .from("social_leads")
      .upsert(
        { ...toInsert(context.userId, lead), id: existing.id, business_id: existing.business_id },
        { onConflict: "owner_id,platform,handle" },
      )
      .select("*")
      .single();
    if (saveError) throw new Error(saveError.message);
    return saved;
  });

const statusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "reviewing", "qualified", "dismissed"]),
});

export const updateSocialLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => statusInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const { data: row, error } = await context.supabase
      .from("social_leads")
      .update({
        status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSocialLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("social_leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const promoteSocialLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => idInput.parse(d))
  .handler(async ({ data, context }): Promise<{ businessId: string }> => {
    const { data: lead, error } = await context.supabase
      .from("social_leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Social lead not found.");
    if (lead.business_id) return { businessId: lead.business_id };

    const placeId = `social:${lead.platform}:${lead.handle}`;
    const { data: existing } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("place_id", placeId)
      .maybeSingle();

    let businessId = existing?.id ?? null;
    if (!businessId) {
      const { data: created, error: createError } = await context.supabase
        .from("businesses")
        .insert({
          owner_id: context.userId,
          place_id: placeId,
          name: lead.display_name || lead.handle,
          website: lead.website,
          category: lead.category,
          district: lead.district,
          description: lead.biography,
          source: lead.platform,
          status: "discovered",
          score: lead.lead_score,
          visibility_score: lead.lead_score,
          profile_confidence: "social_public_profile",
          socials: { [lead.platform]: lead.profile_url } as Json,
          website_check: {
            source: "social_lead",
            website_status: lead.website_status,
            store_status: lead.store_status,
            checked_at: lead.last_checked_at,
            evidence: lead.evidence,
          } as Json,
          last_activity_at: lead.last_post_at,
          phone: lead.contact_phone,
        })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      businessId = created.id;
    }

    const { error: updateError } = await context.supabase
      .from("social_leads")
      .update({
        business_id: businessId,
        status: "promoted" satisfies SocialLeadStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    if (updateError) throw new Error(updateError.message);

    await context.supabase.from("business_activity_events").insert({
      owner_id: context.userId,
      business_id: businessId,
      event_type: "social_lead_promoted",
      summary: `Promoted @${lead.handle} from ${lead.platform} to the business pipeline.`,
      details: {
        social_lead_id: lead.id,
        platform: lead.platform,
        handle: lead.handle,
        lead_score: lead.lead_score,
        status: SOCIAL_LEAD_STATUS_LABELS[lead.status as SocialLeadStatus] ?? lead.status,
      },
      ref_table: "social_leads",
      ref_id: lead.id,
    });

    return { businessId };
  });
