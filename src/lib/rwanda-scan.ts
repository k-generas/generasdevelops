// Rwanda scan presets for the existing Google Maps connector.
//
// Cost control is the whole point of this module: Maps is paid, so a "scan
// plan" is a bounded, deterministic, de-duplicated list of queries with an
// explicit cost estimate. Nothing here calls the network; it only decides what
// to ask for and how much it would cost, so the caller can enforce a budget.
import { DISTRICTS, PROVINCES, type IndustryKey, type Province } from "@/lib/rwanda";

export const MAX_RESULTS_PER_QUERY = 20; // Maps Text Search page size (paid).
export const MAX_QUERIES_PER_RUN = 10; // hard cap per run to bound spend.
export const COST_PER_QUERY_USD = 0.032; // configurable estimate; one text search.

// Human search terms (not the taxonomy labels) since we send these to Maps.
export const INDUSTRY_SEARCH_TERMS: Record<IndustryKey, string> = {
  manufacturing: "factories and manufacturing companies",
  wholesale_retail: "wholesale shops and distributors",
  agriculture: "agro-processing and farming companies",
  construction: "construction and engineering companies",
  transport: "transport and logistics companies",
  hospitality: "hotels and restaurants",
  health: "clinics and hospitals",
  education: "schools and training centres",
  finance: "banks and insurance companies",
  technology: "software and IT companies",
  professional: "consulting and professional services",
  trade: "import and export companies",
  energy_mining: "energy and mining companies",
  other: "businesses and companies",
};

export type ScanQuery = {
  query: string;
  location: string;
  industry: IndustryKey;
  province: Province;
  district: string | null;
};

export type ScanPlan = {
  queries: ScanQuery[];
  estimatedCostUsd: number;
  truncated: boolean; // true if the requested scope exceeded the cap
};

export type ScanScope =
  | { kind: "national" }
  | { kind: "provinces"; provinces: Province[] }
  | { kind: "districts"; districts: string[] };

function locationFor(province: Province, district: string | null): string {
  return district ? `${district}, ${province}` : province;
}

// Expand a scope into concrete (province, district) targets.
function targetsFor(scope: ScanScope): { province: Province; district: string | null }[] {
  if (scope.kind === "national") {
    return PROVINCES.map((p) => ({ province: p, district: null }));
  }
  if (scope.kind === "provinces") {
    return scope.provinces.map((p) => ({ province: p, district: null }));
  }
  const out: { province: Province; district: string | null }[] = [];
  for (const p of PROVINCES) {
    for (const d of DISTRICTS[p]) {
      if (scope.districts.includes(d)) out.push({ province: p, district: d });
    }
  }
  return out;
}

// Build a bounded, de-duplicated scan plan. Order is deterministic (scope order,
// then industry order) so runs are reproducible. Excess work is dropped and
// flagged via `truncated` rather than silently running a huge paid job.
export function buildScanPlan(
  input: { industries: IndustryKey[]; scope: ScanScope },
  maxQueries: number = MAX_QUERIES_PER_RUN,
): ScanPlan {
  const cap = Math.max(1, Math.min(maxQueries, MAX_QUERIES_PER_RUN));
  const targets = targetsFor(input.scope);
  const seen = new Set<string>();
  const queries: ScanQuery[] = [];
  let truncated = false;

  outer: for (const t of targets) {
    for (const industry of input.industries) {
      const query = INDUSTRY_SEARCH_TERMS[industry];
      const location = locationFor(t.province, t.district);
      const key = `${query}|${location}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (queries.length >= cap) {
        truncated = true;
        break outer;
      }
      queries.push({
        query,
        location,
        industry,
        province: t.province,
        district: t.district,
      });
    }
  }

  return {
    queries,
    estimatedCostUsd: Math.round(queries.length * COST_PER_QUERY_USD * 1000) / 1000,
    truncated,
  };
}

export function estimateScanCost(queryCount: number): number {
  return Math.round(Math.max(0, queryCount) * COST_PER_QUERY_USD * 1000) / 1000;
}

export function withinBudget(plan: ScanPlan, budgetUsd: number): boolean {
  return plan.estimatedCostUsd <= budgetUsd;
}
