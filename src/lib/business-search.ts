// Local, offline search over already-discovered businesses.
//
// The Leads page must answer a query like "salons" from records already in the
// database, without ever calling Google Maps. Google can be slow or unavailable,
// so search here is deliberately server-free: it matches a structured haystack
// built from the stored record and tolerates plural forms and common synonyms.
import { classifyIndustry, industryLabel, type IndustryKey } from "@/lib/rwanda";

export type SearchableBusiness = {
  name?: string | null;
  category?: string | null;
  address?: string | null;
  industry?: string | null;
  industry_secondary?: string | null;
  description?: string | null;
  products_services?: string | null;
  sector?: string | null;
  legal_name?: string | null;
  trading_names?: string[] | null;
};

// Words that carry no discriminating power in a free-text query.
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "around",
  "based",
  "business",
  "businesses",
  "companies",
  "company",
  "for",
  "in",
  "me",
  "near",
  "of",
  "the",
  "with",
]);

// Query term -> equivalent words the stored data might use instead. Keeps a
// search for "salons" working even when the record is categorised as "Beauty"
// or the name simply contains "hair".
const SEARCH_SYNONYMS: Record<string, string[]> = {
  salon: ["salon", "beauty", "hair", "barber", "spa", "nail", "cosmetic", "hairdress"],
  restaurant: [
    "restaurant",
    "cafe",
    "café",
    "food",
    "eatery",
    "diner",
    "dining",
    "grill",
    "bistro",
  ],
  hotel: ["hotel", "lodge", "guesthouse", "guest", "accommodation", "resort", "inn"],
  shop: ["shop", "store", "retail", "boutique", "market", "supermarket", "outlet"],
  pharmacy: ["pharmacy", "pharmac", "drug", "chemist", "medical"],
  clinic: ["clinic", "hospital", "health", "medical", "dental", "diagnos"],
  school: ["school", "education", "academy", "college", "university", "training", "tvet"],
  bank: ["bank", "finance", "microfinance", "sacco", "insurance", "credit"],
  garage: ["garage", "mechanic", "auto", "car", "repair", "workshop"],
  farm: [
    "farm",
    "agriculture",
    "agri",
    "garden",
    "landscap",
    "livestock",
    "dairy",
    "crop",
    "horticulture",
    "nursery",
    "plant",
  ],
  hardware: ["hardware", "construction", "building", "tools", "materials"],
  tailor: ["tailor", "fashion", "clothing", "garment", "apparel"],
  transport: [
    "transport",
    "taxi",
    "bus",
    "logistics",
    "courier",
    "freight",
    "shipping",
    "mobility",
  ],
  bakery: ["bakery", "bread", "pastry", "cake", "confection"],
  gym: ["gym", "fitness", "sport"],
  church: ["church", "ministry", "religious"],
};

// Expand a single query token into the forms that should match it.
function expandToken(token: string): string[] {
  const t = token.toLowerCase();
  const variants = new Set<string>([t]);
  if (t.length > 3 && t.endsWith("es")) variants.add(t.slice(0, -2));
  if (t.length > 3 && t.endsWith("s")) variants.add(t.slice(0, -1));

  for (const [key, syns] of Object.entries(SEARCH_SYNONYMS)) {
    const group = [key, ...syns];
    const hit = group.some(
      (g) =>
        variants.has(g) || (t.length >= 4 && g.length >= 5 && (g.startsWith(t) || t.startsWith(g))),
    );
    if (!hit) continue;
    for (const g of group) {
      variants.add(g);
      if (g.endsWith("s") && g.length > 3) variants.add(g.slice(0, -1));
    }
  }
  return [...variants];
}

// A single lowercase string holding everything worth searching for a record.
export function businessSearchText(b: SearchableBusiness): string {
  const ind =
    (b.industry as IndustryKey | null) ?? classifyIndustry(`${b.category ?? ""} ${b.name ?? ""}`);
  return [
    b.name,
    b.category,
    b.address,
    b.sector,
    b.description,
    b.products_services,
    b.legal_name,
    b.industry_secondary,
    ...(b.trading_names ?? []),
    ind ? industryLabel(ind) : null,
    ind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// True when every meaningful token of the query appears (in some form) in the
// record's search text. An empty query matches everything.
export function matchesBusinessSearch(b: SearchableBusiness, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !STOPWORDS.has(t));
  if (!tokens.length) return true;
  const hay = businessSearchText(b);
  return tokens.every((token) => expandToken(token).some((v) => hay.includes(v)));
}
