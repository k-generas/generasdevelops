import {
  buildSocialLeadNeeds,
  extractPhone,
  inferCategory,
  inferDistrict,
  isLinkHub,
  isWhatsAppLink,
  normalizeSocialHandle,
  phoneFromWhatsAppLink,
  scoreSocialLead,
  type SocialLeadPlatform,
  type SocialLeadScoreFactors,
  type SocialLeadSource,
  type SocialLeadStoreStatus,
  type SocialLeadWebsiteStatus,
} from "./social-leads";
import { safeFetch } from "./safe-url.server";

const DEFAULT_GRAPH_VERSION = "v23.0";
const GRAPH_URL = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 15_000;
const WEBSITE_TIMEOUT_MS = 8_000;
const MAX_HASHTAGS = 5;
const MAX_LEADS_PER_RUN = 20;
const MAX_MEDIA = 12;

type MetaConfig = {
  configured: boolean;
  missing: string[];
  graphVersion: string;
  igUserId: string | null;
  accessToken: string | null;
};

export function getMetaConfig(): MetaConfig {
  const accessToken = process.env["META_ACCESS_TOKEN"]?.trim() || null;
  const igUserId = process.env["IG_USER_ID"]?.trim() || null;
  const missing: string[] = [];
  if (!accessToken) missing.push("META_ACCESS_TOKEN");
  if (!igUserId) missing.push("IG_USER_ID");
  return {
    configured: missing.length === 0,
    missing,
    graphVersion: process.env["META_GRAPH_VERSION"]?.trim() || DEFAULT_GRAPH_VERSION,
    igUserId,
    accessToken,
  };
}

export type IgMedia = {
  id: string;
  caption?: string | null;
  media_type?: string | null;
  permalink?: string | null;
  timestamp?: string | null;
  like_count?: number | null;
  comments_count?: number | null;
};

export type IgBusinessDiscovery = {
  id: string;
  username: string;
  name?: string | null;
  biography?: string | null;
  website?: string | null;
  followers_count?: number | null;
  follows_count?: number | null;
  media_count?: number | null;
  profile_picture_url?: string | null;
  media?: { data?: IgMedia[] } | null;
};

type GraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  config: MetaConfig,
): Promise<T> {
  if (!config.accessToken) throw new Error("META_ACCESS_TOKEN is missing.");
  const url = new URL(`${GRAPH_URL}/${config.graphVersion}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", config.accessToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const body = (await response.json().catch(() => null)) as {
      error?: GraphError;
      data?: unknown;
    } | null;
    if (!response.ok || body?.error) {
      const error = body?.error;
      const message = error?.message ?? `Instagram API returned HTTP ${response.status}.`;
      const details = [
        error?.type,
        error?.code ? `code ${error.code}` : null,
        error?.error_subcode ? `subcode ${error.error_subcode}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      throw new Error(details ? `${message} (${details})` : message);
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Instagram API timed out. Try again with fewer hashtags.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type HashtagSearchResult = {
  hashtags: string[];
  usernames: string[];
  errors: string[];
  requests: number;
};

function cleanHashtag(value: string): string | null {
  const tag = value
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9_]/g, "");
  return tag.length >= 2 && tag.length <= 50 ? tag : null;
}

