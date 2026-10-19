// Double-checks whether a business really has no website before we say so.
// Steps: 1) fresh place-details lookup (Google via Lovable, else Geoapify),
// 2) guess likely domains from the business name and verify the page actually
// mentions the business.
import { GEOAPIFY_PLACE_ID_PREFIX } from "./places.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const GEOAPIFY_PLACE_DETAILS_URL = "https://api.geoapify.com/v2/place-details";

export type WebsiteCheck = {
  website: string | null;
  source: "google_places" | "place_details" | "domain_match" | null;
  confidence: "confirmed" | "likely" | "none_found";
  steps: { step: string; result: string }[];
  // True when the domain probe stopped early on a deadline, so "none_found"
  // must NOT be treated as a confirmed absence.
  truncated?: boolean;
};

const STOP = new Set([
  "ltd",
  "limited",
  "the",
  "and",
  "company",
  "co",
  "group",
  "shop",
  "store",
  "rwanda",
  "kigali",
  "services",
  "service",
  "sarl",
  "inc",
  "plc",
]);

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function countryTlds(address: string | null) {
  const a = (address ?? "").toLowerCase();
  const map: [string, string[]][] = [
    ["rwanda", [".rw", ".co.rw"]],
    ["kenya", [".co.ke", ".ke"]],
    ["uganda", [".co.ug", ".ug"]],
    ["tanzania", [".co.tz", ".tz"]],
    ["burundi", [".bi"]],
    ["nigeria", [".com.ng", ".ng"]],
    ["south africa", [".co.za"]],
  ];
  const local = map.find(([c]) => a.includes(c))?.[1] ?? [];
  return [...local, ".com", ".africa", ".net", ".org"];
}

async function placeDetailsWebsite(placeId: string): Promise<string | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  const isGeoapify = placeId.startsWith(GEOAPIFY_PLACE_ID_PREFIX);

  if (lovableKey && mapsKey && !isGeoapify) {
    const res = await fetch(`${GATEWAY_URL}/places/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "X-Goog-FieldMask": "websiteUri",
      },
    });
    if (res.ok) {
      const d = (await res.json()) as { websiteUri?: string };
      if (d.websiteUri) return d.websiteUri;
    }
  } else if (mapsKey && !isGeoapify) {
    // Direct Google Places API (New): a plain GOOGLE_MAPS_API_KEY, no gateway.
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      { headers: { "X-Goog-Api-Key": mapsKey, "X-Goog-FieldMask": "websiteUri" } },
    );
    if (res.ok) {
      const d = (await res.json()) as { websiteUri?: string };
      if (d.websiteUri) return d.websiteUri;
    }
  }

  const geoKey = process.env["GEOAPIFY_API_KEY"];
  if (geoKey) {
    const id = isGeoapify ? placeId.slice(GEOAPIFY_PLACE_ID_PREFIX.length) : placeId;
    const url = new URL(GEOAPIFY_PLACE_DETAILS_URL);
    url.searchParams.set("id", id);
    url.searchParams.set("apiKey", geoKey);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const d = (await res.json()) as {
        features?: { properties?: { website?: string; contact?: { website?: string } } }[];
      };
      const props = d.features?.[0]?.properties;
      const w = props?.website ?? props?.contact?.website ?? null;
      if (w) return w;
    }
  }

  return null;
}

async function pageMentions(url: string, tokens: string[], timeoutMs = 7000): Promise<boolean> {
  if (await mentionsAt(url, tokens, timeoutMs)) return true;
  // Many small-business sites only answer on http://www.
  return mentionsAt(url.replace("https://", "http://www."), tokens, timeoutMs);
}

async function mentionsAt(url: string, tokens: string[], timeoutMs = 7000): Promise<boolean> {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GARE-Investigator/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return false;
    const html = (await r.text()).slice(0, 200_000).toLowerCase();
    // Parked/for-sale domains are not the business's website.
    if (/domain (is )?for sale|buy this domain|parked free|godaddy|sedo|hugedomains/.test(html))
      return false;
    const hits = tokens.filter((t) => html.includes(t)).length;
    return hits >= Math.min(2, tokens.length);
  } catch {
    return false;
  }
}

export type VerifyWebsiteOptions = {
  // Cap how many guessed domains are probed (default 20 for a thorough check).
  maxDomainCandidates?: number;
  // Absolute epoch-ms deadline: stop probing new batches once passed.
  deadlineMs?: number;
  // Per-request timeout for each domain probe (default 7000ms).
  perRequestMs?: number;
};

// Probe candidates in small batches so a deadline can actually bound the work.
async function firstMatchingDomain(
  candidates: string[],
  tokens: string[],
  perRequestMs: number,
  deadlineMs?: number,
): Promise<{ hit: string | null; truncated: boolean }> {
  const CONCURRENCY = 4;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (deadlineMs != null && Date.now() >= deadlineMs) return { hit: null, truncated: true };
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (u) => [u, await pageMentions(u, tokens, perRequestMs)] as const),
    );
    const hit = results.find(([, ok]) => ok)?.[0];
    if (hit) return { hit, truncated: false };
  }
  return { hit: null, truncated: false };
}

export async function verifyWebsite(
  b: {
    place_id: string;
    name: string;
    address: string | null;
    website: string | null;
  },
  options: VerifyWebsiteOptions = {},
): Promise<WebsiteCheck> {
  const { maxDomainCandidates = 20, deadlineMs, perRequestMs = 7000 } = options;
  const steps: WebsiteCheck["steps"] = [];
  if (b.website)
    return {
      website: b.website,
      source: "google_places",
      confidence: "confirmed",
      steps: [{ step: "Places listing", result: b.website }],
    };

  steps.push({ step: "Places listing", result: "no website listed" });
  const detail = await placeDetailsWebsite(b.place_id);
  steps.push({ step: "Fresh place-details lookup", result: detail ?? "no website" });
  if (detail) return { website: detail, source: "place_details", confidence: "confirmed", steps };

  const tokens = nameTokens(b.name);
  if (tokens.length) {
    const slugs = Array.from(
      new Set([tokens[0]!, tokens.join(""), tokens.slice(0, 2).join(""), tokens.join("-")]),
    )
      .filter((s) => s.length >= 4)
      .slice(0, 4);
    const candidates = slugs
      .flatMap((s) => countryTlds(b.address).map((tld) => `https://${s}${tld}`))
      .slice(0, Math.max(0, maxDomainCandidates));
    const { hit, truncated } = await firstMatchingDomain(
      candidates,
      tokens,
      perRequestMs,
      deadlineMs,
    );
    // (hit is the https form; the probe follows whichever variant answers)
    steps.push({
      step: `Checked ${candidates.length} likely domains`,
      result: truncatingResult(hit, truncated),
    });
    if (hit) return { website: hit, source: "domain_match", confidence: "likely", steps };
    if (truncated)
      return { website: null, source: null, confidence: "none_found", steps, truncated };
    return { website: null, source: null, confidence: "none_found", steps };
  }
  return { website: null, source: null, confidence: "none_found", steps };
}

function truncatingResult(hit: string | null, truncated: boolean): string {
  if (hit) return hit;
  return truncated ? "timed out before finishing the checks" : "none matched the business name";
}
