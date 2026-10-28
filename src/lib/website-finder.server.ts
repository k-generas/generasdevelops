// Double-checks whether a business really has no website before we say so.
// Steps: 1) fresh place-details lookup (Google via Lovable, else Geoapify),
// 2) guess likely domains from the business name and verify the page actually
// mentions the business.
import { GEOAPIFY_PLACE_ID_PREFIX } from "./places.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const GEOAPIFY_PLACE_DETAILS_URL = "https://api.geoapify.com/v2/place-details";

export type WebsiteCheckStep = { id: string; status: string; detail?: string | null };

export type WebsiteCheck = {
  website: string | null;
  source: "google_places" | "place_details" | "domain_match" | "free_hosting" | null;
  confidence: "confirmed" | "likely" | "none_found";
  steps: { step: string; result: string }[];
  // Structured version of the same checks, so the classifier does not depend on
  // parsing human-readable step text.
  checks: WebsiteCheckStep[];
  candidates_tested: number;
  checked_at: string;
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

const FREE_HOSTING_SUFFIXES = [
  ".wixsite.com",
  ".wordpress.com",
  ".blogspot.com",
  ".business.site",
  ".myshopify.com",
  ".webnode.page",
  ".weebly.com",
  ".jimdosite.com",
];

function slugsForName(name: string): string[] {
  const tokens = nameTokens(name);
  if (!tokens.length) return [];
  return Array.from(
    new Set([tokens[0]!, tokens.join(""), tokens.slice(0, 2).join(""), tokens.join("-")]),
  ).filter((s) => s.length >= 4);
}

function freeHostingCandidates(slugs: string[], max: number): string[] {
  const out: string[] = [];
  const hostSlugs = slugs.slice(0, 2);
  for (const suffix of FREE_HOSTING_SUFFIXES) {
    for (const slug of hostSlugs) {
      out.push(`https://${slug}${suffix}`);
      if (out.length >= max) return out;
    }
  }
  return out;
}

type PlaceDetailsResult = {
  website: string | null;
  result: "positive" | "negative" | "failed" | "not_performed";
};

async function placeDetailsWebsite(placeId: string): Promise<PlaceDetailsResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  const isGeoapify = placeId.startsWith(GEOAPIFY_PLACE_ID_PREFIX);
  let attempted = false;
  let anyOk = false;

  if (lovableKey && mapsKey && !isGeoapify) {
    attempted = true;
    try {
      const res = await fetch(`${GATEWAY_URL}/places/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "X-Goog-FieldMask": "websiteUri",
        },
      });
      if (res.ok) {
        anyOk = true;
        const d = (await res.json()) as { websiteUri?: string };
        if (d.websiteUri) return { website: d.websiteUri, result: "positive" };
      }
    } catch {
      // Fall through to Geoapify or a failed/not-performed result.
    }
  } else if (mapsKey && !isGeoapify) {
    // Direct Google Places API (New): a plain GOOGLE_MAPS_API_KEY, no gateway.
    attempted = true;
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        { headers: { "X-Goog-Api-Key": mapsKey, "X-Goog-FieldMask": "websiteUri" } },
      );
      if (res.ok) {
        anyOk = true;
        const d = (await res.json()) as { websiteUri?: string };
        if (d.websiteUri) return { website: d.websiteUri, result: "positive" };
      }
    } catch {
      // Fall through to Geoapify or a failed/not-performed result.
    }
  }

  const geoKey = process.env["GEOAPIFY_API_KEY"];
  if (geoKey) {
    attempted = true;
    try {
      const id = isGeoapify ? placeId.slice(GEOAPIFY_PLACE_ID_PREFIX.length) : placeId;
      const url = new URL(GEOAPIFY_PLACE_DETAILS_URL);
      url.searchParams.set("id", id);
      url.searchParams.set("apiKey", geoKey);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        anyOk = true;
        const d = (await res.json()) as {
          features?: { properties?: { website?: string; contact?: { website?: string } } }[];
        };
        const props = d.features?.[0]?.properties;
        const w = props?.website ?? props?.contact?.website ?? null;
        if (w) return { website: w, result: "positive" };
      }
    } catch {
      // Fall through to the result below.
    }
  }

  if (!attempted) return { website: null, result: "not_performed" };
  return { website: null, result: anyOk ? "negative" : "failed" };
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
  // Cap free-hosting / website-builder candidates separately so both checks are
  // represented without unbounded probing.
  maxFreeHostingCandidates?: number;
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
): Promise<{ hit: string | null; truncated: boolean; tested: number }> {
  const CONCURRENCY = 4;
  let tested = 0;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (deadlineMs != null && Date.now() >= deadlineMs) {
      return { hit: null, truncated: true, tested };
    }
    const batch = candidates.slice(i, i + CONCURRENCY);
    tested += batch.length;
    const results = await Promise.all(
      batch.map(async (u) => [u, await pageMentions(u, tokens, perRequestMs)] as const),
    );
    const hit = results.find(([, ok]) => ok)?.[0];
    if (hit) return { hit, truncated: false, tested };
  }
  return { hit: null, truncated: false, tested };
}

export async function verifyWebsite(
  b: {
    place_id: string;
    name: string;
    address: string | null;
    website: string | null;
    aliases?: (string | null | undefined)[];
  },
  options: VerifyWebsiteOptions = {},
): Promise<WebsiteCheck> {
  const {
    maxDomainCandidates = 20,
    maxFreeHostingCandidates = 8,
    deadlineMs,
    perRequestMs = 7000,
  } = options;
  const checkedAt = new Date().toISOString();
  const steps: WebsiteCheck["steps"] = [];
  const checks: WebsiteCheckStep[] = [];
  if (b.website) {
    checks.push({ id: "website_identity", status: "positive", detail: b.website });
    return {
      website: b.website,
      source: "google_places",
      confidence: "confirmed",
      steps: [{ step: "Places listing", result: b.website }],
      checks,
      candidates_tested: 0,
      checked_at: checkedAt,
    };
  }

  steps.push({ step: "Places listing", result: "no website listed" });
  const detail = await placeDetailsWebsite(b.place_id);
  checks.push({
    id: "place_details",
    status: detail.result,
    detail: detail.website ?? detail.result,
  });
  steps.push({
    step: "Fresh place-details lookup",
    result: detail.website ?? detail.result.replace("_", " "),
  });
  if (detail.website) {
    return {
      website: detail.website,
      source: "place_details",
      confidence: "confirmed",
      steps,
      checks,
      candidates_tested: 0,
      checked_at: checkedAt,
    };
  }

  const names = Array.from(
    new Set([b.name, ...(b.aliases ?? [])].filter((n): n is string => !!n && n.trim().length > 0)),
  );
  const tokens = Array.from(new Set(names.flatMap((n) => nameTokens(n))));
  const slugGroups = names.map((n) => slugsForName(n)).filter((g) => g.length > 0);
  const slugs = Array.from(new Set(slugGroups.flat())).slice(0, 6);
  const hostSlugs = Array.from(new Set(slugGroups.map((g) => g[0]!))).slice(0, 2);
  let candidatesTested = 0;

  // 1) Likely own domains (local TLDs plus .com/.africa/.net/.org).
  if (tokens.length && slugs.length && maxDomainCandidates > 0) {
    const candidates = countryTlds(b.address)
      .flatMap((tld) => slugs.map((s) => `https://${s}${tld}`))
      .slice(0, Math.max(0, maxDomainCandidates));
    const { hit, truncated, tested } = await firstMatchingDomain(
      candidates,
      tokens,
      perRequestMs,
      deadlineMs,
    );
    candidatesTested += tested;
    checks.push({
      id: "domain_candidates",
      status: hit ? "positive" : truncated ? "truncated" : "negative",
      detail: hit ?? (truncated ? "deadline reached" : "none matched the business name"),
    });
    // (hit is the https form; the probe follows whichever variant answers)
    steps.push({
      step: `Checked ${candidates.length} likely domains`,
      result: truncatingResult(hit, truncated),
    });
    if (hit) {
      checks.push({
        id: "free_hosting",
        status: "not_performed",
        detail: "Skipped because a domain candidate already matched.",
      });
      return {
        website: hit,
        source: "domain_match",
        confidence: "likely",
        steps,
        checks,
        candidates_tested: candidatesTested,
        checked_at: checkedAt,
      };
    }
    if (truncated) {
      checks.push({
        id: "free_hosting",
        status: "not_performed",
        detail: "Skipped because the deadline was reached.",
      });
      steps.push({
        step: "Free-hosting / website-builder candidates",
        result: "not checked: website double-check timed out",
      });
      return {
        website: null,
        source: null,
        confidence: "none_found",
        steps,
        checks,
        candidates_tested: candidatesTested,
        checked_at: checkedAt,
        truncated,
      };
    }
  } else {
    checks.push({
      id: "domain_candidates",
      status: "not_performed",
      detail: "No usable business-name tokens for domain guesses.",
    });
    steps.push({
      step: "Likely domain candidates",
      result: "not checked: no usable business-name tokens",
    });
  }

  // 2) Free hosting / website builders, where many small businesses actually
  // publish a site that is not discoverable as a normal domain.
  const freeCandidates = freeHostingCandidates(hostSlugs, Math.max(0, maxFreeHostingCandidates));
  if (tokens.length && freeCandidates.length) {
    const { hit, truncated, tested } = await firstMatchingDomain(
      freeCandidates,
      tokens,
      perRequestMs,
      deadlineMs,
    );
    candidatesTested += tested;
    checks.push({
      id: "free_hosting",
      status: hit ? "positive" : truncated ? "truncated" : "negative",
      detail: hit ?? (truncated ? "deadline reached" : "none matched the business name"),
    });
    steps.push({
      step: `Checked ${freeCandidates.length} free-hosting / website-builder candidates`,
      result: truncatingResult(hit, truncated),
    });
    if (hit) {
      return {
        website: hit,
        source: "free_hosting",
        confidence: "likely",
        steps,
        checks,
        candidates_tested: candidatesTested,
        checked_at: checkedAt,
      };
    }
    return {
      website: null,
      source: null,
      confidence: "none_found",
      steps,
      checks,
      candidates_tested: candidatesTested,
      checked_at: checkedAt,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  checks.push({
    id: "free_hosting",
    status: "not_performed",
    detail: "No usable business-name tokens for free-hosting guesses.",
  });
  steps.push({
    step: "Free-hosting / website-builder candidates",
    result: "not checked: no usable business-name tokens",
  });
  return {
    website: null,
    source: null,
    confidence: "none_found",
    steps,
    checks,
    candidates_tested: candidatesTested,
    checked_at: checkedAt,
  };
}

function truncatingResult(hit: string | null, truncated: boolean): string {
  if (hit) return hit;
  return truncated ? "timed out before finishing the checks" : "none matched the business name";
}
