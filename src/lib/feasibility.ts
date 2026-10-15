// Profit & Delivery Feasibility Engine (Feature F, spec §7).
//
// Pure, deterministic, and explicit about its assumptions. It never invents a
// probability: `winProbability` is only used when the caller supplies one, and
// "best/worst" are clearly-labelled scenario multipliers — not forecasts.
//
// Financial concepts are kept strictly separate (see `RevenueLedger`): potential
// opportunity value, proposed price, accepted contract value, invoiced amount,
// collected payments, refunds, direct costs, operating expenses and actual profit
// are never collapsed into one number.

import type { Effort } from "@/lib/service-match";

export type ScenarioName = "best" | "base" | "worst";

// Default one-off delivery hours by effort level. A rough planning input, not a
// measured value — the owner can override `estimatedHours` directly.
export const DEFAULT_HOURS_BY_EFFORT: Record<Effort, number> = {
  low: 6,
  medium: 20,
  high: 44,
};

export type FeasibilityAssumptions = {
  currency: string;
  // Revenue
  proposedPrice: number;
  // Effort
  estimatedHours: number;
  internalHourlyCost: number;
  // Direct + operating costs
  directCosts: number;
  acquisitionCost: number;
  monthlyOperatingCost: number;
  deliveryMonths: number;
  // Payment timing
  paymentTermsDays: number;
  // Recurring (0 = none)
  recurringMonthlyPrice: number;
  recurringMonthlyHours: number;
  recurringMonthlyCost: number;
  // Capacity
  availableHoursPerWeek: number;
  committedHoursPerWeek: number;
  // Risk / capability
  skillsDemonstrated: boolean;
  paymentTermsClear: boolean;
  // Optional, explicit uncertainty inputs
  availableCash?: number | undefined;
  effortRange?: { low: number; high: number } | undefined;
  revenueRange?: { low: number; high: number } | undefined;
  // Only set when supported by recorded evidence; otherwise leave null.
  winProbability?: number | null | undefined;
};

export type FeasibilityScenario = {
  name: ScenarioName;
  revenue: number;
  directCosts: number;
  effortCost: number;
  operatingCosts: number;
  totalCosts: number;
  netContribution: number;
  margin: number | null;
  hours: number;
  profitPerHour: number | null;
  timeToFirstPaymentDays: number;
};

export type RecurringFeasibility = {
  monthlyPrice: number;
  monthlyCost: number;
  monthlyHours: number;
  monthlyNet: number;
  monthlyMargin: number | null;
  annualNet: number;
};

export type CapacityCheck = {
  requiredHoursPerWeek: number;
  availableHoursPerWeek: number;
  committedHoursPerWeek: number;
  remainingHoursPerWeek: number;
  fits: boolean;
  shortfallHoursPerWeek: number;
};

export type FeasibilityResult = {
  currency: string;
  assumptions: FeasibilityAssumptions;
  scenarios: FeasibilityScenario[];
  base: FeasibilityScenario;
  best: FeasibilityScenario;
  worst: FeasibilityScenario;
  // Only present when a probability was supplied; otherwise null (unknown).
  expectedValue: number | null;
  recurring: RecurringFeasibility | null;
  capacity: CapacityCheck;
  flags: string[];
  reasons: string[];
};

const WEEKS_PER_MONTH = 4.33;
// Labelled scenario spread. Base uses the assumptions as given; best/worst widen
// hours and (optionally) revenue. These are planning bands, not predictions.
const BEST_HOURS_FACTOR = 0.85;
const WORST_HOURS_FACTOR = 1.25;
const BEST_REVENUE_FACTOR = 1.1;
const WORST_REVENUE_FACTOR = 0.9;

