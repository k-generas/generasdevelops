// Rwanda administrative geography (4 provinces + City of Kigali, 30 districts).
export const RWANDA: Record<string, string[]> = {
  "City of Kigali": ["Gasabo", "Kicukiro", "Nyarugenge"],
  "Northern Province": ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  "Southern Province": [
    "Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango",
  ],
  "Eastern Province": [
    "Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana",
  ],
  "Western Province": [
    "Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro",
  ],
};
export const PROVINCES = Object.keys(RWANDA);

// Common alternative names that appear in addresses.
const ALIASES: Record<string, string> = {
  gisenyi: "Rubavu", ruhengeri: "Musanze", butare: "Huye", cyangugu: "Rusizi",
  kibuye: "Karongi", gitarama: "Muhanga", byumba: "Gicumbi", kibungo: "Ngoma",
  remera: "Gasabo", kimironko: "Gasabo", kacyiru: "Gasabo", kimihurura: "Gasabo",
  kicukiro: "Kicukiro", kanombe: "Kicukiro", gikondo: "Kicukiro", nyamirambo: "Nyarugenge",
  muhima: "Nyarugenge", nyabugogo: "Nyarugenge",
};

export function provinceOf(district: string): string | null {
  for (const [p, ds] of Object.entries(RWANDA)) if (ds.includes(district)) return p;
  return null;
}

/**
 * Infer district/province from a free-text address. This is an inference, not a verified
 * location: callers must store it with location_source = "address_text".
 */
export function inferLocation(address: string | null | undefined): {
  province: string | null;
  district: string | null;
} {
  if (!address) return { province: null, district: null };
  const a = address.toLowerCase();
  const tokens = a.split(/[^a-z]+/).filter(Boolean);
  for (const ds of Object.values(RWANDA))
    for (const d of ds) if (tokens.includes(d.toLowerCase())) return { province: provinceOf(d), district: d };
  for (const t of tokens) if (ALIASES[t]) return { province: provinceOf(ALIASES[t]), district: ALIASES[t] };
  if (tokens.includes("kigali")) return { province: "City of Kigali", district: null };
  return { province: null, district: null };
}

export const INDUSTRIES = [
  "Manufacturing", "Wholesale & retail", "Agriculture & food", "Construction & property",
  "Transport & logistics", "Hospitality & tourism", "Healthcare", "Education",
  "Finance & insurance", "Technology", "Professional services", "Trade & import/export",
  "Energy & mining", "Beauty & personal care", "Other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

const RULES: [RegExp, Industry][] = [
  [/factory|manufactur|industr|mill|brewer|plant/, "Manufacturing"],
  [/hospital|clinic|pharma|dental|medical|health|doctor|laborator/, "Healthcare"],
  [/school|universit|college|academy|training|kindergarten/, "Education"],
  [/hotel|lodg|restaurant|cafe|coffee|bar|resort|tour|travel|food_?court|bakery/, "Hospitality & tourism"],
  [/bank|insur|microfinance|sacco|finance|forex|accounting/, "Finance & insurance"],
  [/construct|hardware|real_?estate|architect|engineer|property|contractor/, "Construction & property"],
  [/transport|logistic|courier|moving|car_?rental|taxi|bus|truck/, "Transport & logistics"],
  [/software|computer|it_|internet|tech|electronics_?repair|digital/, "Technology"],
  [/lawyer|consult|agency|marketing|notary|accountant/, "Professional services"],
  [/import|export|trading/, "Trade & import/export"],
  [/energy|solar|mining|gas_?station|fuel|petrol/, "Energy & mining"],
  [/farm|agri|coop|dairy|veterin/, "Agriculture & food"],
  [/salon|beauty|spa|barber|cosmetic/, "Beauty & personal care"],
  [/store|shop|supermarket|market|wholesal|retail|boutique|mall/, "Wholesale & retail"],
];

/** Map a Google category / free text to a broad industry. Returns "Other" when unclear. */
export function classifyIndustry(category: string | null | undefined, name = ""): Industry {
  const s = `${category ?? ""} ${name}`.toLowerCase().replace(/\s+/g, "_");
  for (const [re, ind] of RULES) if (re.test(s)) return ind;
  return "Other";
}
