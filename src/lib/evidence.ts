export type EvidenceItem = {
  source: string;
  url: string | null;
  observed_at: string;
  published_at: string | null;
  summary: string | null;
  confidence: number; // 0-1
  stale: boolean;
  freshness_days: number | null;
};

export function freshnessDays(observedAt: string, now: Date = new Date()): number {
  const t = Date.parse(observedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000)));
}

export function isStale(observedAt: string, maxDays: number, now: Date = new Date()): boolean {
  return freshnessDays(observedAt, now) > maxDays;
}

export function normalizeConfidence(c: unknown): number {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
