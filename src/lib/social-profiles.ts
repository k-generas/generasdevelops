import type { PlatformSearch } from "@/lib/prospect-verification";

export type SocialPlatform =
  "instagram" | "facebook" | "tiktok" | "linkedin" | "x" | "youtube" | "whatsapp" | "other";

export type SocialProfileStatus = "confirmed" | "unverified" | "blocked" | "inaccessible";
export type SocialProfileMethod = "website_link" | "manual";

export type SocialPlatformDefinition = {
  platform: SocialPlatform;
  label: string;
  hosts: string[];
};

export const SOCIAL_PLATFORM_DEFINITIONS: SocialPlatformDefinition[] = [
  { platform: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { platform: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { platform: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { platform: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { platform: "x", label: "X", hosts: ["x.com", "twitter.com"] },
  { platform: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { platform: "whatsapp", label: "WhatsApp", hosts: ["wa.me", "whatsapp.com"] },
];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  other: "Social profile",
};

export type ParsedSocialProfile = {
  sourceId: string;
  platform: SocialPlatform;
  platformLabel: string;
  handle: string | null;
  url: string;
};

export type SocialProfile = ParsedSocialProfile & {
  status: SocialProfileStatus;
  method: SocialProfileMethod;
  confidence: number;
  excerpt: string | null;
  firstSeenAt: string;
  lastCheckedAt: string;
  lastVerifiedAt: string | null;
  persisted: boolean;
};

export type SocialProfileParseResult =
  { ok: true; profile: ParsedSocialProfile } | { ok: false; error: string };

export type SocialMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

export type SocialProbeResult = {
  sourceId: string;
  status: SocialProfileStatus;
  excerpt: string;
  checkedAt: string;
  verifiedAt: string | null;
  metadata: SocialMetadata | null;
};

const UNSUPPORTED =
  "Use a public Instagram, Facebook, TikTok, LinkedIn, X, YouTube or WhatsApp profile URL.";
const MAX_HANDLE_LENGTH = 160;

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function platformForHost(host: string): SocialPlatformDefinition | null {
  return (
    SOCIAL_PLATFORM_DEFINITIONS.find((definition) =>
      definition.hosts.some((domain) => hostMatches(host, domain)),
    ) ?? null
  );
}

function isSocialPlatform(value: string): value is SocialPlatform {
  return value in SOCIAL_PLATFORM_LABELS;
}

export function isSocialPlatformUrl(value: string): boolean {
  return parseSocialProfileUrl(value).ok;
}

function cleanPath(url: URL): string {
  return url.pathname.replace(/\/+$/, "");
}

function pathSegments(url: URL): string[] {
  return cleanPath(url)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeHandle(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_HANDLE_LENGTH);
}

function sourceIdFor(platform: SocialPlatform, handle: string): string {
  return `social:${platform}:${normalizeHandle(handle) || "profile"}`;
}

function normalizedUrl(platform: SocialPlatform, handlePath: string): string {
  const path = handlePath.replace(/^\/+|\/+$/g, "");
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${path}/`;
    case "facebook":
      return path.startsWith("profile.php?")
        ? `https://www.facebook.com/${path}`
        : `https://www.facebook.com/${path}/`;
    case "tiktok":
      return `https://www.tiktok.com/@${path.replace(/^@/, "")}`;
    case "linkedin":
      return `https://www.linkedin.com/${path}/`;
    case "x":
      return `https://x.com/${path.replace(/^@/, "")}`;
    case "youtube":
      return path.startsWith("channel/") ||
        path.startsWith("c/") ||
        path.startsWith("user/") ||
        path.startsWith("@")
        ? `https://www.youtube.com/${path}`
        : `https://www.youtube.com/@${path}`;
    case "whatsapp":
      return path.startsWith("channel/")
        ? `https://whatsapp.com/${path}`
        : `https://wa.me/${path.replace(/[^\d]/g, "")}`;
    default:
      return "";
  }
}

function makeProfile(
  platform: SocialPlatform,
  handle: string,
  handlePath: string,
): ParsedSocialProfile {
  return {
    sourceId: sourceIdFor(platform, handle),
    platform,
    platformLabel: SOCIAL_PLATFORM_LABELS[platform],
    handle,
    url: normalizedUrl(platform, handlePath),
  };
}

function invalid(error: string): SocialProfileParseResult {
  return { ok: false, error };
}

export function parseSocialProfileUrl(input: string): SocialProfileParseResult {
  const value = (input ?? "").trim();
  if (!value) return invalid("Paste a social profile URL.");

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return invalid("That is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return invalid("Only http and https profile URLs are supported.");
  }
  if (url.username || url.password) {
    return invalid("URLs with embedded credentials are not allowed.");
  }

  const host = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "");
  const definition = platformForHost(host);
  if (!definition) return invalid(UNSUPPORTED);

  const segments = pathSegments(url);
  const first = segments[0]?.toLowerCase() ?? "";

  if (definition.platform === "instagram") {
    if (!first) return invalid("Use the full Instagram profile URL.");
    if (["p", "reel", "reels", "tv", "stories", "explore", "accounts"].includes(first)) {
      return invalid("That looks like an Instagram post or story, not a profile.");
    }
    return { ok: true, profile: makeProfile("instagram", segments[0]!, segments[0]!) };
  }

  if (definition.platform === "facebook") {
    if (!first) return invalid("Use the full Facebook page URL.");
    if (
      [
        "groups",
        "events",
        "watch",
        "marketplace",
        "reel",
        "reels",
        "share",
        "login",
        "help",
      ].includes(first)
    ) {
      return invalid("That Facebook URL is not a business page profile.");
    }
    if (first === "profile.php") {
      const id = url.searchParams.get("id")?.trim();
      if (!id) return invalid("The Facebook profile URL is missing its numeric id.");
      const handle = `profile.php?id=${id}`;
      return { ok: true, profile: makeProfile("facebook", handle, `profile.php?id=${id}`) };
    }
    if (["pages", "people"].includes(first) && segments.length < 2) {
      return invalid("Use the full Facebook page URL.");
    }
    return { ok: true, profile: makeProfile("facebook", segments.join("/"), segments.join("/")) };
  }

  if (definition.platform === "tiktok") {
    if (first === "share" || (!first && !url.searchParams.get("url"))) {
      return invalid("Use the full TikTok profile URL.");
    }
    const handle = segments[0]?.replace(/^@/, "") ?? "";
    if (!handle) return invalid("Use a TikTok profile URL that contains @handle.");
    return { ok: true, profile: makeProfile("tiktok", handle, handle) };
  }

  if (definition.platform === "linkedin") {
    if (first === "feed" || first === "posts" || first === "pulse") {
      return invalid("That LinkedIn URL is a post or feed, not a profile.");
    }
    if (!["company", "in", "school", "showcase"].includes(first) || segments.length < 2) {
      return invalid("Use a LinkedIn company or person profile URL.");
    }
    const handle = segments.slice(0, 2).join("/");
    return { ok: true, profile: makeProfile("linkedin", handle, handle) };
  }

  if (definition.platform === "x") {
    if (
      !first ||
      ["i", "intent", "share", "home", "search", "hashtag", "explore"].includes(first)
    ) {
      return invalid("Use the full X profile URL.");
    }
    return { ok: true, profile: makeProfile("x", segments[0]!, segments[0]!) };
  }

  if (definition.platform === "youtube") {
    if (hostMatches(host, "youtu.be")) {
      return invalid("That is a YouTube video URL, not a channel profile.");
    }
    if (!first || ["watch", "shorts", "embed", "playlist", "results", "feed"].includes(first)) {
      return invalid("Use the full YouTube channel URL.");
    }
    if (["channel", "c", "user"].includes(first) && segments.length < 2) {
      return invalid("Use the full YouTube channel URL.");
    }
    const handle = segments.slice(0, first.startsWith("@") ? 1 : 2).join("/");
    return { ok: true, profile: makeProfile("youtube", handle, handle) };
  }

  if (definition.platform === "whatsapp") {
    if (hostMatches(host, "wa.me")) {
      const phone = segments[0]?.replace(/[^\d]/g, "") ?? "";
      if (!phone) return invalid("Use a WhatsApp wa.me link with a phone number.");
      return { ok: true, profile: makeProfile("whatsapp", phone, phone) };
    }
    if (first === "send") {
      const phone = url.searchParams.get("phone")?.replace(/[^\d]/g, "") ?? "";
      if (!phone) return invalid("Use a WhatsApp send link with a phone number.");
      return { ok: true, profile: makeProfile("whatsapp", phone, phone) };
    }
    if (first === "channel" && segments[1]) {
      const handle = segments.slice(0, 2).join("/");
      return { ok: true, profile: makeProfile("whatsapp", handle, handle) };
    }
    return invalid(UNSUPPORTED);
  }

  return invalid(UNSUPPORTED);
}

export function platformFromSourceId(sourceId: string): SocialPlatform {
  const match = /^social:([a-z]+):/.exec(sourceId);
  return match?.[1] && isSocialPlatform(match[1]) ? match[1] : "other";
}

export function socialMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && /^https?:\/\//i.test(entry)) out[key] = entry;
  }
  return out;
}

