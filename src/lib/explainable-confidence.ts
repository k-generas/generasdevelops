// Make confidence scores explainable
export type ConfidenceBreakdown = {
  score: number; // 0-1
  level: "low" | "medium" | "high";
  factors: {
    evidenceQuality: { score: number; explanation: string };
    sourceReliability: { score: number; explanation: string };
    identityCertainty: { score: number; explanation: string };
    freshness: { score: number; explanation: string };
    coverage: { score: number; explanation: string };
  };
  warnings: string[];
  disclaimer: string;
};

export function explainConfidence(params: {
  evidenceCount: number;
  observedCount: number;
  inferredCount: number;
  confirmedSources: number;
  identityVerified: boolean;
  lastChecked: string;
  checksPerformed: number;
  checksApplicable: number;
}): ConfidenceBreakdown {
  const { evidenceCount, observedCount, inferredCount, confirmedSources, identityVerified, lastChecked, checksPerformed, checksApplicable } = params;
  
  const evidenceQuality = evidenceCount > 0 ? (observedCount / evidenceCount) * 0.7 + Math.min(1, evidenceCount / 5) * 0.3 : 0;
  const sourceReliability = confirmedSources > 0 ? Math.min(1, confirmedSources / 3) : 0.3;
  const identityCertainty = identityVerified ? 1 : 0.4;
  
  const daysSince = (Date.now() - new Date(lastChecked).getTime()) / (1000 * 60 * 60 * 24);
  const freshness = daysSince <= 7 ? 1 : daysSince <= 30 ? 0.7 : daysSince <= 90 ? 0.4 : 0.2;
  
  const coverage = checksApplicable > 0 ? checksPerformed / checksApplicable : 0;
  
  const score = evidenceQuality * 0.3 + sourceReliability * 0.25 + identityCertainty * 0.25 + freshness * 0.1 + coverage * 0.1;
  const clamped = Math.max(0, Math.min(1, score));
  
  const level = clamped >= 0.8 ? "high" : clamped >= 0.5 ? "medium" : "low";
  
  const warnings: string[] = [];
  if (inferredCount > observedCount) warnings.push("More inferred than observed findings");
  if (daysSince > 30) warnings.push("Evidence is stale");
  if (coverage < 0.5) warnings.push("Limited research coverage");
  if (!identityVerified) warnings.push("Identity not fully verified");
  
  return {
    score: clamped,
    level,
    factors: {
      evidenceQuality: { score: evidenceQuality, explanation: `${observedCount}/${evidenceCount} observed findings` },
      sourceReliability: { score: sourceReliability, explanation: `${confirmedSources} confirmed sources` },
      identityCertainty: { score: identityCertainty, explanation: identityVerified ? "Identity verified" : "Identity uncertain" },
      freshness: { score: freshness, explanation: `${Math.round(daysSince)} days since last check` },
      coverage: { score: coverage, explanation: `${checksPerformed}/${checksApplicable} checks performed` },
    },
    warnings,
    disclaimer: "This is a computed confidence score based on evidence quality - it does not represent independent verification of all claims."
  };
}
