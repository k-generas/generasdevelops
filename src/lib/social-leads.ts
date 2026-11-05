import { ALL_DISTRICTS } from "./rwanda";
import { parseSocialProfileUrl, type SocialPlatform } from "./social-profiles";

export type SocialLeadPlatform = "instagram" | "facebook";
export type SocialLeadWebsiteStatus =
  "none" | "live" | "dead" | "link_hub" | "whatsapp" | "unknown";
export type SocialLeadStoreStatus =
  "none" | "live_store" | "link_hub" | "whatsapp_only" | "unknown";
export type SocialLeadStatus = "new" | "reviewing" | "qualified" | "dismissed" | "promoted";
export type SocialLeadSource = "instagram_api" | "manual_import";

export type SocialLeadScoreFactors = {
  demand: number;
  engagement: number;
  activity: number;
  opportunity: number;
  contact: number;
  local: number;
};

export type SocialLeadScoreInput = {
  followersCount: number | null;
  mediaCount: number | null;
  lastPostAt: string | null;
  engagementRate: number | null;
  websiteStatus: SocialLeadWebsiteStatus;
  storeStatus: SocialLeadStoreStatus;
  hasContact: boolean;
  district: string | null;
  now?: Date;
};

export type SocialLeadScore = {
  score: number;
  factors: SocialLeadScoreFactors;
  reasons: string[];
};

export const SOCIAL_LEAD_STATUS_LABELS: Record<SocialLeadStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  qualified: "Qualified",
  dismissed: "Dismissed",
  promoted: "Promoted to CRM",
};

export const SOCIAL_LEAD_STATUS_VARIANTS: Record<
  SocialLeadStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "secondary",
  reviewing: "outline",
  qualified: "default",
  dismissed: "destructive",
  promoted: "default",
};

export const WEBSITE_STATUS_LABELS: Record<SocialLeadWebsiteStatus, string> = {
  none: "No website",
  live: "Website live",
  dead: "Website down",
  link_hub: "Link hub only",
  whatsapp: "WhatsApp link only",
  unknown: "Not checked",
};

export const STORE_STATUS_LABELS: Record<SocialLeadStoreStatus, string> = {
  none: "No online store",
  live_store: "Online store found",
  link_hub: "Link hub",
  whatsapp_only: "WhatsApp only",
  unknown: "Not confirmed",
};

const LINK_HUB_HOSTS = [
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "bio.link",
  "taplink.cc",
  "campsite.bio",
  "milkshake.app",
  "allmylinks.com",
  "linkr.bio",
  "snipfeed.co",
  "shopmy.us",
  "lnk.bio",
  "linkbio.co",
  "linkfly.to",
];

const WHATSAPP_HOSTS = ["wa.me", "whatsapp.com", "api.whatsapp.com"];

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  [
    "Fashion & apparel",
    [
      "fashion",
      "clothing",
      "clothes",
      "boutique",
      "dress",
      "shoes",
      "sneakers",
      "handbag",
      "jewelry",
      "jewellery",
      "tailor",
      "kitenge",
      "ankara",
    ],
  ],
  [
    "Beauty & personal care",
    [
      "beauty",
      "makeup",
      "cosmetic",
      "skincare",
      "hair",
      "salon",
      "barber",
      "nails",
      "spa",
      "perfume",
      "shea",
    ],
  ],
  [
    "Food & beverages",
    [
      "food",
      "restaurant",
      "cafe",
      "coffee",
      "bakery",
      "cake",
      "juice",
      "drink",
      "catering",
      "snack",
      "kitchen",
      "menu",
      "order food",
    ],
  ],
  [
    "Electronics & tech",
    [
      "phone",
      "laptop",
      "computer",
      "electronics",
      "gadget",
      "accessories",
      "camera",
      "speaker",
      "charger",
      "tech",
    ],
  ],
  [
    "Home & decor",
    [
      "home",
      "decor",
      "furniture",
      "bedding",
      "curtain",
      "kitchenware",
      "interior",
      "mattress",
      "carpet",
    ],
  ],
  [
    "Health & wellness",
    [
      "health",
      "wellness",
      "clinic",
      "pharmacy",
      "supplement",
      "fitness",
      "gym",
      "yoga",
      "therapy",
      "massage",
    ],
  ],
  [
    "Events & photography",
    ["event", "wedding", "photography", "photographer", "video", "decor", "party", "rental"],
  ],
  [
    "Agriculture & food production",
    ["farm", "agriculture", "produce", "seed", "livestock", "dairy", "honey", "coffee beans"],
  ],
  ["Automotive", ["car", "auto", "vehicle", "motorcycle", "spare part", "tyre", "tire"]],
  ["Education & training", ["school", "training", "course", "academy", "tutor", "education"]],
  ["Kids & baby", ["baby", "kids", "children", "toy", "maternity", "pram", "stroller"]],
  ["Pets", ["pet", "dog", "cat", "pet food", "animal"]],
  [
    "Handmade & crafts",
    ["handmade", "craft", "artisan", "woven", "basket", "pottery", "art", "painting"],
  ],
  [
    "Professional services",
    ["consult", "agency", "design", "marketing", "printing", "accounting", "legal", "service"],
  ],
  ["Retail & wholesale", ["shop", "store", "wholesale", "supplier", "retail", "distributor"]],
];

