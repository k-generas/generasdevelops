export type ValidationPlan = {
  hypothesis: string;
  target: string;
  evidence: string[];
  missing: string[];
  cheapest_method: string;
  cost_usd: number;
  time_hours: number;
  success: string;
  fail: string;
  next_date: string;
  outcome: "pending" | "pass" | "fail" | "skip";
};

export function defaultPlan(hyp: string): ValidationPlan {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return {
    hypothesis: hyp,
    target: "Ideal customer",
    evidence: [],
    missing: ["Proof of demand"],
    cheapest_method: "Customer interview (5 calls)",
    cost_usd: 0,
    time_hours: 3,
    success: ">=3 say yes and share contact/email",
    fail: "<3 say yes after 5 attempts",
    next_date: d.toISOString().slice(0, 10),
    outcome: "pending",
  };
}

export function canValidate(p: ValidationPlan): boolean {
  return p.cost_usd <= 50 && p.time_hours <= 8;
}

// Safely read a stored validation_plan (jsonb is unknown). Anything malformed
// falls back to the provided defaults so the UI never crashes on old data.
export function readPlan(x: unknown, fallbackHypothesis: string): ValidationPlan {
  const base = defaultPlan(fallbackHypothesis);
  if (!x || typeof x !== "object" || Array.isArray(x)) return base;
  const o = x as Record<string, unknown>;
  const str = (k: string, d: string) => (typeof o[k] === "string" ? (o[k] as string) : d);
  const num = (k: string, d: number) =>
    typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : d;
  const arr = (k: string) =>
    Array.isArray(o[k])
      ? (o[k] as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
  const oc = o["outcome"];
  const outcome: ValidationPlan["outcome"] =
    oc === "pass" || oc === "fail" || oc === "skip" || oc === "pending" ? oc : "pending";
  return {
    hypothesis: str("hypothesis", base.hypothesis),
    target: str("target", base.target),
    evidence: arr("evidence"),
    missing: arr("missing"),
    cheapest_method: str("cheapest_method", base.cheapest_method),
    cost_usd: num("cost_usd", base.cost_usd),
    time_hours: num("time_hours", base.time_hours),
    success: str("success", base.success),
    fail: str("fail", base.fail),
    next_date: str("next_date", base.next_date),
    outcome,
  };
}
