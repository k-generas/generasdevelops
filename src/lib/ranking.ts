export type Opportunity = {
  id: string;
  evidence_count: number;
  evidence_freshness_days: number | null; // median/avg small
  fit: number; // 0-1 owner fit
  cost_to_validate: number; // dollars approx
  time_to_validate_hours: number;
  delivery_feas: number; // 0-1
  net_profit_est: number | null;
  confidence: number; // evidence-backed
};

export type Weights = {
  evidence: number;
  fit: number;
  feasibility: number;
  speed: number;
  margin: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  evidence: 0.25,
  fit: 0.25,
  feasibility: 0.15,
  speed: 0.2,
  margin: 0.15,
};

export function explainRank(o: Opportunity, w: Weights = DEFAULT_WEIGHTS) {
  const parts: string[] = [];
  if (o.evidence_count < 2) parts.push("Few evidence items");
  if (o.fit > 0.8) parts.push("Strong fit to skills/services");
  if (o.time_to_validate_hours < 4) parts.push("Quick to validate");
  if (o.cost_to_validate < 50) parts.push("Low validation cost");
  if ((o.net_profit_est ?? 0) > 300) parts.push("Good margin potential");
  return parts.join("; ") || "Needs more evidence to be sure";
}

export function rankScore(o: Opportunity, w: Weights = DEFAULT_WEIGHTS): number {
  const ev = Math.min(1, o.evidence_count / 5) * w.evidence;
  const fi = o.fit * w.fit;
  const fe = o.delivery_feas * w.feasibility;
  const sp = Math.max(0, 1 - Math.min(1, o.time_to_validate_hours / 8)) * w.speed;
  const mg =
    Math.max(0, (o.net_profit_est ?? 0) > 0 ? Math.min(1, (o.net_profit_est ?? 0) / 1000) : 0) *
    w.margin;
  const conf = o.confidence * 0.1; // small boost
  return Math.max(0, Math.min(1, ev + fi + fe + sp + mg + conf));
}
