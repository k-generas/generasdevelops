// Buyer Intent board (Feature D).
//
// Intent is INFERRED from recorded evidence — measured gaps, review recency,
// activity/hiring signals and pipeline stage. It is never a statement of fact
// about what a buyer wants or will do. Every score carries its reasons, its
// uncertainties and an explicit limitation.
import {
  HIRING_DISCLAIMER,
  isHiringKind,
  signalStrength,
  type ActivityEvent,
  type ActivityKind,
  type ActivityStatus,
} from "@/lib/activity";
import { daysSince } from "@/lib/provenance";

export type IntentTier = "hot" | "warm" | "cool" | "cold" | "unknown";

export const INTENT_TIERS: IntentTier[] = ["hot", "warm", "cool", "cold", "unknown"];

export const INTENT_DISCLAIMER =
  "Intent is inferred from recorded signals and is a prompt to look closer, not proof that a buyer has budget or plans to purchase.";

export type IntentSignals = {
  businessId: string;
  name: string;
  industry: string | null;
  district: string | null;
  website: string | null;
  businessStatus: string | null;
  reviewsLast90d: number | null;
  lastActivityAt: string | null;
  /** Events recorded for the business (may be empty). */
  events: ActivityEvent[];
  /** Open, non-hypothesis revenue leaks (measured fit). */
  openLeaks: number;
  /** True when at least one open leak maps to a recurring offer. */
  recurringFit: boolean;
  /** The business already has a proposal/order in the pipeline. */
  inPipeline: boolean;
};

export type BuyerIntent = {
  businessId: string;
  score: number; // 0..1
  tier: IntentTier;
  reasons: string[];
  uncertainties: string[];
  limitation: string;
  hiringSignal: boolean;
};

const TIER_ORDER: Record<IntentTier, number> = { hot: 0, warm: 1, cool: 2, cold: 3, unknown: 4 };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function recencyFactor(lastActivityAt: string | null, now: Date): { score: number; note?: string } {
  if (!lastActivityAt) return { score: 0.3 };
  const d = daysSince(lastActivityAt, now);
  if (!Number.isFinite(d)) return { score: 0.3 };
  if (d <= 30) return { score: 0.9, note: `Last recorded activity ${d} day(s) ago.` };
  if (d <= 90) return { score: 0.65, note: `Last recorded activity ${d} days ago.` };
  if (d <= 180) return { score: 0.4, note: `Activity is getting old (${d} days).` };
  return { score: 0.15, note: `No recorded activity for ${d} days.` };
}

export function computeBuyerIntent(s: IntentSignals, now: Date = new Date()): BuyerIntent {
  const reasons: string[] = [];
  const uncertainties: string[] = [];

  if (s.businessStatus === "CLOSED_PERMANENTLY") {
    return {
      businessId: s.businessId,
      score: 0,
      tier: "cold",
      reasons: ["Google reports this business as permanently closed."],
      uncertainties: [],
      limitation: "A closed business is not a live opportunity.",
      hiringSignal: false,
    };
  }

  // Fit from measured gaps is the strongest honest driver.
  const fit = clamp01(s.openLeaks === 0 ? 0.2 : 0.5 + Math.min(s.openLeaks, 4) * 0.1);
  if (s.openLeaks > 0) {
    reasons.push(
      `${s.openLeaks} open measured gap${s.openLeaks === 1 ? "" : "s"} your offers address.`,
    );
  } else {
    uncertainties.push("No measured gap recorded yet — fit is unconfirmed.");
  }
  if (s.recurringFit) reasons.push("A gap maps to a recurring offer.");

  // Activity recency.
  const rec = recencyFactor(s.lastActivityAt, now);
  if (rec.note) reasons.push(rec.note);
  if (s.reviewsLast90d != null) {
    if (s.reviewsLast90d > 0)
      reasons.push(`${s.reviewsLast90d} Google review(s) in the last 90 days.`);
    else uncertainties.push("No Google reviews in the last 90 days — may be dormant.");
  }

  // Activity / hiring events.
  let hiringSignal = false;
  let eventScore = 0;
  for (const e of s.events) {
    if (e.status !== "active") continue;
    const strength = signalStrength(e, now);
    const contribution = strength === "strong" ? 0.25 : strength === "medium" ? 0.12 : 0.04;
    eventScore += contribution;
    if (isHiringKind(e.kind)) hiringSignal = true;
  }
  eventScore = Math.min(0.3, eventScore);
  if (eventScore > 0) reasons.push("Recent recorded business activity signals.");

  const pipeline = s.inPipeline ? 0.8 : 0;

  // Weighted blend; gaps and pipeline dominate, activity shades it.
  const score = clamp01(fit * 0.5 + rec.score * 0.25 + eventScore + pipeline * 0.35);

  if (hiringSignal) uncertainties.push(HIRING_DISCLAIMER);

  let tier: IntentTier;
  if (s.openLeaks === 0 && !s.inPipeline && !s.lastActivityAt) tier = "unknown";
  else if (score >= 0.75) tier = "hot";
  else if (score >= 0.55) tier = "warm";
  else if (score >= 0.35) tier = "cool";
  else tier = "cold";

  return {
    businessId: s.businessId,
    score,
    tier,
    reasons,
    uncertainties,
    limitation:
      "Intent is inferred from recorded signals only; it does not prove budget, authority or a purchase plan.",
    hiringSignal,
  };
}

export function rankByIntent(items: BuyerIntent[]): BuyerIntent[] {
  return [...items].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.score - a.score);
}

export type IntentCounts = Record<IntentTier, number>;

export function summarizeIntent(items: BuyerIntent[]): IntentCounts {
  const counts: IntentCounts = { hot: 0, warm: 0, cool: 0, cold: 0, unknown: 0 };
  for (const i of items) counts[i.tier] += 1;
  return counts;
}

// Convenience for the server: build an ActivityEvent-shaped object from a stored
// company_events / business_activity_events row.
export type StoredEventLike = {
  dedupe_key?: string | null;
  event_kind?: string | null;
  title?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  source_date?: string | null;
  status?: string | null;
  source_id?: string | null;
  source_url?: string | null;
};

export function toActivityEvent(row: StoredEventLike): ActivityEvent {
  const last = row.last_seen_at ?? row.first_seen_at ?? new Date().toISOString();
  return {
    key: row.dedupe_key ?? `${row.event_kind ?? "event"}:${row.title ?? ""}:${last}`,
    kind: (row.event_kind as ActivityKind) ?? "change",
    title: row.title ?? "Activity",
    first_seen_at: row.first_seen_at ?? last,
    last_seen_at: last,
    source_date: row.source_date ?? null,
    status: (row.status as ActivityStatus) ?? "unverified",
    source_id: row.source_id ?? null,
    url: row.source_url ?? null,
    confidence: 0.6,
  };
}
