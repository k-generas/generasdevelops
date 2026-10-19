// Canonical business identity + cross-source deduplication.
//
// The same company appears across Google Maps, directories and datasets with
// slightly different names, URLs and phone numbers. This module produces stable
// keys and conservative match decisions so we never merge two genuinely
// different companies. It is pure and evidence-based: it only compares strings.
const LEGAL_SUFFIXES = new Set([
  "ltd",
  "limited",
  "sarl",
  "plc",
  "inc",
  "incorporated",
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "holdings",
  "enterprise",
  "enterprises",
  "trading",
  "rwanda",
  "rw",
]);

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !LEGAL_SUFFIXES.has(t))
    .join(" ")
    .trim();
}

export function nameTokens(name: string): string[] {
  return normalizeCompanyName(name).split(" ").filter(Boolean);
}

// Jaccard similarity over normalized name tokens (0..1).
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Normalise a URL to its registrable-ish host for domain matching.
export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "");
  return host || null;
}

// Rwandan and international phone numbers to a comparable digit string.
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  // Rwanda country code 250: drop a leading 0 or +250 so formats converge.
  if (digits.startsWith("250")) return digits.slice(3);
  return digits.replace(/^0+/, "");
}

export type BusinessIdentity = {
  place_id?: string | null;
  name: string;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type MatchReason =
  | { kind: "place_id"; value: string }
  | { kind: "domain"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "name"; value: number };

// Decide whether two records are the same business. Deterministic signals
// (place_id, domain, phone) beat fuzzy name matching, which needs a high
// threshold plus a shared location hint to avoid false merges.
export function matchBusiness(a: BusinessIdentity, b: BusinessIdentity): MatchReason | null {
  if (a.place_id && b.place_id && a.place_id === b.place_id)
    return { kind: "place_id", value: a.place_id };

  const da = normalizeDomain(a.website);
  const db = normalizeDomain(b.website);
  if (da && db && da === db) return { kind: "domain", value: da };

  const pa = normalizePhone(a.phone);
  const pb = normalizePhone(b.phone);
  if (pa && pb && pa === pb) return { kind: "phone", value: pa };

  const sim = nameSimilarity(a.name, b.name);
  if (sim >= 0.8) return { kind: "name", value: sim };
  return null;
}

// Import-oriented check used when importing fresh search results against
// already-stored records. Deterministic signals (place_id, domain, phone) are
// definitive, but names must clear a high bar because generic business names
// ("Salon", "Shop") collide easily and would otherwise hide real leads.
export function sameBusinessRecord(
  a: BusinessIdentity,
  b: BusinessIdentity,
  nameThreshold = 0.9,
): MatchReason | null {
  if (a.place_id && b.place_id && a.place_id === b.place_id)
    return { kind: "place_id", value: a.place_id };

  const da = normalizeDomain(a.website);
  const db = normalizeDomain(b.website);
  if (da && db && da === db) return { kind: "domain", value: da };

  const pa = normalizePhone(a.phone);
  const pb = normalizePhone(b.phone);
  if (pa && pb && pa === pb) return { kind: "phone", value: pa };

  const sim = nameSimilarity(a.name, b.name);
  if (sim >= nameThreshold) return { kind: "name", value: sim };
  return null;
}

export type DedupeOutcome<T> = {
  kept: T[];
  duplicates: { kept: T; dropped: T; reason: MatchReason }[];
};

// Deduplicate a list, preserving the first occurrence. The first item wins so
// the caller controls priority (e.g. official dataset before a directory).
export function dedupeBusinesses<T extends BusinessIdentity>(items: T[]): DedupeOutcome<T> {
  const kept: T[] = [];
  const duplicates: DedupeOutcome<T>["duplicates"] = [];
  for (const item of items) {
    let matched = false;
    for (const k of kept) {
      const reason = matchBusiness(k, item);
      if (reason) {
        duplicates.push({ kept: k, dropped: item, reason });
        matched = true;
        break;
      }
    }
    if (!matched) kept.push(item);
  }
  return { kept, duplicates };
}
