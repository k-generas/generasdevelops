// Buyer Intent board (Feature D) — server-side assembly.
// The scoring itself is pure (`@/lib/intent`); this only loads the owner's
// recorded evidence and hands it to the scorer.
import {
  computeBuyerIntent,
  toActivityEvent,
  type BuyerIntent,
  type IntentSignals,
} from "./intent";
import type { SupabaseDb } from "./rwanda-scan.server";

export type IntentBoardRow = BuyerIntent & {
  name: string;
  industry: string | null;
  district: string | null;
  website: string | null;
};

export async function computeIntentBoard(
  supabase: SupabaseDb,
  ownerId: string,
  now: Date = new Date(),
): Promise<{ rows: IntentBoardRow[]; applied: boolean; error: string | null }> {
  const { data: businesses, error } = await supabase
    .from("businesses")
    .select(
      "id, name, industry, district, website, business_status, reviews_last_90d, last_activity_at",
    )
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) {
    return { rows: [], applied: false, error: error.message };
  }

  const ids = (businesses ?? []).map((b) => b.id);

  // Open leaks = measured fit. Missing migration 0012 is tolerated (treated as 0).
  const leakCount = new Map<string, number>();
  const recurringFit = new Set<string>();
  if (ids.length) {
    const { data: leaks, error: leakErr } = await supabase
      .from("revenue_leaks")
      .select("business_id, recurring")
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .in("business_id", ids)
      .limit(5000);
    if (!leakErr) {
      for (const l of leaks ?? []) {
        leakCount.set(l.business_id, (leakCount.get(l.business_id) ?? 0) + 1);
        if (l.recurring) recurringFit.add(l.business_id);
      }
    }
  }

  // External company events (hiring/expansion/tender). May be empty or absent.
  const eventsByBiz = new Map<string, ReturnType<typeof toActivityEvent>[]>();
  if (ids.length) {
    const { data: events, error: evErr } = await supabase
      .from("company_events")
      .select(
        "business_id, dedupe_key, event_kind, title, first_seen_at, last_seen_at, source_date, status, source_id, source_url",
      )
      .eq("owner_id", ownerId)
      .in("business_id", ids)
      .limit(5000);
    if (!evErr) {
      for (const e of events ?? []) {
        if (!e.business_id) continue;
        const list = eventsByBiz.get(e.business_id) ?? [];
        list.push(toActivityEvent(e));
        eventsByBiz.set(e.business_id, list);
      }
    }
  }

  // Businesses already in the pipeline (any proposal recorded).
  const inPipeline = new Set<string>();
  if (ids.length) {
    const { data: proposals } = await supabase
      .from("proposals")
      .select("business_id")
      .eq("owner_id", ownerId)
      .in("business_id", ids)
      .limit(5000);
    for (const p of proposals ?? []) inPipeline.add(p.business_id);
  }

  const rows: IntentBoardRow[] = (businesses ?? []).map((b) => {
    const signals: IntentSignals = {
      businessId: b.id,
      name: b.name,
      industry: b.industry,
      district: b.district,
      website: b.website,
      businessStatus: b.business_status,
      reviewsLast90d: b.reviews_last_90d,
      lastActivityAt: b.last_activity_at,
      events: eventsByBiz.get(b.id) ?? [],
      openLeaks: leakCount.get(b.id) ?? 0,
      recurringFit: recurringFit.has(b.id),
      inPipeline: inPipeline.has(b.id),
    };
    const intent = computeBuyerIntent(signals, now);
    return {
      ...intent,
      name: b.name,
      industry: b.industry,
      district: b.district,
      website: b.website,
    };
  });

  return { rows, applied: true, error: null };
}
