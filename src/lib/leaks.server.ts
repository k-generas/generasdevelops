// Revenue Leak Detector persistence (Feature A). Owner-scoped reads/writes; the
// detection itself is pure (`@/lib/revenue-leaks`). A re-scan refreshes evidence
// while preserving the owner's dismiss/resolve decision.
import type { Database } from "@/integrations/supabase/types";
import type { IntelFindings, WebsiteCheck } from "./business-intel";
import { dedupeLeaks, buildRevenueLeaks, type LeakStatus, type RevenueLeak } from "./revenue-leaks";
import type { SupabaseDb } from "./rwanda-scan.server";

export type RevenueLeakRow = Database["public"]["Tables"]["revenue_leaks"]["Row"];

export type RefreshLeaksResult = {
  applied: boolean;
  businesses: number;
  created: number;
  updated: number;
  error: string | null;
};

// The table is created by migration 0012. Until it is applied, callers should
// degrade gracefully rather than crash the page.
function isMissingTable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache") ||
    m.includes("relation")
  );
}

const MAX_BUSINESSES = 5000;

export async function refreshOwnerLeaks(
  supabase: SupabaseDb,
  ownerId: string,
): Promise<RefreshLeaksResult> {
  const { data: offers } = await supabase
    .from("offers")
    .select("name")
    .eq("owner_id", ownerId)
    .eq("active", true);
  const offerNames = (offers ?? []).map((o) => o.name);

  const { data: investigations } = await supabase
    .from("investigations")
    .select("business_id, findings, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(MAX_BUSINESSES);
  const latest = new Map<string, { findings: IntelFindings; created_at: string }>();
  for (const row of investigations ?? []) {
    if (!latest.has(row.business_id)) {
      latest.set(row.business_id, {
        findings: (row.findings ?? null) as IntelFindings,
        created_at: row.created_at,
      });
    }
  }

  const { data: businesses, error: bizError } = await supabase
    .from("businesses")
    .select(
      "id, name, category, website, industry, employees_min, employees_max, website_check, last_investigated_at",
    )
    .eq("owner_id", ownerId)
    .limit(MAX_BUSINESSES);
  if (bizError)
    return { applied: true, businesses: 0, created: 0, updated: 0, error: bizError.message };

  const { data: existingRows, error: existingError } = await supabase
    .from("revenue_leaks")
    .select("dedupe_key, status")
    .eq("owner_id", ownerId);
  if (existingError) {
    return {
      applied: false,
      businesses: 0,
      created: 0,
      updated: 0,
      error: isMissingTable(existingError.message)
        ? "Migration 0012 (revenue_leaks) has not been applied yet."
        : existingError.message,
    };
  }
  const existingStatus = new Map<string, LeakStatus>(
    (existingRows ?? []).map((r) => [r.dedupe_key, r.status as LeakStatus]),
  );

  const collected: RevenueLeak[] = [];
  for (const biz of businesses ?? []) {
    const inv = latest.get(biz.id);
    collected.push(
      ...buildRevenueLeaks({
        businessId: biz.id,
        intel: {
          business: {
            name: biz.name,
            category: biz.category,
            website: biz.website,
            industry: biz.industry,
            employees_min: biz.employees_min,
            employees_max: biz.employees_max,
          },
          findings: inv?.findings ?? null,
          websiteCheck: (biz.website_check ?? null) as WebsiteCheck,
          observedAt: inv?.created_at ?? biz.last_investigated_at ?? new Date().toISOString(),
        },
        offerNames,
      }),
    );
  }

  const leaks = dedupeLeaks(collected);
  const businessCount = (businesses ?? []).length;
  if (leaks.length === 0)
    return { applied: true, businesses: businessCount, created: 0, updated: 0, error: null };

  let created = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const rows = leaks.map((l) => {
    const prior = existingStatus.get(l.dedupeKey);
    if (prior) updated += 1;
    else created += 1;
    return {
      owner_id: ownerId,
      business_id: l.businessId,
      problem_key: l.problemKey,
      label: l.label,
      severity: l.severity,
      business_relevance: l.businessRelevance,
      confidence: l.confidence,
      source: l.source,
      evidence_url: l.evidenceUrl,
      observed_at: l.observedAt,
      limitation: l.limitation,
      suggested_offer: l.suggestedOffer,
      effort: l.effort,
      recurring: l.recurring,
      next_step: l.nextStep,
      hypothesis: l.hypothesis,
      status: prior ?? "open",
      dedupe_key: l.dedupeKey,
      updated_at: now,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("revenue_leaks")
      .upsert(rows.slice(i, i + 500), { onConflict: "owner_id,dedupe_key" });
    if (error)
      return { applied: true, businesses: businessCount, created, updated, error: error.message };
  }
  return { applied: true, businesses: businessCount, created, updated, error: null };
}

export async function setLeakStatus(
  supabase: SupabaseDb,
  ownerId: string,
  id: string,
  status: LeakStatus,
  note: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("revenue_leaks")
    .update({ status, status_note: note, reviewed_at: now, updated_at: now })
    .eq("owner_id", ownerId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
