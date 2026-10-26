// Duplicate detection for saved leads. Grouping is conservative: only a shared
// usable phone number, a shared business website, or an identical name inside
// the same district is treated as the same company.
export type DuplicateBusiness = {
  id: string;
  name: string;
  phone?: string | null;
  cell?: string | null;
  website?: string | null;
  address?: string | null;
  district?: string | null;
  province?: string | null;
  emails?: string[] | null;
  score?: number | null;
};

export type DuplicateReason = "phone" | "website" | "name+district";

export type DuplicateGroup = {
  key: string;
  reason: DuplicateReason;
  label: string;
  businesses: DuplicateBusiness[];
  suggestedKeepId: string;
};

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "wa.me",
  "api.whatsapp.com",
  "google.com",
  "maps.google.com",
  "youtube.com",
]);

const NAME_SUFFIXES = new Set([
  "ltd",
  "limited",
  "plc",
  "sarl",
  "sar",
  "co",
  "company",
  "enterprise",
  "enterprises",
  "the",
  "and",
]);

export function normalizePhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits.slice(-9) : "";
}

export function normalizeDomain(value: string | null | undefined): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "";
  let host = raw;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    host = raw.split("/")[0] ?? "";
  }
  host = host.replace(/^www\./, "");
  if (!host || SOCIAL_HOSTS.has(host)) return "";
  if (!host.includes(".")) return "";
  return host;
}

export function normalizeName(value: string | null | undefined): string {
  const words = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !NAME_SUFFIXES.has(w));
  return words.join(" ");
}

function placeKey(b: DuplicateBusiness): string {
  return (b.district ?? "").trim().toLowerCase() || (b.address ?? "").trim().toLowerCase();
}

export function completeness(b: DuplicateBusiness): number {
  let score = 0;
  if (b.phone) score += 3;
  if (b.cell) score += 1;
  if (b.website) score += 3;
  if (b.address) score += 2;
  if (b.district) score += 1;
  if (b.emails && b.emails.length > 0) score += 2;
  return score;
}

function suggestKeep(businesses: DuplicateBusiness[]): string {
  return [...businesses].sort((a, b) => {
    const diff = completeness(b) - completeness(a);
    if (diff !== 0) return diff;
    const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  })[0]!.id;
}

function collectGroups(
  businesses: DuplicateBusiness[],
  seen: Set<string>,
  keyOf: (b: DuplicateBusiness) => string,
  reason: DuplicateReason,
  label: string,
): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateBusiness[]>();
  for (const b of businesses) {
    if (seen.has(b.id)) continue;
    const key = keyOf(b);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(b);
    byKey.set(key, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    for (const b of list) seen.add(b.id);
    groups.push({
      key: `${reason}:${key}`,
      reason,
      label,
      businesses: list,
      suggestedKeepId: suggestKeep(list),
    });
  }
  return groups.sort((a, b) => b.businesses.length - a.businesses.length);
}

export function findDuplicateGroups(businesses: DuplicateBusiness[]): DuplicateGroup[] {
  const seen = new Set<string>();
  const phoneGroups = collectGroups(
    businesses,
    seen,
    (b) => normalizePhone(b.phone) || normalizePhone(b.cell),
    "phone",
    "Shared phone number",
  );
  const websiteGroups = collectGroups(
    businesses,
    seen,
    (b) => normalizeDomain(b.website),
    "website",
    "Shared website",
  );
  const nameGroups = collectGroups(
    businesses,
    seen,
    (b) => {
      const name = normalizeName(b.name);
      const place = placeKey(b);
      return name.length >= 4 && place ? `${name}::${place}` : "";
    },
    "name+district",
    "Same name in the same district",
  );
  return [...phoneGroups, ...websiteGroups, ...nameGroups];
}
