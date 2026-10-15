// Agency Overflow Work Finder (Feature B) — server-side assembly.
// The detection/matching itself is pure (`@/lib/partners`); this only loads the
// owner's evidence and saved assumptions to decide what must be offloaded.
import type { Database } from "@/integrations/supabase/types";
import { businessIndustry, type IntelBusiness } from "./business-intel";
import {
  DEFAULT_HOURS_BY_EFFORT,
  readFeasibilityAssumptions,
  type FeasibilityAssumptions,
} from "./feasibility";
import { detectOverflow, type OverflowItem, type OverflowReason } from "./partners";
import type { SupabaseDb } from "./rwanda-scan.server";
import type { Effort } from "./service-match";

export type OverflowCandidate = OverflowItem & {
  businessName: string | null;
  severity: string;
  hypothesis: boolean;
};

export type OverflowResult = {
  applied: boolean;
  candidates: OverflowCandidate[];
  error: string | null;
};

function isMissingTable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache") ||
    m.includes("relation")
  );
}

// Overflow candidates = open leaks the owner's saved capacity/skills cannot cover.
export async function computeOverflowCandidates(
  supabase: SupabaseDb,
  ownerId: string,
): Promise<OverflowResult> {
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("feasibility_defaults")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const assumptions: FeasibilityAssumptions = readFeasibilityAssumptions(
    prefs?.feasibility_defaults,
  );

  const { data: leaks, error } = await supabase
    .from("revenue_leaks")
    .select("id, business_id, label, severity, suggested_offer, effort, recurring, hypothesis")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .limit(2000);
  if (error) {
    return {
      applied: false,
      candidates: [],
      error: isMissingTable(error.message)
        ? "Migration 0012 (revenue_leaks) has not been applied yet."
        : error.message,
    };
  }

  const businessIds = [...new Set((leaks ?? []).map((l) => l.business_id))];
  type BizEntry = IntelBusiness & { district: string | null };
  const businesses = new Map<string, BizEntry>();
  if (businessIds.length) {
    const { data } = await supabase
      .from("businesses")
      .select("id, name, category, industry, district")
      .in("id", businessIds);
    for (const b of data ?? []) {
      businesses.set(b.id, {
        name: b.name,
        category: b.category,
        industry: b.industry,
        district: b.district,
      });
    }
  }

  const candidates: OverflowCandidate[] = [];
  for (const leak of leaks ?? []) {
    const biz = businesses.get(leak.business_id);
    const effort = (leak.effort as Effort | null) ?? "medium";
    const hours = DEFAULT_HOURS_BY_EFFORT[effort];
    const decision: { overflow: boolean; reasons: OverflowReason[] } = detectOverflow({
      assumptions,
      estimatedHours: hours,
    });
    if (!decision.overflow) continue;
    candidates.push({
      businessId: leak.business_id,
      leakId: leak.id,
      title: `${leak.label} — ${biz?.name ?? "lead"}`,
      service: leak.suggested_offer,
      problemLabel: leak.label,
      industry: biz ? businessIndustry(biz) : null,
      district: biz?.district ?? null,
      estimatedHours: hours,
      recurring: leak.recurring,
      reasons: decision.reasons,
      businessName: biz?.name ?? null,
      severity: leak.severity,
      hypothesis: leak.hypothesis,
    });
  }

  candidates.sort((a, b) => a.problemLabel.localeCompare(b.problemLabel));
  return { applied: true, candidates, error: null };
}

export type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];
export type HandoffRow = Database["public"]["Tables"]["partner_handoffs"]["Row"];
export type { OverflowItem };
