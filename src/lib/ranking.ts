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

// ---------------------------------------------------------------------------
// Extended Rwanda opportunity ranking (spec §8).
//
// Adds the remaining factors while keeping two ideas strictly separate:
//   - `priority`   : how attractive this opportunity is to act on now.
//   - `confidence` : how well-supported the underlying facts are.
// A high-priority lead with weak evidence is surfaced, but flagged as needing
// verification. Size/fame/hiring are intentionally NOT inputs, per spec §8.
// Optional factor fields default to a neutral 0.5 so an unmeasured factor never
// silently favours or punishes a business.
export type ExtraFactors = {
  signal_strength?: number; // 0..1 strength + freshness of buying signals
  affordability?: number; // 0..1 evidence-based ability + willingness to pay
  contactability?: number; // 0..1 ease of reaching an appropriate contact
  recurring?: number; // 0..1 potential for recurring work
  competition?: number; // 0..1 higher = more competitive
  accessibility?: number; // 0..1 geographic / delivery accessibility
  risk?: number; // 0..1 higher = more legal / operational / reputational risk
};

export type RankedOpportunity = Opportunity & ExtraFactors;

export type FullWeights = Weights & {
  signals: number;
  affordability: number;
  contactability: number;
  recurring: number;
  competition: number;
  accessibility: number;
  risk: number;
};

export const DEFAULT_FULL_WEIGHTS: FullWeights = {
  evidence: 0.14,
  fit: 0.14,
  feasibility: 0.08,
  speed: 0.08,
  margin: 0.08,
  signals: 0.12,
  affordability: 0.1,
  contactability: 0.06,
  recurring: 0.06,
  competition: 0.05,
  accessibility: 0.05,
  risk: 0.04,
};

export type FactorContribution = {
  name: string;
  value: number; // 0..1 "goodness" after any inversion
  weight: number;
  contribution: number; // value * weight
};

export type RankedResult = {
  priority: number; // 0..1
  confidence: number; // 0..1, independent of priority
  needsVerification: boolean;
  factors: FactorContribution[];
  reasons: string[];
};

const NEUTRAL = 0.5;

function goodness(name: keyof FullWeights, o: RankedOpportunity): number {
  switch (name) {
    case "evidence":
      return Math.min(1, o.evidence_count / 5);
    case "fit":
      return clamp01(o.fit);
    case "feasibility":
      return clamp01(o.delivery_feas);
    case "speed":
      return 1 - Math.min(1, o.time_to_validate_hours / 8);
    case "margin":
      return (o.net_profit_est ?? 0) > 0 ? Math.min(1, (o.net_profit_est ?? 0) / 1000) : 0;
    case "signals":
      return o.signal_strength ?? NEUTRAL;
    case "affordability":
      return o.affordability ?? NEUTRAL;
    case "contactability":
      return o.contactability ?? NEUTRAL;
    case "recurring":
      return o.recurring ?? 0;
    case "competition":
      return 1 - (o.competition ?? NEUTRAL); // more competition = worse
    case "accessibility":
      return o.accessibility ?? NEUTRAL;
    case "risk":
      return 1 - (o.risk ?? NEUTRAL); // more risk = worse
    default:
      return NEUTRAL;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const FACTOR_NAMES: (keyof FullWeights)[] = [
  "evidence",
  "fit",
  "feasibility",
  "speed",
  "margin",
  "signals",
  "affordability",
  "contactability",
  "recurring",
  "competition",
  "accessibility",
  "risk",
];

export function rankOpportunity(
  o: RankedOpportunity,
  w: FullWeights = DEFAULT_FULL_WEIGHTS,
): RankedResult {
  const factors: FactorContribution[] = FACTOR_NAMES.map((name) => {
    const value = clamp01(goodness(name, o));
    const weight = w[name];
    return { name, value, weight, contribution: value * weight };
  });

  const priority = clamp01(factors.reduce((sum, f) => sum + f.contribution, 0));
  const confidence = clamp01(o.confidence);

  const reasons = buildReasons(o, factors);
  const needsVerification = confidence < 0.6;

  return { priority, confidence, needsVerification, factors, reasons };
}

function buildReasons(o: RankedOpportunity, factors: FactorContribution[]): string[] {
  const reasons: string[] = [];
  const get = (n: keyof FullWeights) => factors.find((f) => f.name === n)!.value;

  if (o.evidence_count < 2) reasons.push("Few evidence items — verify before acting.");
  if (o.fit > 0.8) reasons.push("Strong fit to your actual services.");
  if (get("signals") > 0.7) reasons.push("Strong, fresh buying signal.");
  else if (get("signals") < 0.35) reasons.push("Weak or stale buying signal.");
  if (get("affordability") > 0.7) reasons.push("Evidence suggests ability to pay.");
  if (o.recurring != null && o.recurring > 0.6) reasons.push("Good potential for recurring work.");
  if (o.competition != null && o.competition > 0.6) reasons.push("High competitive pressure.");
  if (o.risk != null && o.risk > 0.6) reasons.push("Elevated legal/operational/reputational risk.");
  if (get("accessibility") < 0.35) reasons.push("Geographic or delivery access is difficult.");
  if (get("contactability") < 0.35) reasons.push("No clear way to reach a decision-maker yet.");
  if ((o.net_profit_est ?? 0) > 300) reasons.push("Good margin potential.");
  return reasons;
}

// Sort comparator: highest priority first, then highest factual confidence.
export function compareRanked(a: RankedResult, b: RankedResult): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return b.confidence - a.confidence;
}

// Configurable owner preferences (spec §8). These only shift factor WEIGHTS; the
// per-business evidence is never changed by a preference.
export type RankingPreferences = {
  remote?: boolean;
  lowStartup?: boolean;
  localOnly?: boolean;
  onlineDelivery?: boolean;
};

export function weightsFromPreferences(
  prefs: RankingPreferences,
  base: FullWeights = DEFAULT_FULL_WEIGHTS,
): FullWeights {
  const w: FullWeights = { ...base };
  if (prefs.remote || prefs.onlineDelivery) {
    w.accessibility *= 0.5; // location matters less for remote/online work
    w.contactability *= 1.2;
  }
  if (prefs.localOnly) w.accessibility *= 1.5;
  if (prefs.lowStartup) {
    w.feasibility *= 1.3;
    w.speed *= 1.1;
  }
  const total = FACTOR_NAMES.reduce((sum, n) => sum + w[n], 0);
  if (total > 0) for (const n of FACTOR_NAMES) w[n] = w[n] / total;
  return w;
}
