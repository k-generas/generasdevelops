// Source provenance + verification labels.
//
// Every material company fact must carry where it came from and how much we
// trust it. The two rules this module enforces:
//   1. AI output is never a verified fact on its own.
//   2. When sources disagree we preserve the conflict instead of silently
//      picking the convenient value.
export type VerificationStatus =
  | "officially_verified"
  | "multi_source"
  | "single_source"
  | "ai_inference"
  | "estimated"
  | "outdated"
  | "conflicting"
  | "unverified"
  | "unknown";

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  officially_verified: "Officially verified",
  multi_source: "Confirmed by multiple sources",
  single_source: "Reported by one source",
  ai_inference: "AI inference",
  estimated: "Estimated",
  outdated: "Outdated",
  conflicting: "Conflicting",
  unverified: "Unverified",
  unknown: "Unknown",
};

// Higher = more trustworthy for display/selection. AI is deliberately low.
const STATUS_RANK: Record<VerificationStatus, number> = {
  officially_verified: 9,
  multi_source: 8,
  single_source: 5,
  estimated: 3,
  ai_inference: 2,
  outdated: 2,
  conflicting: 1,
  unverified: 1,
  unknown: 0,
};

export type SourceType = "official" | "dataset" | "directory" | "website" | "map" | "ai" | "manual";
export type CollectionMethod =
  "api" | "dataset_download" | "website_scrape" | "map_search" | "ai" | "manual";

export type Provenance = {
  source: string;
  source_type: SourceType;
  method: CollectionMethod;
  url: string | null;
  first_seen_at: string;
  last_checked_at: string;
  last_verified_at: string | null;
  excerpt: string | null;
  confidence: number; // 0..1
  status: VerificationStatus;
};

// AI inference is never treated as a verified fact.
export function isFactual(status: VerificationStatus): boolean {
  return (
    status === "officially_verified" || status === "multi_source" || status === "single_source"
  );
}

export function statusRank(status: VerificationStatus): number {
  return STATUS_RANK[status] ?? 0;
}

export function bestStatus(statuses: VerificationStatus[]): VerificationStatus {
  if (statuses.length === 0) return "unknown";
  return statuses.reduce((best, s) => (statusRank(s) > statusRank(best) ? s : best));
}

// How long a given verification is considered fresh. AI/estimates expire fast.
export function freshnessMaxDays(status: VerificationStatus): number {
  switch (status) {
    case "officially_verified":
      return 365;
    case "multi_source":
      return 180;
    case "single_source":
      return 90;
    default:
      return 30;
  }
}

export function daysSince(iso: string, now: Date = new Date()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000)));
}

export function isProvenanceStale(p: Provenance, now: Date = new Date()): boolean {
  const ref = p.last_verified_at ?? p.last_checked_at;
  return daysSince(ref, now) > freshnessMaxDays(p.status);
}

// Deterministic key for a fact value so we can group agreeing sources.
function valueKey(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export type FactCandidate<T = unknown> = { value: T; provenance: Provenance };

export type MergedFact<T = unknown> = {
  value: T | null;
  status: VerificationStatus;
  confidence: number;
  conflicts: FactCandidate<T>[];
  sources: string[];
  stale: boolean;
};

// Merge all candidate values for one field. Agreement -> best status (multi_source
// when 2+ independent sources agree). Disagreement -> "conflicting" and every
// distinct value is preserved in `conflicts`; `value` becomes the best-supported
// one only for convenience and must not be shown as certain.
export function mergeFact<T>(
  candidates: FactCandidate<T>[],
  now: Date = new Date(),
): MergedFact<T> {
  if (candidates.length === 0) {
    return {
      value: null,
      status: "unknown",
      confidence: 0,
      conflicts: [],
      sources: [],
      stale: true,
    };
  }
  const groups = new Map<string, FactCandidate<T>[]>();
  for (const c of candidates) {
    const k = valueKey(c.value);
    const arr = groups.get(k) ?? [];
    arr.push(c);
    groups.set(k, arr);
  }
  const sources = [...new Set(candidates.map((c) => c.provenance.source))];
  const stale = candidates.every((c) => isProvenanceStale(c.provenance, now));

  if (groups.size > 1) {
    const confidence = Math.max(...candidates.map((c) => c.provenance.confidence)) * 0.6;
    return {
      value: null,
      status: "conflicting",
      confidence,
      conflicts: candidates,
      sources,
      stale,
    };
  }

  const agreeing = [...groups.values()][0]!;
  const statuses = agreeing.map((c) => c.provenance.status);
  const status =
    sources.length >= 2 ? bestStatus(["multi_source", ...statuses]) : bestStatus(statuses);
  const confidence = agreeing.reduce((a, c) => a + c.provenance.confidence, 0) / agreeing.length;
  return { value: agreeing[0]!.value, status, confidence, conflicts: [], sources, stale };
}
