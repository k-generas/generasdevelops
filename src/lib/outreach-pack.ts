// The AI-written multi-channel outreach pack. Pure helpers only, so the selection
// and counting rules can be unit-tested; the server function does the AI call and
// persistence. Kept separate from manual-outreach logging in `outreach.ts`.

// `mode` marker for the pack's proposal rows. Distinct so the pack's drafts can be
// listed and replaced independently of manual proposals.
export const OUTREACH_PACK_MODE = "Outreach message";

export const OUTREACH_PACK_CHANNELS = ["Email", "WhatsApp", "SMS"] as const;
export type OutreachPackChannel = (typeof OUTREACH_PACK_CHANNELS)[number];

export type PackMessage = {
  channel: string;
  title: string;
  body: string;
  why?: unknown;
};

// Keep at most `perChannel` usable messages for each known channel, in channel
// order. Drops empty bodies and any channel we don't support.
export function selectPackMessages<T extends PackMessage>(messages: T[], perChannel = 3): T[] {
  const kept: T[] = [];
  for (const ch of OUTREACH_PACK_CHANNELS) {
    let n = 0;
    for (const m of messages) {
      if (m.channel === ch && n < perChannel && typeof m.body === "string" && m.body.trim()) {
        n += 1;
        kept.push(m);
      }
    }
  }
  return kept;
}

export function packChannelCounts(messages: PackMessage[]): Record<OutreachPackChannel, number> {
  const counts: Record<OutreachPackChannel, number> = { Email: 0, WhatsApp: 0, SMS: 0 };
  for (const m of messages) {
    if ((OUTREACH_PACK_CHANNELS as readonly string[]).includes(m.channel))
      counts[m.channel as OutreachPackChannel] += 1;
  }
  return counts;
}
