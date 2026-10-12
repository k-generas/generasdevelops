// Company activity + hiring monitoring (spec §6).
//
// Rules this module encodes:
//   - Statuses are explicit: active / closed / expired / removed / unverified /
//     unknown. We never infer "closed" from a failed scan.
//   - A newly discovered OLD listing is not a new signal. We separate the two.
//   - A hiring/activity signal is a signal, not proof of budget or intent.
import { daysSince } from "@/lib/provenance";

export type ActivityStatus = "active" | "closed" | "expired" | "removed" | "unverified" | "unknown";

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  active: "Active",
  closed: "Closed",
  expired: "Expired",
  removed: "Removed",
  unverified: "Unverified",
  unknown: "Unknown",
};

export type ActivityKind =
  | "vacancy"
  | "repeated_recruitment"
  | "new_branch"
  | "expansion"
  | "new_product"
  | "new_contract"
  | "tender"
  | "investment"
  | "change";

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  vacancy: "Job vacancy",
  repeated_recruitment: "Repeated recruitment",
  new_branch: "New branch or facility",
  expansion: "Expansion",
  new_product: "New product or service",
  new_contract: "New contract or partnership",
  tender: "Public tender",
  investment: "Investment",
  change: "Change in services/pricing/location",
};

export type ActivityEvent = {
  key: string; // stable dedupe key so the same listing across sources collapses
  kind: ActivityKind;
  title: string;
  first_seen_at: string;
  last_seen_at: string;
  source_date: string | null;
  status: ActivityStatus;
  source_id: string | null;
  url: string | null;
  confidence: number; // 0..1
};

export type ActivityChange =
  | { type: "new"; event: ActivityEvent }
  | { type: "updated"; event: ActivityEvent }
  | { type: "reopened"; event: ActivityEvent }
  | { type: "closed"; event: ActivityEvent };

// A signal seen for the first time now is only "genuinely new" if the underlying
// source date is itself recent. Otherwise it is a newly discovered older record.
export function isGenuinelyNew(
  event: ActivityEvent,
  now: Date = new Date(),
  maxAgeDays = 30,
): boolean {
  const ref = event.source_date ?? event.first_seen_at;
  return daysSince(ref, now) <= maxAgeDays;
}

export type Discovery = "genuinely_new" | "newly_discovered_old" | "already_known";

export function classifyDiscovery(
  event: ActivityEvent,
  previouslyKnown: boolean,
  now: Date = new Date(),
  maxAgeDays = 30,
): Discovery {
  if (previouslyKnown) return "already_known";
  return isGenuinelyNew(event, now, maxAgeDays) ? "genuinely_new" : "newly_discovered_old";
}

// Compare the previous known set with the current observed set, keyed by `key`.
export function diffActivity(
  previous: ActivityEvent[],
  current: ActivityEvent[],
): ActivityChange[] {
  const prevByKey = new Map(previous.map((e) => [e.key, e]));
  const curByKey = new Map(current.map((e) => [e.key, e]));
  const changes: ActivityChange[] = [];

  for (const [key, event] of curByKey) {
    const before = prevByKey.get(key);
    if (!before) {
      changes.push({ type: "new", event });
    } else if (before.status !== "active" && event.status === "active") {
      changes.push({ type: "reopened", event });
    } else if (
      before.status !== event.status ||
      before.title !== event.title ||
      before.last_seen_at !== event.last_seen_at
    ) {
      changes.push({ type: "updated", event });
    }
  }

  for (const [key, event] of prevByKey) {
    if (!curByKey.has(key) && event.status === "active") {
      changes.push({ type: "closed", event });
    }
  }

  return changes;
}

export type SignalStrength = "weak" | "medium" | "strong";

// How strongly a signal suggests a possible operational need. Deliberately
// conservative: unverified / stale signals and plain vacancies never rank high.
export function signalStrength(event: ActivityEvent, now: Date = new Date()): SignalStrength {
  if (event.status !== "active" || event.confidence < 0.4) return "weak";
  if (daysSince(event.source_date ?? event.last_seen_at, now) > 90) return "weak";

  switch (event.kind) {
    case "tender":
    case "new_contract":
    case "investment":
    case "expansion":
    case "new_branch":
      return "strong";
    case "repeated_recruitment":
    case "new_product":
    case "change":
      return "medium";
    default:
      return "weak";
  }
}

// A hiring signal may suggest growth, but it does not prove the company has a
// budget or wants to buy. Surface this next to every hiring-derived signal.
export const HIRING_DISCLAIMER =
  "A hiring or activity signal may suggest growth, but it does not prove the company has a budget or wants to purchase these services.";

export function isHiringKind(kind: ActivityKind): boolean {
  return kind === "vacancy" || kind === "repeated_recruitment";
}
