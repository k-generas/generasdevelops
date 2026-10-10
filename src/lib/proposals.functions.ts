import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callResponsesJSON } from "./ai.server";

export const PROPOSAL_MODES = [
  "First-contact message",
  "Website development proposal",
  "Website redesign proposal",
  "Website audit and improvement proposal",
  "Business automation proposal",
  "DukaLinka introduction",
  "Custom software proposal",
  "Follow-up message",
  "Reply to a client's question",
  "Response to an objection",
  "Formal quotation or project proposal",
  "Short WhatsApp-style message",
  "Professional email",
] as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body", "why"],
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    why: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "kind", "evidence"],
        properties: {
          statement: { type: "string" },
          kind: { type: "string", enum: ["verified_fact", "observed_problem", "reasonable_possibility"] },
          evidence: { type: "string" },
        },
      },
    },
  },
} as const;

export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        businessId: z.string().uuid(),
        mode: z.string().min(2).max(80),
        channel: z.string().max(40).default("Email"),
        language: z.string().max(40).default("English"),
        tone: z.string().max(40).default("Professional"),
        offer: z.string().max(80).optional(),
        price: z.number().nonnegative().nullable().optional(),
        currency: z.string().max(8).default("USD"),
        extra: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: biz } = await supabase.from("businesses").select("*").eq("id", data.businessId).single();
    if (!biz) throw new Error("Business not found");
    const { data: invs } = await supabase
      .from("investigations").select("id, created_at, report, findings, recommended_offer")
      .eq("business_id", biz.id).order("created_at", { ascending: false }).limit(2);
    const latest = invs?.[0];
    const { data: prev } = await supabase
      .from("proposals").select("mode, status, sent_at, created_at, body")
      .eq("business_id", biz.id).order("created_at", { ascending: false }).limit(3);
    const { data: notes } = await supabase.from("business_notes").select("body, created_at").eq("business_id", biz.id).order("created_at", { ascending: false }).limit(5);

    const f = (latest?.findings ?? {}) as any;
    const ageDays = latest ? Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 86400000) : null;
    const offer = data.offer || latest?.recommended_offer || "Website Development";

    const context_ = {
      business: { name: biz.name, category: biz.category, address: biz.address, phone: biz.phone, website: biz.website, rating: biz.rating, review_count: biz.review_count, emails: biz.emails, socials: biz.socials },
      latest_investigation: latest ? { date: latest.created_at, age_days: ageDays, report: latest.report, website: { reachable: f.reachable, https: f.https, load_ms: f.load_ms, mobile_viewport: f.has_viewport_meta, contact_form: f.has_contact_form, whatsapp_link: f.has_whatsapp_link, booking_or_shop: f.has_online_booking_or_shop, copyright_year: f.copyright_year, title: f.title }, visibility: f.visibility } : null,
      previous_proposals: (prev ?? []).map((p) => ({ mode: p.mode, status: p.status, sent_at: p.sent_at, excerpt: p.body.slice(0, 400) })),
      owner_notes: (notes ?? []).map((n) => n.body),
    };

    const instructions = `You write client messages and proposals for a freelance developer (web development, redesign, performance, automation, custom software, and DukaLinka — a shop/order/payment management product for small businesses).
Rules:
- Use ONLY the supplied research. Never invent problems, numbers, complaints, lost revenue, testimonials, case studies, past clients, certifications or guarantees. Never claim work has been done.
- Distinguish verified facts, observed problems and reasonable possibilities. Phrase possibilities as possibilities ("could make it easier…"). Never present assumptions as facts.
- Natural, concise, professional. No fake compliments, no hype, no long introductions, no generic AI phrasing.
- Channel shapes length: WhatsApp/SMS = very short; email = short with subject line as title; formal proposal = structured sections (only the relevant ones of: client details, introduction, observed situation, evidence-supported problem, recommended solution, scope, deliverables, expected benefits, price & payment terms, estimated timeline, assumptions & exclusions, next steps). Mark timelines as estimates.
- If a price is given, use it exactly; if none, do not invent one — write "[price to confirm]".
- Leave placeholders like [Your name] for the sender's details.
- "why" lists each research-based statement used in the message with its kind and the evidence.`;

    const input = `MODE: ${data.mode}\nCHANNEL: ${data.channel}\nLANGUAGE: ${data.language}\nTONE: ${data.tone}\nOFFER: ${offer}\nPRICE: ${data.price != null ? `${data.price} ${data.currency}` : "none given"}\n${data.extra ? `OWNER INSTRUCTIONS / CLIENT MESSAGE: ${data.extra}\n` : ""}\nRESEARCH:\n${JSON.stringify(context_, null, 2)}`;

    const text = await callResponsesJSON(instructions, input, "client_message", schema);
    const out = JSON.parse(text) as { title: string; body: string; why: unknown[] };

    const { data: prop, error } = await supabase
      .from("proposals")
      .insert({
        owner_id: userId, business_id: biz.id, investigation_id: latest?.id ?? null, mode: data.mode, offer,
        channel: data.channel, language: data.language, tone: data.tone, price: data.price ?? null, currency: data.currency,
        title: out.title, body: out.body, why: out.why as any,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("proposal_versions").insert({ owner_id: userId, proposal_id: prop.id, version: 1, body: out.body, note: "AI generated" });
    await supabase.from("business_activity_events").insert({ owner_id: userId, business_id: biz.id, event_type: "proposal_generated", summary: `Proposal drafted: ${data.mode} (${data.channel})`, ref_table: "proposals", ref_id: prop.id });
    await supabase.from("tasks").upsert(
      { owner_id: userId, business_id: biz.id, proposal_id: prop.id, title: `Review & send: ${data.mode} to ${biz.name}`, source: "proposal", dedupe_key: `send-proposal-${prop.id}` },
      { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
    );
    return { proposalId: prop.id, staleDays: ageDays };
  });