export function normalizeSocialHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]+/g, "");
}

export function parseSocialLeadInput(
  input: string,
):
  | { ok: true; platform: SocialLeadPlatform; handle: string; url: string }
  | { ok: false; error: string } {
  const value = input.trim();
  if (!value) return { ok: false, error: "Paste an Instagram or Facebook profile URL or handle." };

  if (/^@?[a-z0-9._]{2,30}$/i.test(value)) {
    const handle = normalizeSocialHandle(value);
    return { ok: true, platform: "instagram", handle, url: `https://www.instagram.com/${handle}/` };
  }

  const parsed = parseSocialProfileUrl(value);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.profile.platform !== "instagram" && parsed.profile.platform !== "facebook") {
    return { ok: false, error: "Only Instagram and Facebook profiles are supported." };
  }

  const handle =
    parsed.profile.platform === "instagram"
      ? normalizeSocialHandle(parsed.profile.handle ?? "")
      : (parsed.profile.handle?.trim() ?? "");
  if (!handle) return { ok: false, error: "The profile URL is missing a handle." };

  return {
    ok: true,
    platform: parsed.profile.platform as SocialLeadPlatform,
    handle,
    url: parsed.profile.url,
  };
}

export function splitSocialLeadInputs(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isLinkHub(value: string | null | undefined): boolean {
  const host = hostOf(value);
  return Boolean(host && LINK_HUB_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)));
}

export function isWhatsAppLink(value: string | null | undefined): boolean {
  const host = hostOf(value);
  return Boolean(host && WHATSAPP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)));
}

export function phoneFromWhatsAppLink(value: string | null | undefined): string | null {
  if (!isWhatsAppLink(value)) return null;
  try {
    const url = new URL(value!);
    const raw = url.searchParams.get("phone") ?? url.pathname.replace(/[^\d]/g, "");
    const digits = raw.replace(/[^\d]/g, "");
    return digits.length >= 9 ? `+${digits}` : null;
  } catch {
    return null;
  }
}

export function extractPhone(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = /(?:\+?250|0)\s?7\d{2}[\s-]?\d{3}[\s-]?\d{3}/.exec(text);
  if (!match) return null;
  const digits = match[0].replace(/[^\d]/g, "");
  if (digits.startsWith("250")) return `+${digits}`;
  if (digits.startsWith("0")) return `+250${digits.slice(1)}`;
  return `+${digits}`;
}

export function inferCategory(text: string | null | undefined): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const [category, words] of CATEGORY_KEYWORDS) {
    if (words.some((word) => haystack.includes(word))) return category;
  }
  return null;
}

