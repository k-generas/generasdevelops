// Manual outreach logging. Pure helpers so the shapes and formatting are easy to
// unit test; the UI persists each attempt to business_activity_events.

export const OUTREACH_CHANNELS = [
  "Email",
  "WhatsApp",
  "Phone",
  "SMS",
  "LinkedIn",
  "In person",
  "Other",
] as const;

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_EVENT_TYPES = ["proposal_sent", "proposal_outreach"] as const;

export type OutreachEvent = {
  id: string;
  event_type: string;
  summary: string;
  details: unknown;
  created_at: string;
};

export type OutreachDetails = {
  channel: string | null;
  response: string | null;
  at: string | null;
};

// Safely read the jsonb details of an outreach event; never throws on bad data.
export function readOutreachDetails(details: unknown): OutreachDetails {
  const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  return { channel: str(d["channel"]), response: str(d["response"]), at: str(d["at"]) };
}

export function outreachSummary(channel: string, response?: string | null): string {
  const base = `Outreach via ${channel}`;
  const r = response?.trim();
  return r ? `${base} — response: ${r}` : base;
}

// Value for an <input type="datetime-local"> in the browser's local timezone.
export function nowLocalInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