export function defaultFeasibilityAssumptions(): FeasibilityAssumptions {
  return {
    currency: "USD",
    proposedPrice: 0,
    estimatedHours: DEFAULT_HOURS_BY_EFFORT.medium,
    internalHourlyCost: 0,
    directCosts: 0,
    acquisitionCost: 0,
    monthlyOperatingCost: 0,
    deliveryMonths: 1,
    paymentTermsDays: 14,
    recurringMonthlyPrice: 0,
    recurringMonthlyHours: 0,
    recurringMonthlyCost: 0,
    availableHoursPerWeek: 20,
    committedHoursPerWeek: 0,
    skillsDemonstrated: true,
    paymentTermsClear: true,
    availableCash: undefined,
    effortRange: undefined,
    revenueRange: undefined,
    winProbability: null,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Defensive read of stored jsonb (e.g. user_preferences). Never throws.
export function readFeasibilityAssumptions(
  raw: unknown,
  defaults: FeasibilityAssumptions = defaultFeasibilityAssumptions(),
): FeasibilityAssumptions {
  if (!raw || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;
  const range = (v: unknown): { low: number; high: number } | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const r = v as Record<string, unknown>;
    const low = numOrNull(r["low"]);
    const high = numOrNull(r["high"]);
    if (low == null || high == null) return undefined;
    return { low, high };
  };
  return {
    currency:
      typeof o["currency"] === "string" && o["currency"] ? o["currency"] : defaults.currency,
    proposedPrice: num(o["proposedPrice"], defaults.proposedPrice),
    estimatedHours: num(o["estimatedHours"], defaults.estimatedHours),
    internalHourlyCost: num(o["internalHourlyCost"], defaults.internalHourlyCost),
    directCosts: num(o["directCosts"], defaults.directCosts),
    acquisitionCost: num(o["acquisitionCost"], defaults.acquisitionCost),
    monthlyOperatingCost: num(o["monthlyOperatingCost"], defaults.monthlyOperatingCost),
    deliveryMonths: num(o["deliveryMonths"], defaults.deliveryMonths),
    paymentTermsDays: num(o["paymentTermsDays"], defaults.paymentTermsDays),
    recurringMonthlyPrice: num(o["recurringMonthlyPrice"], defaults.recurringMonthlyPrice),
    recurringMonthlyHours: num(o["recurringMonthlyHours"], defaults.recurringMonthlyHours),
    recurringMonthlyCost: num(o["recurringMonthlyCost"], defaults.recurringMonthlyCost),
    availableHoursPerWeek: num(o["availableHoursPerWeek"], defaults.availableHoursPerWeek),
    committedHoursPerWeek: num(o["committedHoursPerWeek"], defaults.committedHoursPerWeek),
    skillsDemonstrated: bool(o["skillsDemonstrated"], defaults.skillsDemonstrated),
    paymentTermsClear: bool(o["paymentTermsClear"], defaults.paymentTermsClear),
    availableCash: numOrNull(o["availableCash"]) ?? undefined,
    effortRange: range(o["effortRange"]),
    revenueRange: range(o["revenueRange"]),
    winProbability: numOrNull(o["winProbability"]),
  };
}

function scenario(
  name: ScenarioName,
  a: FeasibilityAssumptions,
  hours: number,
  revenue: number,
): FeasibilityScenario {
  const effortCost = hours * a.internalHourlyCost;
  const operatingCosts = a.monthlyOperatingCost * Math.max(0, a.deliveryMonths);
  const totalCosts = a.directCosts + a.acquisitionCost + effortCost + operatingCosts;
  const netContribution = revenue - totalCosts;
  return {
    name,
    revenue,
    directCosts: a.directCosts + a.acquisitionCost,
    effortCost,
    operatingCosts,
    totalCosts,
    netContribution,
    margin: revenue > 0 ? netContribution / revenue : null,
    hours,
    profitPerHour: hours > 0 ? netContribution / hours : null,
    timeToFirstPaymentDays: Math.round(Math.max(0, a.deliveryMonths) * 30 + a.paymentTermsDays),
  };
}

export function computeCapacity(a: FeasibilityAssumptions): CapacityCheck {
  const deliveryWeeks = Math.max(1, a.deliveryMonths * WEEKS_PER_MONTH);
  const requiredHoursPerWeek = a.estimatedHours / deliveryWeeks;
  const remainingHoursPerWeek = a.availableHoursPerWeek - a.committedHoursPerWeek;
  const shortfallHoursPerWeek = Math.max(0, requiredHoursPerWeek - remainingHoursPerWeek);
  const fits =
    a.availableHoursPerWeek > 0 &&
    requiredHoursPerWeek <= a.availableHoursPerWeek - a.committedHoursPerWeek;
  return {
    requiredHoursPerWeek,
    availableHoursPerWeek: a.availableHoursPerWeek,
    committedHoursPerWeek: a.committedHoursPerWeek,
    remainingHoursPerWeek,
    fits,
    shortfallHoursPerWeek,
  };
}

export function computeRecurring(a: FeasibilityAssumptions): RecurringFeasibility | null {
  if (a.recurringMonthlyPrice <= 0) return null;
  const monthlyCost = a.recurringMonthlyCost + a.recurringMonthlyHours * a.internalHourlyCost;
  const monthlyNet = a.recurringMonthlyPrice - monthlyCost;
  return {
    monthlyPrice: a.recurringMonthlyPrice,
    monthlyCost,
    monthlyHours: a.recurringMonthlyHours,
    monthlyNet,
    monthlyMargin: monthlyNet / a.recurringMonthlyPrice,
    annualNet: monthlyNet * 12,
  };
}

export function computeFeasibility(a: FeasibilityAssumptions): FeasibilityResult {
  const bestHours = a.effortRange?.low ?? a.estimatedHours * BEST_HOURS_FACTOR;
  const worstHours = a.effortRange?.high ?? a.estimatedHours * WORST_HOURS_FACTOR;
  const bestRev = a.revenueRange?.high ?? a.proposedPrice * BEST_REVENUE_FACTOR;
  const worstRev = a.revenueRange?.low ?? a.proposedPrice * WORST_REVENUE_FACTOR;

  const base = scenario("base", a, a.estimatedHours, a.proposedPrice);
  const best = scenario("best", a, bestHours, bestRev);
  const worst = scenario("worst", a, worstHours, worstRev);
  const capacity = computeCapacity(a);
  const recurring = computeRecurring(a);
  const expectedValue = a.winProbability != null ? a.winProbability * base.netContribution : null;

  const flags: string[] = [];
  if (base.netContribution < 0) flags.push("Base case is a loss (costs exceed price).");
  if (worst.netContribution < 0 && base.netContribution >= 0)
    flags.push("Worst case is a loss — the margin is thin.");
  if (!capacity.fits) {
    flags.push(
      capacity.availableHoursPerWeek <= 0
        ? "No delivery capacity is set — cannot confirm this fits."
        : `Exceeds delivery capacity: needs ${capacity.requiredHoursPerWeek.toFixed(1)} h/week, ${capacity.remainingHoursPerWeek.toFixed(1)} h/week available.`,
    );
  }
  if (!a.paymentTermsClear) flags.push("Payment terms are unclear.");
  if (!a.skillsDemonstrated) flags.push("Requires skills not yet demonstrated.");
  if (a.availableCash != null && a.directCosts + a.acquisitionCost > a.availableCash)
    flags.push("Upfront costs exceed available cash.");
  if (a.winProbability == null)
    flags.push("Win probability is unknown (no evidence to estimate it).");
  if (recurring && recurring.monthlyNet < 0)
    flags.push("Recurring service is priced below its cost.");

  const reasons: string[] = [
    `Base case: ${base.hours.toFixed(0)} h at ${a.internalHourlyCost}/${a.currency} internal cost = ${base.effortCost.toFixed(2)} ${a.currency} effort; direct + acquisition ${base.directCosts.toFixed(2)}; operating ${base.operatingCosts.toFixed(2)}; net ${base.netContribution.toFixed(2)} ${a.currency}.`,
    "Best/worst widen hours by 0.85x/1.25x and price by 1.1x/0.9x unless explicit ranges are given.",
    `Time to first payment assumes ~30 days/month delivery lead time + ${a.paymentTermsDays} days payment terms.`,
  ];
  if (recurring)
    reasons.push(
      `Recurring ${recurring.monthlyPrice} ${a.currency}/month nets ${recurring.monthlyNet.toFixed(2)}/month (${recurring.annualNet.toFixed(2)}/year).`,
    );

  return {
    currency: a.currency,
    assumptions: a,
    scenarios: [best, base, worst],
    base,
    best,
    worst,
    expectedValue,
    recurring,
    capacity,
    flags,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Financial separation (spec §7 / §4). Keeps every money concept its own field
// so contracted, invoiced and collected amounts are never conflated.
// ---------------------------------------------------------------------------

export type RevenueLedger = {
  potentialValue: number | null;
  proposedPrice: number | null;
  acceptedValue: number | null;
  invoiced: number;
  collected: number;
  refunds: number;
  directCosts: number;
  operatingCosts: number;
};

export function emptyLedger(): RevenueLedger {
  return {
    potentialValue: null,
    proposedPrice: null,
    acceptedValue: null,
    invoiced: 0,
    collected: 0,
    refunds: 0,
    directCosts: 0,
    operatingCosts: 0,
  };
}

// Profit is only ever computed from collected cash minus refunds and costs —
// never from proposed or invoiced amounts.
export function actualProfit(l: RevenueLedger): number {
  return l.collected - l.refunds - l.directCosts - l.operatingCosts;
}

export function sumLedger(rows: RevenueLedger[]): RevenueLedger & { actualProfit: number } {
  const total = emptyLedger();
  for (const r of rows) {
    total.invoiced += r.invoiced;
    total.collected += r.collected;
    total.refunds += r.refunds;
    total.directCosts += r.directCosts;
    total.operatingCosts += r.operatingCosts;
  }
  return { ...total, actualProfit: actualProfit(total) };
}