export function mergePrimarySocialMap(
  current: unknown,
  profiles: SocialProfile[],
): Record<string, string> {
  const out = socialMap(current);
  const ranked = [...profiles].sort((a, b) => {
    const rank = (status: SocialProfileStatus) =>
      status === "confirmed" ? 3 : status === "blocked" ? 2 : status === "inaccessible" ? 1 : 0;
    return rank(b.status) - rank(a.status) || b.confidence - a.confidence;
  });
  for (const profile of ranked) {
    if (profile.platform === "other" || !profile.url) continue;
    if (!out[profile.platform] || profile.status === "confirmed") {
      out[profile.platform] = profile.url;
    }
  }
  return out;
}

export function removeSocialUrl(
  current: unknown,
  sourceId: string,
  url: string,
): Record<string, string> {
  const out = socialMap(current);
  for (const [key, value] of Object.entries(out)) {
    if (value === url) {
      delete out[key];
      continue;
    }
    const existing = parseSocialProfileUrl(value);
    if (existing.ok && existing.profile.sourceId === sourceId) delete out[key];
  }
  return out;
}

export function socialSearchFromProfiles(profiles: SocialProfile[]): PlatformSearch | undefined {
  const checked = profiles.filter((profile) => profile.status !== "unverified");
  if (checked.length === 0) return undefined;
  const found = Array.from(
    new Set(
      checked.map((profile) =>
        profile.handle ? `${profile.platformLabel} (${profile.handle})` : profile.platformLabel,
      ),
    ),
  );
  return { performed: true, found };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function cleanText(value: string | null | undefined, max = 300): string | null {
  if (!value) return null;
  const text = decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? null) : null;
}