export function inferDistrict(text: string | null | undefined): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  const district = ALL_DISTRICTS.find((value) => haystack.includes(value.toLowerCase()));
  if (district) return district;
  if (haystack.includes("kigali")) return "Kigali";
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreSocialLead(input: SocialLeadScoreInput): SocialLeadScore {
  const followers = Math.max(0, input.followersCount ?? 0);
  const demand = clamp((Math.log10(followers + 1) / 4) * 25, 0, 25);
  const engagement = clamp((input.engagementRate ?? 0) * 4, 0, 20);

  const now = input.now ?? new Date();
  const lastPost = input.lastPostAt ? new Date(input.lastPostAt) : null;
  const daysSincePost =
    lastPost && !Number.isNaN(lastPost.getTime())
      ? Math.floor((now.getTime() - lastPost.getTime()) / 86_400_000)
      : null;
  const activity =
    daysSincePost === null
      ? 0
      : daysSincePost <= 7
        ? 20
        : daysSincePost <= 14
          ? 16
          : daysSincePost <= 30
            ? 12
            : daysSincePost <= 60
              ? 6
              : 0;

  const opportunity =
    input.storeStatus === "live_store"
      ? 0
      : input.websiteStatus === "none"
        ? 25
        : input.websiteStatus === "whatsapp"
          ? 22
          : input.websiteStatus === "link_hub"
            ? 20
            : input.websiteStatus === "dead"
              ? 18
              : input.websiteStatus === "unknown"
                ? 10
                : 0;

  const contact = input.hasContact ? 5 : 0;
  const local = input.district ? 5 : 0;
  const factors = {
    demand: Math.round(demand),
    engagement: Math.round(engagement),
    activity: Math.round(activity),
    opportunity: Math.round(opportunity),
    contact,
    local,
  };

  const reasons: string[] = [];
  if (followers >= 1000)
    reasons.push(`${followers.toLocaleString()} followers show visible demand`);
  if (activity >= 12) reasons.push("Posting is active");
  if (opportunity >= 18) reasons.push("No owned online store was found");
  if (input.hasContact) reasons.push("Direct contact is available");
  if (input.district) reasons.push(`Local signal: ${input.district}`);

  return {
    score: clamp(
      Object.values(factors).reduce((sum, value) => sum + value, 0),
      0,
      100,
    ),
    factors,
    reasons,
  };
}

export function buildSocialLeadNeeds(input: {
  websiteStatus: SocialLeadWebsiteStatus;
  storeStatus: SocialLeadStoreStatus;
  lastPostAt: string | null;
  followersCount: number | null;
  hasContact: boolean;
  district: string | null;
  biography: string | null;
  now?: Date;
}): string[] {
  const needs: string[] = [];
  switch (input.websiteStatus) {
    case "none":
      needs.push("No website found — needs an online store");
      break;
    case "dead":
      needs.push("Website is down — needs a working store");
      break;
    case "link_hub":
      needs.push("Uses a link hub — needs an owned store and catalog");
      break;
    case "whatsapp":
      needs.push("WhatsApp link only — needs a browsable catalog and checkout");
      break;
    default:
      break;
  }

  if (input.storeStatus === "unknown" && input.websiteStatus === "live") {
    needs.push("Store not detected — confirm whether checkout exists");
  }
  if (input.storeStatus === "whatsapp_only") {
    needs.push("Orders happen in WhatsApp — needs product listings and order capture");
  }

  const lastPost = input.lastPostAt ? new Date(input.lastPostAt) : null;
  const daysSincePost =
    lastPost && !Number.isNaN(lastPost.getTime())
      ? Math.floor(((input.now ?? new Date()).getTime() - lastPost.getTime()) / 86_400_000)
      : null;
  if (daysSincePost === null || daysSincePost > 30) {
    needs.push("Posting is stale — needs consistent product activity");
  }
  if ((input.followersCount ?? 0) >= 1000 && input.storeStatus !== "live_store") {
    needs.push("Visible demand but no owned sales channel");
  }
  if (!input.hasContact) needs.push("No phone/WhatsApp found — needs contact capture");
  if (!input.district) needs.push("Location not stated — confirm district before outreach");
  if (!input.biography?.trim()) needs.push("Bio is thin — needs a clear offer and category");

  return Array.from(new Set(needs)).slice(0, 8);
}

export function socialLeadPlatformLabel(platform: string): string {
  return platform === "facebook" ? "Facebook" : "Instagram";
}

export function socialLeadPlatformFromUrl(url: string): SocialPlatform | null {
  const parsed = parseSocialProfileUrl(url);
  return parsed.ok ? parsed.profile.platform : null;
}
