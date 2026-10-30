// Enhanced evidence tracking for business intelligence
// All findings must be traceable with source, dates, status, confidence

export type EvidenceStatus = "OBSERVED" | "INFERRED" | "NEEDS_CONFIRMATION" | "NOT_TESTED" | "INACCESSIBLE";
export type ConfidenceLevel = "low" | "medium" | "high";

export type EvidenceRecord = {
  id: string;
  business_id: string;
  finding: string;
  source: string;
  source_url: string | null;
  discovered_at: string;
  last_checked_at: string;
  status: EvidenceStatus;
  confidence: number; // 0-1
  confidence_level: ConfidenceLevel;
  research_method: string;
  related_to: string | null; // sub-finding/category
  verification_history: VerificationEntry[];
  metadata: Record<string, unknown>;
};

export type VerificationEntry = {
  checked_at: string;
  method: string;
  status: EvidenceStatus;
  notes: string | null;
  verifier: string;
};

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

export function computeConfidence(params: {
  evidenceQuality: number; // 0-1
  sourceReliability: number; // 0-1
  identityCertainty: number; // 0-1
  freshness: number; // 0-1
  coverage: number; // 0-1
}): number {
  const { evidenceQuality, sourceReliability, identityCertainty, freshness, coverage } = params;
  const score = 
    evidenceQuality * 0.3 +
    sourceReliability * 0.25 +
    identityCertainty * 0.25 +
    freshness * 0.1 +
    coverage * 0.1;
  return Math.max(0, Math.min(1, score));
}

export function isFresh(lastChecked: string, maxAgeDays = 30): boolean {
  const checked = new Date(lastChecked).getTime();
  const now = Date.now();
  const days = (now - checked) / (1000 * 60 * 60 * 24);
  return days <= maxAgeDays;
}

export function createEvidenceId(): string {
  return `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