export async function searchHashtagUsernames(
  rawHashtags: string[],
  maxLeads = MAX_LEADS_PER_RUN,
): Promise<HashtagSearchResult> {
  const config = getMetaConfig();
  if (!config.configured || !config.igUserId) {
    throw new Error(
      `Instagram API is not connected. Add ${config.missing.join(
        " and ",
      )} in Lovable secrets, then try again.`,
    );
  }

  const hashtags = Array.from(
    new Set(rawHashtags.map(cleanHashtag).filter((value): value is string => value !== null)),
  ).slice(0, MAX_HASHTAGS);
  if (hashtags.length === 0) {
    throw new Error("Add at least one hashtag, for example kigali or madeinrwanda.");
  }

  const usernames = new Set<string>();
  const errors: string[] = [];
  let requests = 0;

  for (const hashtag of hashtags) {
    if (usernames.size >= maxLeads) break;
    try {
      const search = await graphGet<{ data?: Array<{ id?: string; name?: string }> }>(
        "ig_hashtag_search",
        { user_id: config.igUserId, q: hashtag },
        config,
      );
      requests += 1;
      const hashtagId = search.data?.[0]?.id;
      if (!hashtagId) {
        errors.push(`#${hashtag}: no hashtag id returned.`);
        continue;
      }
      const media = await graphGet<{ data?: Array<{ username?: string }> }>(
        `${hashtagId}/recent_media`,
        {
          user_id: config.igUserId,
          fields: "id,username,caption,media_type,permalink,timestamp,like_count,comments_count",
          limit: "25",
        },
        config,
      );
      requests += 1;
      for (const item of media.data ?? []) {
        const username = item.username ? normalizeSocialHandle(item.username) : "";
        if (username) usernames.add(username);
        if (usernames.size >= maxLeads) break;
      }
    } catch (error) {
      errors.push(`#${hashtag}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  return { hashtags, usernames: [...usernames], errors, requests };
}

export async function businessDiscovery(username: string): Promise<IgBusinessDiscovery> {
  const config = getMetaConfig();
  if (!config.configured || !config.igUserId) {
    throw new Error(
      `Instagram API is not connected. Add ${config.missing.join(
        " and ",
      )} in Lovable secrets, then try again.`,
    );
  }
  const handle = normalizeSocialHandle(username);
  if (!handle) throw new Error("The Instagram username is not valid.");

  const fields = [
    "business_discovery.username(" + handle + "){",
    "id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url,",
    `media.limit(${MAX_MEDIA}){id,caption,media_type,permalink,timestamp,like_count,comments_count}`,
    "}",
  ].join("");

  const response = await graphGet<{ business_discovery?: IgBusinessDiscovery }>(
    config.igUserId,
    { fields },
    config,
  );
  if (!response.business_discovery) {
    throw new Error(`Instagram returned no public business data for @${handle}.`);
  }
  return response.business_discovery;
}

type WebsiteProbe = {
  website: string | null;
  websiteStatus: SocialLeadWebsiteStatus;
  storeStatus: SocialLeadStoreStatus;
  detail: string;
  finalUrl: string | null;
  title: string | null;
};

export async function probeWebsite(url: string | null | undefined): Promise<WebsiteProbe> {
  const value = url?.trim() || null;
  if (!value) {
    return {
      website: null,
      websiteStatus: "none",
      storeStatus: "none",
      detail: "No website field on the public profile.",
      finalUrl: null,
      title: null,
    };
  }

  if (isWhatsAppLink(value)) {
    return {
      website: value,
      websiteStatus: "whatsapp",
      storeStatus: "whatsapp_only",
      detail: "Profile links to WhatsApp instead of a website or store.",
      finalUrl: value,
      title: null,
    };
  }
  if (isLinkHub(value)) {
    return {
      website: value,
      websiteStatus: "link_hub",
      storeStatus: "link_hub",
      detail: "Profile uses a link hub, not an owned storefront.",
      finalUrl: value,
      title: null,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSITE_TIMEOUT_MS);
  try {
    const response = await safeFetch(
      value,
      {
        signal: controller.signal,
        headers: {
          "user-agent": "GARE-SocialLeadCheck/1.0 (+https://generasdevelops.lovable.app)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      },
      { maxRedirects: 3 },
    );
    const finalUrl = response.url || value;
    if ([401, 403, 429].includes(response.status)) {
      return {
        website: value,
        websiteStatus: "unknown",
        storeStatus: "unknown",
        detail: `Website returned HTTP ${response.status}; it may be live but blocked to servers.`,
        finalUrl,
        title: null,
      };
    }
    if (!response.ok) {
      return {
        website: value,
        websiteStatus: "dead",
        storeStatus: "none",
        detail: `Website returned HTTP ${response.status}.`,
        finalUrl,
        title: null,
      };
    }

    const html = (await response.text()).slice(0, 200_000);
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    const haystack = `${finalUrl} ${title ?? ""} ${html}`.toLowerCase();
    const hasStore =
      /(shop|store|cart|basket|checkout|product|catalogue|catalog|order now|add to cart)/i.test(
        haystack,
      );
    return {
      website: value,
      websiteStatus: "live",
      storeStatus: hasStore ? "live_store" : "unknown",
      detail: hasStore
        ? "A live website with store/checkout signals was found."
        : "Website is live, but no clear store or checkout signal was found.",
      finalUrl,
      title,
    };
  } catch (error) {
    return {
      website: value,
      websiteStatus: "dead",
      storeStatus: "none",
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "Website check timed out; treat it as unverified."
          : `Website check failed: ${error instanceof Error ? error.message : "network error"}`,
      finalUrl: null,
      title: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export type DiscoveredSocialLead = {
  platform: SocialLeadPlatform;
  handle: string;
  profileUrl: string;
  displayName: string | null;
  biography: string | null;
  category: string | null;
  district: string | null;
  website: string | null;
  websiteStatus: SocialLeadWebsiteStatus;
  storeStatus: SocialLeadStoreStatus;
  followersCount: number | null;
  mediaCount: number | null;
  lastPostAt: string | null;
  engagementRate: number | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  leadScore: number;
  scoreFactors: SocialLeadScoreFactors;
  needs: string[];
  evidence: Record<string, unknown>;
  source: SocialLeadSource;
};

function latestPost(media: IgMedia[]): IgMedia | null {
  const dated = media
    .filter((item) => item.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return dated[0] ?? media[0] ?? null;
}

function averageEngagement(media: IgMedia[], followers: number): number | null {
  if (followers <= 0 || media.length === 0) return null;
  const measurable = media.filter(
    (item) => typeof item.like_count === "number" || typeof item.comments_count === "number",
  );
  if (measurable.length === 0) return null;
  const total = measurable.reduce(
    (sum, item) => sum + (item.like_count ?? 0) + (item.comments_count ?? 0),
    0,
  );
  return Number(((total / measurable.length / followers) * 100).toFixed(2));
}

export function leadFromInstagram(
  profile: IgBusinessDiscovery,
  websiteProbe: WebsiteProbe,
  source: SocialLeadSource = "instagram_api",
): DiscoveredSocialLead {
  const media = profile.media?.data ?? [];
  const followers = profile.followers_count ?? null;
  const engagementRate = averageEngagement(media, followers ?? 0);
  const latest = latestPost(media);
  const lastPostAt = latest?.timestamp ?? null;
  const biography = profile.biography?.trim() || null;
  const text = [profile.name, biography, latest?.caption].filter(Boolean).join(" ");
  const district = inferDistrict(`${text} ${profile.username}`);
  const website = websiteProbe.website ?? profile.website ?? null;

  const bioWhatsApp = /wa\.me\/(\d+)/i.exec(biography ?? "")?.[1];
  const contactPhone = phoneFromWhatsAppLink(website) ?? extractPhone(biography);
  const contactWhatsapp =
    phoneFromWhatsAppLink(website) ??
    (bioWhatsApp ? `+${bioWhatsApp.replace(/[^\d]/g, "")}` : null) ??
    (/(whatsapp|whats app|dm to order|order via dm)/i.test(text) ? contactPhone : null);

  const score = scoreSocialLead({
    followersCount: followers,
    mediaCount: profile.media_count ?? null,
    lastPostAt,
    engagementRate,
    websiteStatus: websiteProbe.websiteStatus,
    storeStatus: websiteProbe.storeStatus,
    hasContact: Boolean(contactPhone || contactWhatsapp),
    district,
  });

  const needs = buildSocialLeadNeeds({
    websiteStatus: websiteProbe.websiteStatus,
    storeStatus: websiteProbe.storeStatus,
    lastPostAt,
    followersCount: followers,
    hasContact: Boolean(contactPhone || contactWhatsapp),
    district,
    biography,
  });

  return {
    platform: "instagram",
    handle: normalizeSocialHandle(profile.username),
    profileUrl: `https://www.instagram.com/${normalizeSocialHandle(profile.username)}/`,
    displayName: profile.name?.trim() || profile.username,
    biography,
    category: inferCategory(text),
    district,
    website,
    websiteStatus: websiteProbe.websiteStatus,
    storeStatus: websiteProbe.storeStatus,
    followersCount: followers,
    mediaCount: profile.media_count ?? null,
    lastPostAt,
    engagementRate,
    contactPhone,
    contactWhatsapp,
    leadScore: score.score,
    scoreFactors: score.factors,
    needs,
    evidence: {
      source: "instagram_graph_api",
      checkedAt: new Date().toISOString(),
      profileId: profile.id,
      username: profile.username,
      biography,
      website,
      websiteProbe,
      followersCount: followers,
      mediaCount: profile.media_count ?? null,
      engagementRate,
      latestPost: latest,
      recentMedia: media.slice(0, MAX_MEDIA),
      scoreReasons: score.reasons,
    },
    source,
  };
}

export type DiscoveryResult = {
  hashtags: string[];
  usernames: string[];
  leads: DiscoveredSocialLead[];
  errors: string[];
  requests: number;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; value?: R; error?: string }>> {
  const results = new Array<{ item: T; value?: R; error?: string }>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index]!;
      try {
        results[index] = { item, value: await fn(item) };
      } catch (error) {
        results[index] = {
          item,
          error: error instanceof Error ? error.message : "Instagram lookup failed.",
        };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function discoverInstagramLeads(options: {
  hashtags: string[];
  limit?: number;
}): Promise<DiscoveryResult> {
  const maxLeads = Math.min(Math.max(options.limit ?? MAX_LEADS_PER_RUN, 1), MAX_LEADS_PER_RUN);
  const search = await searchHashtagUsernames(options.hashtags, maxLeads);
  const errors = [...search.errors];
  const leads: DiscoveredSocialLead[] = [];

  const results = await mapLimit(search.usernames, 2, async (username) => {
    const profile = await businessDiscovery(username);
    const probe = await probeWebsite(profile.website);
    return leadFromInstagram(profile, probe);
  });

  for (const result of results) {
    if (result.error) {
      errors.push(`@${result.item}: ${result.error}`);
      continue;
    }
    if (result.value) leads.push(result.value);
  }

  return {
    hashtags: search.hashtags,
    usernames: search.usernames,
    leads,
    errors,
    requests: search.requests + results.length,
  };
}
