import { callResponsesJSON } from "./ai.server";

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
};

const INSTRUCTIONS = `You write client messages and proposals for a freelance developer (web development, redesign, performance, automation, custom software, and DukaLinka — a shop/order/payment management product for small businesses).
Rules:
- Use ONLY the supplied research. Never invent problems, numbers, complaints, lost revenue, testimonials, case studies, past clients, certifications or guarantees. Never claim work has been done.
- Website facts: only say the business has no website if website_check.confidence is "none_found", and phrase it as "I couldn't find a website for …". If a website exists, never say it is missing.
- Distinguish verified facts, observed problems and reasonable possibilities. Phrase possibilities as possibilities ("could make it easier…"). Never present assumptions as facts.
- Natural, concise, professional. No fake compliments, no hype, no long introductions, no generic AI phrasing.
- Channel shapes length: WhatsApp/SMS = very short; email = short with subject line as title; formal proposal = structured sections (only the relevant ones of: client details, introduction, observed situation, evidence-supported problem, recommended solution, scope, deliverables, expected benefits, price & payment terms, estimated timeline, assumptions & exclusions, next steps). Mark timelines as estimates.
- If a price is given, use it exactly; if none, do not invent one — write "[price to confirm]".
- Leave placeholders like [Your name] for the sender's details.
- "why" lists each research-based statement used in the message with its kind and the evidence.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createProposal(supabase: any, userId: string, o: ProposalOpts) {
  const { data: biz } = await supabase.from("businesses").select("*").eq("id", o.businessId).single();
  if (!biz) throw new Error("Business not found");
  const { data: invs } = await supabase
    .from("investigations").select("id, created_at, report, findings, recommended_offer")
    .eq("business_id", biz.id).order("created_at", { ascending: false }).limit(1);
  const latest = invs?.[0];
  const { data: prev } = await supabase
    .from("proposals").select("mode, status, sent_at, body")
    .eq("business_id", biz.id).order("created_at", { ascending: false }).limit(3);
  const { data: notes } = await supabase.from("business_notes").select("body").eq("business_id", biz.id).order("created_at", { ascending: false }).limit(5);

  const f = (latest?.findings ?? {}) as any;
  const ageDays = latest ? Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 86400000) : null;
  const offer = o.offer || latest?.recommended_offer || "Website Development";

  const research = {
    business: { name: biz.name, category: biz.category, address: biz.address, phone: biz.phone, website: biz.website, rating: biz.rating, review_count: biz.review_count, emails: biz.emails, socials: biz.socials },
    website_check: biz.website_check,
    latest_investigation: latest
      ? { date: latest.created_at, age_days: ageDays, report: latest.report, website: { reachable: f.reachable, https: f.https, load_ms: f.load_ms, mobile_viewport: f.has_viewport_meta, contact_form: f.has_contact_form, whatsapp_link: f.has_whatsapp_link, booking_or_shop: f.has_online_booking_or_shop, copyright_year: f.copyright_year, title: f.title }, visibility: f.visibility }
      : null,
    previous_proposals: (prev ?? []).map((p: any) => ({ mode: p.mode, status: p.status, sent_at: p.sent_at, excerpt: p.body.slice(0, 400) })),
    owner_notes: (notes ?? []).map((n: any) => n.body),
  };

  const input = `MODE: ${o.mode}\nCHANNEL: ${o.channel}\nLANGUAGE: ${o.language}\nTONE: ${o.tone}\nOFFER: ${offer}\nPRICE: ${o.price != null ? `${o.price} ${o.currency}` : "none given"}\n${o.extra ? `OWNER INSTRUCTIONS / CLIENT MESSAGE: ${o.extra}\n` : ""}\nRESEARCH:\n${JSON.stringify(research, null, 2)}`;
  const out = JSON.parse(await callResponsesJSON(INSTRUCTIONS, input, "client_message", schema)) as { title: string; body: string; why: unknown[] };

  const { data: prop, error } = await supabase
    .from("proposals")
    .insert({
      owner_id: userId, business_id: biz.id, investigation_id: latest?.id ?? null, mode: o.mode, offer,
      channel: o.channel, language: o.language, tone: o.tone, price: o.price ?? null, currency: o.currency,
      title: out.title, body: out.body, why: out.why,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("proposal_versions").insert({ owner_id: userId, proposal_id: prop.id, version: 1, body: out.body, note: o.auto ? "Auto-drafted after investigation" : "AI generated" });
  await supabase.from("business_activity_events").insert({ owner_id: userId, business_id: biz.id, event_type: "proposal_generated", summary: `${o.auto ? "Auto-drafted" : "Drafted"} proposal: ${o.mode} (${o.channel})`, ref_table: "proposals", ref_id: prop.id });
  // Partial unique index blocks duplicate open tasks; a conflict error is ignored.
  await supabase.from("tasks").insert({ owner_id: userId, business_id: biz.id, proposal_id: prop.id, title: `Review & send: ${o.mode} to ${biz.name}`, source: "proposal", dedupe_key: `send-proposal-${prop.id}` });
  return { proposalId: prop.id as string, staleDays: ageDays };
}
