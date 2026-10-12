import { callResponsesJSON, type AiProvider } from "./ai.server";
import { checkPrice, minPriceFor, parseMinPrices } from "./pricing";
import { channelGuidance } from "./channels";
import {
  OUTREACH_PACK_MODE,
  selectPackMessages,
  packChannelCounts,
  type OutreachPackChannel,
} from "./outreach-pack";

const WHY_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["statement", "kind", "evidence"],
    properties: {
      statement: { type: "string" },
      kind: {
        type: "string",
        enum: ["verified_fact", "observed_problem", "reasonable_possibility"],
      },
      evidence: { type: "string" },
    },
  },
} as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body", "why"],
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    why: WHY_SCHEMA,
  },
} as const;

const packSchema = {
  type: "object",
  additionalProperties: false,
  required: ["messages"],
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["channel", "title", "body", "why"],
        properties: {
          channel: { type: "string", enum: ["Email", "WhatsApp", "SMS"] },
          title: { type: "string" },
          body: { type: "string" },
          why: WHY_SCHEMA,
        },
      },
    },
  },
} as const;

export type ProposalOpts = {
  businessId: string;
  mode: string;
  channel: string;
  language: string;
  tone: string;
  offer?: string | undefined;
  price?: number | null | undefined;
  currency: string;
  extra?: string | undefined;
  auto?: boolean;
  provider?: AiProvider | undefined;
};

export type OutreachPackOpts = {
  businessId: string;
  offer?: string | undefined;
  language?: string | undefined;
  tone?: string | undefined;
  currency?: string | undefined;
  provider?: AiProvider | undefined;
};

const INSTRUCTIONS = `You write client messages and proposals for a freelance developer (web development, redesign, performance, automation, custom software, and DukaLinka — a shop/order/payment management product for small businesses).
Rules:
- Use ONLY the supplied research. Never invent problems, numbers, complaints, lost revenue, testimonials, case studies, past clients, certifications or guarantees. Never claim work has been done.
- Write for the exact CHANNEL below and obey its CHANNEL FORMAT line exactly. The body must be ready to copy and paste with no editing.
- Output plain text only: no markdown (no **, ##, __ or backticks), no bullet symbols; use a numbered list only when the channel format asks for one. The title is the email subject for Email and a short internal label for other channels.
- Website facts: only say the business has no website if website_check.confidence is "none_found", and phrase it as "I couldn't find a website for …". If a website exists, never say it is missing.
- Distinguish verified facts, observed problems and reasonable possibilities. Phrase possibilities as possibilities ("could make it easier…"). Never present assumptions as facts.
- Natural, concise, professional. No fake compliments, no hype, no long introductions, no generic AI phrasing.
- Channel shapes length: WhatsApp/SMS = very short; email = short with subject line as title; formal proposal = structured sections (only the relevant ones of: client details, introduction, observed situation, evidence-supported problem, recommended solution, scope, deliverables, expected benefits, price & payment terms, estimated timeline, assumptions & exclusions, next steps). Mark timelines as estimates.
- If a price is given, use it exactly; if none, do not invent one — write "[price to confirm]". Never propose a price below the owner's minimum for the offer (research.pricing_floor).
- Leave placeholders like [Your name] for the sender's details.
- "why" lists each research-based statement used in the message with its kind and the evidence.`;

const PACK_INSTRUCTIONS = `You write first-contact outreach messages for a freelance developer (web development, redesign, performance, automation, custom software, and DukaLinka — a shop/order/payment management product for small businesses).
Produce EXACTLY 3 Email, 3 WhatsApp and 3 SMS messages (9 total). Each of the three in a channel must take a DIFFERENT angle, for example: (1) lead with the concretely observed situation, (2) lead with the outcome or benefit for the business, (3) a short, friendly question that invites a reply. Never repeat the same opening or wording across versions.
Rules:
- Use ONLY the supplied research. Never invent problems, numbers, complaints, lost revenue, testimonials, case studies, past clients, certifications or guarantees. Never claim work has been done.
- Obey each channel's FORMAT exactly. Every body must be ready to copy and paste with no editing.
- Output plain text only: no markdown (no **, ##, __ or backticks), no bullet symbols except a numbered list when a format asks for one. The title is the email subject for Email; for WhatsApp and SMS the title is a short internal label (max ~6 words).
- Website facts: only say the business has no website if website_check.confidence is "none_found", and phrase it as "I couldn't find a website for …". If a website exists, never say it is missing.
- Distinguish verified facts, observed problems and reasonable possibilities. Phrase possibilities as possibilities. Never present assumptions as facts.
- Natural, concise, professional. No fake compliments, no hype, no long introductions, no generic AI phrasing.
- Respect length by channel: SMS under 300 characters, WhatsApp 2-4 short lines, Email short with 2-4 short paragraphs and one clear call to action.
- If a price is given, use it exactly; if none, write "[price to confirm]". Never propose a price below the owner's minimum (research.pricing_floor).
- Leave placeholders like [Your name] for the sender's details.
- "why" lists each research-based statement used in each message with its kind and the evidence.`;

