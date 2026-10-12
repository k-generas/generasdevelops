export type Source = {
  id: string;
  kind: "map" | "jobs" | "tender" | "grants" | "rss" | "custom";
  name: string;
  url: string | null;
  enabled: boolean;
  configured: boolean;
  last_ok_at: string | null;
  last_attempt_at: string | null;
  error: string | null;
  fresh_ok: boolean; // true if last_ok_at within maxAgeDays
};

export function scanHealth(
  s: Source,
  maxAgeDays: number,
  now: Date = new Date(),
): {
  ok: boolean;
  reason: string;
} {
  if (!s.enabled || !s.configured) return { ok: false, reason: "not configured/enabled" };
  if (!s.last_ok_at) return { ok: false, reason: "never succeeded" };
  const t = Date.parse(s.last_ok_at);
  if (!Number.isFinite(t)) return { ok: false, reason: "stale timestamp" };
  const days = Math.max(0, Math.floor((now.getTime() - t) / (24 * 60 * 60 * 1000)));
  return days <= maxAgeDays
    ? { ok: true, reason: `ok ${days}d ago` }
    : { ok: false, reason: `stale ${days}d ago` };
}
