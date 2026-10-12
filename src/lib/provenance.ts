// Verification labels for company facts. AI output can never reach "official" or "multi_source".
export const VERIFICATION = [
  "official", "multi_source", "single_source", "ai_inference", "estimated",
  "outdated", "conflicting", "unverified", "unknown",
] as const;
export type Verification = (typeof VERIFICATION)[number];

export const VERIFICATION_LABEL: Record<Verification, string> = {
  official: "Officially verified",
  multi_source: "Confirmed by multiple sources",
  single_source: "Reported by one source",
  ai_inference: "AI inference",
  estimated: "Estimated",
  outdated: "Outdated",
  conflicting: "Conflicting sources",
  unverified: "Unverified",
  unknown: "Unknown",
};

export type Fact = {
  field: string;
  value: unknown;
  source_name: string;
  source_type: "official" | "api" | "website" | "directory" | "ai" | "inferred" | "manual";
  last_checked_at: string;
};

/** Max age (days) before a fact of this field is considered outdated. */
export const FRESHNESS_DAYS: Record<string, number> = {
  employee_range: 365, phone: 180, email: 180, website: 90, address: 365, hiring: 30,
};

/**
 * Resolve a field's status from all facts gathered for it. Disagreeing values are kept and
 * reported as conflicting — never silently picked.
 */
export function resolveField(facts: Fact[], now: Date = new Date()): {
  status: Verification;
  values: unknown[];
  sources: string[];
} {
  if (!facts.length) return { status: "unknown", values: [], sources: [] };
  const key = (v: unknown) => JSON.stringify(v);
  const values = Array.from(new Map(facts.map((f) => [key(f.value), f.value])).values());
  const sources = Array.from(new Set(facts.map((f) => f.source_name)));
  if (values.length > 1) return { status: "conflicting", values, sources };
  const maxAge = FRESHNESS_DAYS[facts[0]?.field ?? ""];
  const newest = Math.max(...facts.map((f) => Date.parse(f.last_checked_at)));
  if (maxAge && now.getTime() - newest > maxAge * 86400000) return { status: "outdated", values, sources };
  const nonAi = facts.filter((f) => f.source_type !== "ai" && f.source_type !== "inferred");
  if (!nonAi.length)
    return { status: facts.some((f) => f.source_type === "ai") ? "ai_inference" : "estimated", values, sources };
  if (nonAi.some((f) => f.source_type === "official")) return { status: "official", values, sources };
  const indep = new Set(nonAi.map((f) => f.source_name)).size;
  return { status: indep > 1 ? "multi_source" : "single_source", values, sources };
}

/** Normalize a business name for dedupe hints only — never merge on name alone. */
export function normalizeName(n: string): string {
  return n.toLowerCase().replace(/\b(ltd|limited|plc|co|company|rwanda|sarl)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Two records are the same business only with a shared strong identifier. */
export function sameBusiness(
  a: { place_id?: string | null; website?: string | null; phone?: string | null },
  b: { place_id?: string | null; website?: string | null; phone?: string | null },
): boolean {
  if (a.place_id && b.place_id) return a.place_id === b.place_id;
  const host = (u?: string | null) => {
    try { return u ? new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "") : null; }
    catch { return null; }
  };
  const ha = host(a.website), hb = host(b.website);
  if (ha && hb && ha === hb) return true;
  const ph = (p?: string | null) => (p ? p.replace(/\D/g, "").slice(-9) : null);
  const pa = ph(a.phone), pb = ph(b.phone);
  return !!(pa && pb && pa.length === 9 && pa === pb);
}
