// Revenue Leak Detector (Feature A, spec §1).
//
// A "revenue leak" is a concrete, evidence-backed gap in a business's public
// presence that the owner's services could close — the kind of thing that can
// cost a business customers. It is NEVER a claim of money already lost: every
// leak carries its evidence, an explicit limitation, and (when weak) is marked a
// hypothesis. The list is built only from things that were actually observed.
import {
  businessIndustry,
  companySize,
  deriveObservedProblems,
  type IntelInput,
} from "@/lib/business-intel";
import {
  buildServiceCatalog,
  PROBLEM_KEYS,
  type CompanySize,
  type Effort,
  type Severity,
} from "@/lib/service-match";
import { industryLabel, type IndustryKey } from "@/lib/rwanda";

export type LeakStatus = "open" | "dismissed" | "resolved";

export type RevenueLeak = {
  dedupeKey: string;
  businessId: string;
  problemKey: string;
  label: string;
  severity: Severity;
  businessRelevance: string;
  confidence: number;
  source: string;
  evidenceUrl: string | null;
  observedAt: string;
  limitation: string;
  suggestedOffer: string | null;
  effort: Effort | null;
  recurring: boolean;
  nextStep: string;
  hypothesis: boolean;
  status: LeakStatus;
};

// Displayed alongside any detected leak. The detector reports gaps, not losses.
export const REVENUE_LEAK_RULE =
  "A detected gap is evidence of a problem, not proof of lost revenue. Never state a specific amount lost without measured evidence.";

const SIZE_LABEL: Record<CompanySize, string> = {
  micro: "a micro business",
  small: "a small business",
  medium: "a mid-sized company",
  large: "a large organisation",
  unknown: "a business of unknown size",
};

const LIMITATIONS: Record<string, string> = {
  [PROBLEM_KEYS.noWebsite]:
    "Only the public web presence was checked; the business may rely on social media or word of mouth.",
  [PROBLEM_KEYS.slowSite]:
    "Load time is a single measurement and can vary with network conditions.",
  [PROBLEM_KEYS.notMobile]:
    "Based on the presence of a viewport meta tag only; the layout was not visually reviewed.",
  [PROBLEM_KEYS.outdatedContent]:
    "A stale copyright year is a hint, not proof the rest of the content is untouched.",
  [PROBLEM_KEYS.noContactChannel]:
    "Contact links may exist without being detectable in the fetched HTML.",
  [PROBLEM_KEYS.noBooking]:
    "Absence of a detected booking or shop widget does not prove orders cannot be placed another way.",
  [PROBLEM_KEYS.manualProcess]:
    "Not directly measured; treat as an unconfirmed hypothesis until the workflow is confirmed.",
  [PROBLEM_KEYS.leadFollowup]:
    "Not directly measured; treat as an unconfirmed hypothesis until follow-up is confirmed.",
  [PROBLEM_KEYS.noReporting]:
    "Not directly measured; treat as an unconfirmed hypothesis until reporting needs are confirmed.",
};

function limitationFor(problemKey: string): string {
  return (
    LIMITATIONS[problemKey] ??
    "Evidence is limited to what was collected; no monetary loss is claimed."
  );
}

function nextStepFor(label: string, offer: string | null): string {
  if (offer) {
    return `Send a short, evidence-based message naming the issue ("${label.toLowerCase()}") and offer ${offer}.`;
  }
  return `No active offer addresses this yet — consider one, or verify the issue before reaching out.`;
}

export function businessRelevanceFor(industry: IndustryKey | null, size: CompanySize): string {
  const who = SIZE_LABEL[size];
  return industry ? `${who} in ${industryLabel(industry)}` : `${who} (industry unknown)`;
}

export type BuildLeaksInput = {
  businessId: string;
  intel: IntelInput;
  offerNames: string[];
  now?: Date;
};

// Build the leaks for one business from its recorded evidence. Each observed
// problem becomes one leak; when an owner offer addresses it, that offer and its
// effort/recurring profile are attached.
export function buildRevenueLeaks(input: BuildLeaksInput): RevenueLeak[] {
  const problems = deriveObservedProblems(input.intel);
  if (problems.length === 0) return [];

  const catalog = buildServiceCatalog(input.offerNames);
  const industry = businessIndustry(input.intel.business);
  const size = companySize(input.intel.business);
  const relevance = businessRelevanceFor(industry, size);
  const evidenceUrl = input.intel.findings?.url ?? null;

  return problems.map((p) => {
    const def = catalog.find((d) => d.addresses.includes(p.key)) ?? null;
    return {
      dedupeKey: `${input.businessId}:${p.key}`,
      businessId: input.businessId,
      problemKey: p.key,
      label: p.label,
      severity: p.severity,
      businessRelevance: relevance,
      confidence: p.confidence,
      source: p.source,
      evidenceUrl,
      observedAt: p.observed_at,
      limitation: limitationFor(p.key),
      suggestedOffer: def?.offer ?? null,
      effort: def?.effort ?? null,
      recurring: def?.recurring ?? false,
      nextStep: nextStepFor(p.label, def?.offer ?? null),
      hypothesis: p.confidence < 0.6,
      status: "open",
    };
  });
}

// Collapse duplicates (same business + problem), keeping the strongest signal.
export function dedupeLeaks(leaks: RevenueLeak[]): RevenueLeak[] {
  const byKey = new Map<string, RevenueLeak>();
  for (const leak of leaks) {
    const existing = byKey.get(leak.dedupeKey);
    if (!existing || leak.confidence > existing.confidence) byKey.set(leak.dedupeKey, leak);
  }
  return [...byKey.values()];
}

// Preserve the owner's review decision across re-scans: a dismissed/resolved
// leak stays that way when refreshed; new leaks start open.
export function mergeLeakStatus(
  incoming: RevenueLeak,
  existing: { status: LeakStatus } | null,
): RevenueLeak {
  return { ...incoming, status: existing?.status ?? "open" };
}

export type LeakSummary = {
  total: number;
  open: number;
  dismissed: number;
  resolved: number;
  actionable: number;
  bySeverity: Record<Severity, number>;
};

// A leak is actionable only when it is open and not a bare hypothesis.
export function isActionable(leak: RevenueLeak): boolean {
  return leak.status === "open" && !leak.hypothesis;
}

export function summarizeLeaks(leaks: RevenueLeak[]): LeakSummary {
  const summary: LeakSummary = {
    total: leaks.length,
    open: 0,
    dismissed: 0,
    resolved: 0,
    actionable: 0,
    bySeverity: { low: 0, medium: 0, high: 0 },
  };
  for (const leak of leaks) {
    summary[leak.status] += 1;
    summary.bySeverity[leak.severity] += 1;
    if (isActionable(leak)) summary.actionable += 1;
  }
  return summary;
}