type PrevProposal = {
  mode: string | null;
  status: string | null;
  sent_at: string | null;
  body: string | null;
};

type NoteRow = { body: string | null };

// Loads everything a proposal writer needs: the business, its latest investigation
// (with website findings), the owner's pricing floor and recent context. Shared by
// the single-message generator and the multi-channel outreach pack.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProposalContext(supabase: any, businessId: string, offerOverride?: string) {
  const { data: biz } = await supabase.from("businesses").select("*").eq("id", businessId).single();
  if (!biz) throw new Error("Business not found");
  const { data: invs } = await supabase
    .from("investigations")
    .select("id, created_at, report, findings, recommended_offer")
    .eq("business_id", biz.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = invs?.[0];
  const { data: prev } = await supabase
    .from("proposals")
    .select("mode, status, sent_at, body")
    .eq("business_id", biz.id)
    .order("created_at", { ascending: false })
    .limit(3);
  const { data: notes } = await supabase
    .from("business_notes")
    .select("body")
    .eq("business_id", biz.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const f = (latest?.findings ?? {}) as {
    reachable?: unknown;
    https?: unknown;
    load_ms?: unknown;
    has_viewport_meta?: unknown;
    has_contact_form?: unknown;
    has_whatsapp_link?: unknown;
    has_online_booking_or_shop?: unknown;
    copyright_year?: unknown;
    title?: unknown;
    visibility?: unknown;
  };
  const ageDays = latest
    ? Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 86400000)
    : null;
  const offer = offerOverride || latest?.recommended_offer || "Website Development";

  // Owner pricing floor (Settings). Reject an explicit price below it so the AI
  // or the owner can never promise a price the owner has ruled out.
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("min_prices")
    .maybeSingle();
  const minPrices = parseMinPrices(prefs?.min_prices);

  const research = {
    business: {
      name: biz.name,
      category: biz.category,
      address: biz.address,
      phone: biz.phone,
      website: biz.website,
      rating: biz.rating,
      review_count: biz.review_count,
      emails: biz.emails,
      socials: biz.socials,
    },
    website_check: biz.website_check,
    pricing_floor: minPriceFor(offer, minPrices),
    latest_investigation: latest
      ? {
          date: latest.created_at,
          age_days: ageDays,
          report: latest.report,
          website: {
            reachable: f.reachable,
            https: f.https,
            load_ms: f.load_ms,
            mobile_viewport: f.has_viewport_meta,
            contact_form: f.has_contact_form,
            whatsapp_link: f.has_whatsapp_link,
            booking_or_shop: f.has_online_booking_or_shop,
            copyright_year: f.copyright_year,
            title: f.title,
          },
          visibility: f.visibility,
        }
      : null,
    previous_proposals: (prev ?? []).map((p: PrevProposal) => ({
      mode: p.mode,
      status: p.status,
      sent_at: p.sent_at,
      excerpt: (p.body ?? "").slice(0, 400),
    })),
    owner_notes: (notes ?? []).map((n: NoteRow) => n.body),
  };

  return { biz, latest, offer, ageDays, research, minPrices };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createProposal(supabase: any, userId: string, o: ProposalOpts) {
  const ctx = await loadProposalContext(supabase, o.businessId, o.offer);
  const { biz, latest, offer } = ctx;

  const priceCheck = checkPrice(o.price ?? null, offer, ctx.minPrices);
  if (!priceCheck.ok) throw new Error(priceCheck.message);

  const input = `MODE: ${o.mode}\nCHANNEL: ${o.channel}\nCHANNEL FORMAT: ${channelGuidance(o.channel)}\nLANGUAGE: ${o.language}\nTONE: ${o.tone}\nOFFER: ${offer}\nPRICE: ${o.price != null ? `${o.price} ${o.currency}` : "none given"}\n${o.extra ? `OWNER INSTRUCTIONS / CLIENT MESSAGE: ${o.extra}\n` : ""}\nRESEARCH:\n${JSON.stringify(ctx.research, null, 2)}`;
  const out = JSON.parse(
    await callResponsesJSON(INSTRUCTIONS, input, "client_message", schema, o.provider ?? "auto"),
  ) as { title: string; body: string; why: unknown[] };

  const { data: prop, error } = await supabase
    .from("proposals")
    .insert({
      owner_id: userId,
      business_id: biz.id,
      investigation_id: latest?.id ?? null,
      mode: o.mode,
      offer,
      channel: o.channel,
      language: o.language,
      tone: o.tone,
      price: o.price ?? null,
      currency: o.currency,
      title: out.title,
      body: out.body,
      why: out.why,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("proposal_versions").insert({
    owner_id: userId,
    proposal_id: prop.id,
    version: 1,
    body: out.body,
    note: o.auto ? "Auto-drafted after investigation" : "AI generated",
  });
  await supabase.from("business_activity_events").insert({
    owner_id: userId,
    business_id: biz.id,
    event_type: "proposal_generated",
    summary: `${o.auto ? "Auto-drafted" : "Drafted"} proposal: ${o.mode} (${o.channel})`,
    ref_table: "proposals",
    ref_id: prop.id,
  });
  // Partial unique index blocks duplicate open tasks; a conflict error is ignored.
  await supabase.from("tasks").insert({
    owner_id: userId,
    business_id: biz.id,
    proposal_id: prop.id,
    title: `Review & send: ${o.mode} to ${biz.name}`,
    source: "proposal",
    dedupe_key: `send-proposal-${prop.id}`,
  });
  return { proposalId: prop.id as string, staleDays: ctx.ageDays };
}

// Distinct mode so the pack's drafts can be found and replaced independently of
// manual proposals. Not offered in the manual mode dropdown.
const VERSIONS_PER_CHANNEL = 3;

// Writes a ready-to-copy outreach pack: 3 distinct versions each for Email,
// WhatsApp and SMS, saved one-per-proposal so the normal review/send/outcome
// workflow applies. Replaces earlier UNSENT pack drafts; keeps anything sent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOutreachPack(supabase: any, userId: string, o: OutreachPackOpts) {
  const ctx = await loadProposalContext(supabase, o.businessId, o.offer);
  const language = o.language || "English";
  const tone = o.tone || "Professional";
  const currency = o.currency || "USD";

  const input = [
    "MODE: First-contact outreach",
    `LANGUAGE: ${language}`,
    `TONE: ${tone}`,
    `OFFER: ${ctx.offer}`,
    "CHANNEL FORMATS:",
    `- Email: ${channelGuidance("Email")}`,
    `- WhatsApp: ${channelGuidance("WhatsApp")}`,
    `- SMS: ${channelGuidance("SMS")}`,
    "RESEARCH:",
    JSON.stringify(ctx.research, null, 2),
  ].join("\n");

  const out = JSON.parse(
    await callResponsesJSON(
      PACK_INSTRUCTIONS,
      input,
      "outreach_pack",
      packSchema,
      o.provider ?? "auto",
    ),
  ) as {
    messages: {
      channel: OutreachPackChannel;
      title: string;
      body: string;
      why: unknown;
    }[];
  };

  const kept = selectPackMessages(out.messages ?? [], VERSIONS_PER_CHANNEL);
  if (kept.length === 0) throw new Error("The AI returned no usable messages.");
  const counts = packChannelCounts(kept);

  // Replace earlier unsent pack drafts so re-running stays tidy; keep sent ones.
  await supabase
    .from("proposals")
    .delete()
    .eq("business_id", ctx.biz.id)
    .eq("mode", OUTREACH_PACK_MODE)
    .in("status", ["DRAFT", "READY_TO_SEND"]);

  const inserts = kept.map((m) => ({
    owner_id: userId,
    business_id: ctx.biz.id,
    investigation_id: ctx.latest?.id ?? null,
    mode: OUTREACH_PACK_MODE,
    offer: ctx.offer,
    channel: m.channel,
    language,
    tone,
    price: null,
    currency,
    title: m.title || `${m.channel} message`,
    body: m.body,
    why: m.why,
    status: "DRAFT",
  }));
  const { data: saved, error } = await supabase
    .from("proposals")
    .insert(inserts)
    .select("id, body");
  if (error) throw new Error(error.message);

  const savedRows = (saved ?? []) as { id: string; body: string }[];
  if (savedRows.length) {
    await supabase.from("proposal_versions").insert(
      savedRows.map((p) => ({
        owner_id: userId,
        proposal_id: p.id,
        version: 1,
        body: p.body,
        note: "AI outreach pack",
      })),
    );
  }

  await supabase.from("business_activity_events").insert({
    owner_id: userId,
    business_id: ctx.biz.id,
    event_type: "proposal_generated",
    summary: `AI outreach pack: ${counts.Email} email · ${counts.WhatsApp} WhatsApp · ${counts.SMS} SMS`,
    ref_table: "proposals",
  });
  // One review task for the whole pack; the open-task unique index de-dupes repeats.
  await supabase.from("tasks").insert({
    owner_id: userId,
    business_id: ctx.biz.id,
    title: `Review & send outreach to ${ctx.biz.name}`,
    source: "proposal",
    dedupe_key: `send-outreach-${ctx.biz.id}`,
  });

  return {
    count: savedRows.length,
    byChannel: { email: counts.Email, whatsapp: counts.WhatsApp, sms: counts.SMS },
    proposalIds: savedRows.map((p) => p.id),
    staleDays: ctx.ageDays,
  };
}
