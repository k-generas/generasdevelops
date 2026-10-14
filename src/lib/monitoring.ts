// Pure helpers for automatic daily monitoring. Kept free of server imports so
// both the server job and the UI (and unit tests) can use them.
import { INDUSTRIES, type IndustryKey } from "./rwanda";
import { RADAR_CATEGORIES, categoryIndustries, type RadarCategoryKey } from "./radar";

export type DigestBusiness = {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  district: string | null;
  website: string | null;
  score: number | null;
};

const ALL_INDUSTRIES = INDUSTRIES.map((i) => i.key) as IndustryKey[];

// The saved category ("all" included) resolved to the industries a scan covers.
export function industriesForCategory(category: string): IndustryKey[] {
  const key = (RADAR_CATEGORIES.find((c) => c.key === category)?.key ?? "all") as RadarCategoryKey;
  return categoryIndustries(key) ?? ALL_INDUSTRIES;
}

// One digest per owner per UTC day; this is the date bucket key.
export function utcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// Defensive read of the `new_businesses` jsonb column.
export function parseDigestBusinesses(value: unknown): DigestBusiness[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (b): b is DigestBusiness =>
      !!b &&
      typeof b === "object" &&
      typeof (b as { id?: unknown }).id === "string" &&
      typeof (b as { name?: unknown }).name === "string",
  );
}
