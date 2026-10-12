// Channels the engine can write for, with explicit per-channel formatting so the
// generated text is ready to copy and paste without editing. Kept dependency-free
// for unit testing.

export const PROPOSAL_CHANNELS = [
  "Email",
  "WhatsApp",
  "SMS",
  "LinkedIn",
  "Instagram DM",
  "Facebook Messenger",
  "Phone call script",
  "Formal document",
] as const;

export type ProposalChannel = (typeof PROPOSAL_CHANNELS)[number];

export const DEFAULT_CHANNEL: ProposalChannel = "Email";

export const CHANNEL_GUIDANCE: Record<ProposalChannel, string> = {
  Email:
    "Subject line first (used as the title), then a short greeting, 2-4 short paragraphs, one clear call to action, and a sign-off with the sender's name. Plain text only.",
  WhatsApp:
    "2-4 short conversational lines. Greet by name, make one point, end with one simple question. At most one emoji. No subject line, no formal sign-off.",
  SMS: "Under 300 characters. Say who you are, the single key point, and one question. Sign with the sender's first name. At most one emoji.",
  LinkedIn:
    "Professional and concise (max ~600 characters). No emojis, no hard sell, one clear ask. Plain sentences.",
  "Instagram DM":
    "Casual, 2-3 lines. Friendly opener, one concrete observation, one question. At most one emoji.",
  "Facebook Messenger":
    "Short and conversational, 2-4 lines. Friendly tone, one observation, one question. At most one emoji.",
  "Phone call script":
    "A spoken call script: an opener line, then 3 numbered talking points (one per line), one likely objection with a one-line reply, and a closing ask.",
  "Formal document":
    "A structured proposal with clear section headings: Introduction, Observed situation, Evidence, Proposed solution and deliverables, Investment, and Next steps. Use plain-text headings.",
};

const DEFAULT_GUIDANCE =
  "Write a ready-to-send message: greeting, the key point, and one clear next step.";

export function isKnownChannel(channel: string | null | undefined): boolean {
  return !!channel && Object.prototype.hasOwnProperty.call(CHANNEL_GUIDANCE, channel);
}

export function channelGuidance(channel: string | null | undefined): string {
  if (isKnownChannel(channel)) return CHANNEL_GUIDANCE[channel as ProposalChannel];
  return DEFAULT_GUIDANCE;
}
