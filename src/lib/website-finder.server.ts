// Double-checks whether a business really has no website before we say so.
// Steps: 1) fresh Google Place Details lookup, 2) guess likely domains from the
// business name and verify the page actually mentions the business.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type WebsiteCheck = {
  website: string | null;
  source: "google_places" | "place_details" | "domain_match" | null;
  confidence: "confirmed" | "likely" | "none_found";
  steps: { step: string; result: string }[];
};

const STOP = new Set(["ltd", "limited", "the", "and", "company", "co", "group", "shop", "store", "rwanda", "kigali", "services", "service", "sarl", "inc", "plc"]);

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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
  if (!lovableKey || !mapsKey) return null;
  const res = await fetch(`${GATEWAY_URL}/places/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapsKey, "X-Goog-FieldMask": "websiteUri" },
  });
  if (!res.ok) return null;
  const d = (await res.json()) as { websiteUri?: string };
  return d.websiteUri ?? null;
}

async function pageMentions(url: string, tokens: string[]): Promise<boolean> {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; GARE-Investigator/1.0)" }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return false;
    const html = (await r.text()).slice(0, 200_000).toLowerCase();
    // Parked/for-sale domains are not the business's website.
    if (/domain (is )?for sale|buy this domain|parked free|godaddy|sedo|hugedomains/.test(html)) return false;
    const hits = tokens.filter((t) => html.includes(t)).length;
    return hits >= Math.min(2, tokens.length);
  } catch {
    return false;
  }
}

export async function verifyWebsite(b: { place_id: string; name: string; address: string | null; website: string | null }): Promise<WebsiteCheck> {
  const steps: WebsiteCheck["steps"] = [];
  if (b.website) return { website: b.website, source: "google_places", confidence: "confirmed", steps: [{ step: "Google Maps listing", result: b.website }] };

  steps.push({ step: "Google Maps listing", result: "no website listed" });
  const detail = await placeDetailsWebsite(b.place_id);
  steps.push({ step: "Fresh Google Place Details lookup", result: detail ?? "no website" });
  if (detail) return { website: detail, source: "place_details", confidence: "confirmed", steps };

  const tokens = nameTokens(b.name);
  if (tokens.length) {
    const slugs = Array.from(new Set([tokens.join(""), tokens.join("-"), tokens.slice(0, 2).join("")])).filter((s) => s.length >= 4).slice(0, 3);
    const candidates = slugs.flatMap((s) => countryTlds(b.address).map((tld) => `https://${s}${tld}`)).slice(0, 12);
    const results = await Promise.all(candidates.map(async (u) => [u, await pageMentions(u, tokens)] as const));
    const hit = results.find(([, ok]) => ok)?.[0] ?? null;
    steps.push({ step: `Checked ${candidates.length} likely domains`, result: hit ?? "none matched the business name" });
    if (hit) return { website: hit, source: "domain_match", confidence: "likely", steps };
  }
  return { website: null, source: null, confidence: "none_found", steps };
}
