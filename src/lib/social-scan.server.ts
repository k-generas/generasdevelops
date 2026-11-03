import {
  extractPublicMetadata,
  hasUsableMetadata,
  isLoginWall,
  type ParsedSocialProfile,
  type SocialMetadata,
  type SocialProbeResult,
  type SocialProfileStatus,
} from "./social-profiles";

const USER_AGENT =
  "GARE-SocialPresence/1.0 (+https://generasdevelops.lovable.app; public profile check)";
const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 200_000;
const MAX_PROFILES = 8;
const CONCURRENCY = 3;

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, MAX_BODY_BYTES);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (received < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BODY_BYTES - received;
      const chunk = value.subarray(0, remaining);
      text += decoder.decode(chunk, { stream: true });
      received += chunk.byteLength;
    }
    text += decoder.decode();
    return text;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function metadataExcerpt(metadata: SocialMetadata): string {
  const parts = [metadata.title, metadata.description].filter(Boolean) as string[];
  const text = parts.join(" — ").replace(/\s+/g, " ").trim();
  return text.length > 400 ? `${text.slice(0, 399).trimEnd()}…` : text;
}

function result(
  profile: ParsedSocialProfile,
  status: SocialProfileStatus,
  excerpt: string,
  metadata: SocialMetadata | null = null,
): SocialProbeResult {
  const now = new Date().toISOString();
  return {
    sourceId: profile.sourceId,
    status,
    excerpt,
    checkedAt: now,
    verifiedAt: status === "confirmed" ? now : null,
    metadata,
  };
}

export async function probeSocialProfile(profile: ParsedSocialProfile): Promise<SocialProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(profile.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en",
      },
    });

    if ([401, 403].includes(response.status)) {
      return result(
        profile,
        "blocked",
        `Public page returned HTTP ${response.status}; the platform requires a login or denies automated access.`,
      );
    }
    if (response.status === 429) {
      return result(
        profile,
        "blocked",
        "The platform rate-limited the public check (HTTP 429). Try again later.",
      );
    }
    if (!response.ok) {
      return result(
        profile,
        "inaccessible",
        `Public page returned HTTP ${response.status}; the profile may be removed or unavailable.`,
      );
    }

    const contentType = response.headers?.get("content-type") ?? "";
    if (contentType && !/html|text/i.test(contentType)) {
      return result(
        profile,
        "inaccessible",
        "The profile URL returned a file, not a public HTML page.",
      );
    }

    const html = await readLimitedText(response);
    const metadata = extractPublicMetadata(html);
    const metadataText = `${metadata.title ?? ""} ${metadata.description ?? ""}`;
    const loginWall = isLoginWall(html);
    const loginMetadata =
      /log in|login|sign up|content isn't available|page isn't available|checkpoint|security check|captcha|access denied/i.test(
        metadataText,
      );

    if (loginWall && (!hasUsableMetadata(metadata) || loginMetadata)) {
      return result(
        profile,
        "blocked",
        "The platform served a login, consent or security wall instead of the public profile.",
      );
    }
    if (hasUsableMetadata(metadata)) {
      return result(profile, "confirmed", metadataExcerpt(metadata), metadata);
    }
    if (loginWall) {
      return result(
        profile,
        "blocked",
        "The platform served a login, consent or security wall instead of the public profile.",
      );
    }

    return result(
      profile,
      "unverified",
      "The public page responded, but no readable profile metadata was found.",
      metadata,
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "The public profile check timed out."
        : `The public profile check failed: ${
            error instanceof Error ? error.message : "unknown network error"
          }`;
    return result(profile, "inaccessible", `${message} The profile may still exist.`);
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scanSocialProfiles(
  profiles: ParsedSocialProfile[],
): Promise<{ results: SocialProbeResult[]; skipped: number }> {
  const unique = new Map<string, ParsedSocialProfile>();
  for (const profile of profiles) {
    if (!unique.has(profile.sourceId)) unique.set(profile.sourceId, profile);
  }
  const all = [...unique.values()];
  const selected = all.slice(0, MAX_PROFILES);
  const results = await mapLimit(selected, CONCURRENCY, (profile) => probeSocialProfile(profile));
  return { results, skipped: Math.max(0, all.length - selected.length) };
}
