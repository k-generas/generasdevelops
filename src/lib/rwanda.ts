// Rwanda administrative + industry taxonomy and location helpers.
//
// This is reference data only. It never invents a company fact: it just maps an
// observed address/industry string onto the official Rwandan structure so the UI
// and ranking can filter and group real records. Sources: Rwanda's 5 provinces
// and 30 districts (NISR administrative structure).
export const PROVINCES = ["Kigali City", "Northern", "Southern", "Eastern", "Western"] as const;
export type Province = (typeof PROVINCES)[number];

export const PROVINCE_ALIASES: Record<string, Province> = {
  kigali: "Kigali City",
  "kigali city": "Kigali City",
  "umujyi wa kigali": "Kigali City",
  "city of kigali": "Kigali City",
  northern: "Northern",
  north: "Northern",
  amajyaruguru: "Northern",
  southern: "Southern",
  south: "Southern",
  amajyepfo: "Southern",
  eastern: "Eastern",
  east: "Eastern",
  iburasirazuba: "Eastern",
  western: "Western",
  west: "Western",
  iburengerazuba: "Western",
};

export const DISTRICTS: Record<Province, string[]> = {
  "Kigali City": ["Gasabo", "Kicukiro", "Nyarugenge"],
  Northern: ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  Southern: [
    "Gisagara",
    "Huye",
    "Kamonyi",
    "Muhanga",
    "Nyamagabe",
    "Nyanza",
    "Nyaruguru",
    "Ruhango",
  ],
  Eastern: ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
  Western: ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
};

export const ALL_DISTRICTS: string[] = PROVINCES.flatMap((p) => DISTRICTS[p]);

// Business categories from the spec. `key` is the stable id; `label` is shown.
export const INDUSTRIES = [
  { key: "manufacturing", label: "Factories & manufacturing" },
  { key: "wholesale_retail", label: "Wholesale, distribution & retail" },
  { key: "agriculture", label: "Agriculture, food processing & agribusiness" },
  { key: "construction", label: "Construction, engineering & property" },
  { key: "transport", label: "Transport, logistics & mobility" },
  { key: "hospitality", label: "Hotels, restaurants & tourism" },
  { key: "health", label: "Clinics, hospitals & healthcare" },
  { key: "education", label: "Schools, universities & training" },
  { key: "finance", label: "Financial services & insurance" },
  { key: "technology", label: "Technology & digital agencies" },
  { key: "professional", label: "Professional services & consultancy" },
  { key: "trade", label: "Importers, exporters & trading" },
  { key: "energy_mining", label: "Energy, mining & industrial" },
  { key: "other", label: "Other commercial sectors" },
] as const;
export type IndustryKey = (typeof INDUSTRIES)[number]["key"];

// Keyword -> industry. First match wins; order matters (most specific first).
const INDUSTRY_KEYWORDS: [IndustryKey, string[]][] = [
  ["technology", ["software", "ict", "digital", "app", "web", "data", "tech", "computer", "it "]],
  ["health", ["clinic", "hospital", "health", "medical", "pharmac", "dental", "diagnos"]],
  ["education", ["school", "university", "college", "training", "education", "academy", "tvet"]],
  ["finance", ["bank", "insurance", "microfinance", "finance", "sacco", "credit", "invest"]],
  [
    "hospitality",
    ["hotel", "restaurant", "lodge", "bar", "café", "cafe", "tour", "resort", "guest"],
  ],
  [
    "transport",
    ["transport", "logistic", "freight", "courier", "taxi", "bus", "shipping", "mobility"],
  ],
  ["construction", ["construction", "build", "engineer", "real estate", "property", "architect"]],
  ["agriculture", ["farm", "agri", "food", "coffee", "tea", "milk", "dairy", "process", "mill"]],
  ["energy_mining", ["energy", "mining", "mine", "solar", "power", "petroleum", "gas", "quarry"]],
  ["manufacturing", ["manufactur", "factory", "industrial", "production", "assembly", "plant"]],
  [
    "wholesale_retail",
    ["wholesale", "retail", "shop", "store", "supermarket", "market", "distribut"],
  ],
  ["trade", ["import", "export", "trading", "traders"]],
  [
    "professional",
    ["consult", "law", "legal", "account", "audit", "advertis", "marketing", "agency"],
  ],
];

export function classifyIndustry(text: string | null | undefined): IndustryKey | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [key, words] of INDUSTRY_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return key;
  }
  return null;
}

export function industryLabel(key: string): string {
  return INDUSTRIES.find((i) => i.key === key)?.label ?? "Other commercial sectors";
}

// Normalise a district string to its canonical spelling, or null.
export function normalizeDistrict(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim().toLowerCase();
  return ALL_DISTRICTS.find((d) => d.toLowerCase() === t) ?? null;
}

export function normalizeProvince(input: string | null | undefined): Province | null {
  if (!input) return null;
  const t = input.trim().toLowerCase();
  const exact = PROVINCES.find((p) => p.toLowerCase() === t);
  if (exact) return exact;
  return PROVINCE_ALIASES[t] ?? null;
}

// Province a district belongs to (by canonical district name).
export function provinceOfDistrict(district: string | null | undefined): Province | null {
  const d = normalizeDistrict(district);
  if (!d) return null;
  return PROVINCES.find((p) => DISTRICTS[p].includes(d)) ?? null;
}

export type LocationHint = { province: Province | null; district: string | null };

// Best-effort parse of a free-text address/location string. Never guesses a
// district it cannot find; returns nulls instead so callers can mark unknown.
export function parseLocation(input: string | null | undefined): LocationHint {
  if (!input) return { province: null, district: null };
  const words = input.split(/[,\s]+/);
  let district: string | null = null;
  for (const w of words) {
    const d = normalizeDistrict(w);
    if (d) {
      district = d;
      break;
    }
  }
  const province =
    (district ? provinceOfDistrict(district) : null) ?? normalizeProvince(input) ?? null;
  return { province, district };
}

export type BusinessLocationFilter = {
  province?: Province | null;
  district?: string | null;
  industry?: IndustryKey | null;
};

export function matchesLocation(
  b: { province?: string | null; district?: string | null; address?: string | null },
  f: BusinessLocationFilter,
): boolean {
  if (f.industry) {
    // industry handled elsewhere (needs category); here we only filter geography
  }
  if (f.district) {
    const d = b.district ?? parseLocation(b.address).district;
    if (normalizeDistrict(d) !== normalizeDistrict(f.district)) return false;
  }
  if (f.province) {
    const p = b.province ?? parseLocation(b.address).province;
    if (normalizeProvince(p) !== f.province) return false;
  }
  return true;
}
