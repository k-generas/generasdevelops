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