export function extractPublicMetadata(html: string): SocialMetadata {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, "property") ?? attribute(tag, "name"))?.toLowerCase();
    const content = attribute(tag, "content");
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null;
  const title = cleanText(meta.get("og:title") ?? titleTag);
  const description = cleanText(
    meta.get("og:description") ?? meta.get("description") ?? meta.get("twitter:description"),
    400,
  );
  const image = meta.get("og:image") ?? meta.get("twitter:image") ?? null;
  const siteName = cleanText(meta.get("og:site_name"), 120);

  return {
    title,
    description,
    image: image && /^https?:\/\//i.test(image) ? image : null,
    siteName,
  };
}

const LOGIN_WALL_PATTERNS = [
  /log in to instagram/i,
  /log in to facebook/i,
  /you must log in/i,
  /create new account/i,
  /sign up for facebook/i,
  /content isn't available/i,
  /page isn't available/i,
  /checkpoint/i,
  /captcha/i,
  /security check/i,
  /access denied/i,
  /please log in/i,
];

const GENERIC_TITLES = new Set([
  "log in",
  "login",
  "sign up",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "x",
  "youtube",
  "whatsapp",
]);

export function isLoginWall(html: string): boolean {
  return LOGIN_WALL_PATTERNS.some((pattern) => pattern.test(html));
}

export function hasUsableMetadata(metadata: SocialMetadata): boolean {
  const title = metadata.title?.trim().toLowerCase() ?? "";
  return Boolean((metadata.title && !GENERIC_TITLES.has(title)) || metadata.description);
}
