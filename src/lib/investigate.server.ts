// Real website probe + AI analysis. Nothing here invents data: AI only interprets
// the evidence collected below, and is told to say "unknown" when evidence is missing.

export type WebsiteFindings = {
  url: string | null;
  reachable: boolean | null;
  status: number | null;
  https: boolean | null;
  load_ms: number | null;
  title: string | null;
  meta_description: string | null;
  has_viewport_meta: boolean | null;
  has_contact_form: boolean | null;
  has_email_link: boolean | null;
  has_whatsapp_link: boolean | null;
  has_online_booking_or_shop: boolean | null;
  copyright_year: number | null;
  html_kb: number | null;
  text_excerpt: string | null;
  error: string | null;
};

export async function probeWebsite(url: string | null): Promise<WebsiteFindings> {
  const empty: WebsiteFindings = {
    url, reachable: null, status: null, https: null, load_ms: null, title: null,
    meta_description: null, has_viewport_meta: null, has_contact_form: null,
    has_email_link: null, has_whatsapp_link: null, has_online_booking_or_shop: null,
    copyright_year: null, html_kb: null, text_excerpt: null, error: null,
  };
  if (!url) return empty;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GARE-Investigator/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    const html = (await res.text()).slice(0, 400_000);
    const lower = html.toLowerCase();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? null;
    const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    return {
      ...empty,
      reachable: res.ok,
      status: res.status,
      https: res.url.startsWith("https://"),
      load_ms: Date.now() - started,
      title,
      meta_description: desc,
      has_viewport_meta: /<meta[^>]+name=["']viewport/i.test(html),
      has_contact_form: /<form[\s\S]{0,2000}(email|phone|message)/i.test(html),
      has_email_link: lower.includes("mailto:"),
      has_whatsapp_link: lower.includes("wa.me") || lower.includes("api.whatsapp.com"),
      has_online_booking_or_shop: /(add to cart|checkout|book now|booking|reserve|order online|shop now)/i.test(html),
      copyright_year: years.length ? Math.max(...years) : null,
      html_kb: Math.round(html.length / 1024),
      text_excerpt: text || null,
    };
  } catch (e) {
    return { ...empty, reachable: false, load_ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

export const OFFERS = [
  "Website Development",
  "Website Redesign",
  "Website Performance Improvement",
  "Business Automation",
  "Custom Software",
  "DukaLinka",
  "Digital Product",
  "Digital Service",
  "No offer — not a fit",
] as const;

const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview", "problems", "recommended_offer", "offer_reasoning", "score",
    "confidence", "estimated_deal_value_usd", "conversion_probability",
    "delivery_effort", "next_action",
  ],
  properties: {
    overview: { type: "string" },
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["problem", "evidence", "severity"],
        properties: {
          problem: { type: "string" },
          evidence: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    recommended_offer: { type: "string", enum: [...OFFERS] },
    offer_reasoning: { type: "string" },
    score: { type: "integer" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    estimated_deal_value_usd: { type: ["number", "null"] },
    conversion_probability: { type: "string", enum: ["low", "medium", "high", "unknown"] },
    delivery_effort: { type: "string", enum: ["low", "medium", "high", "unknown"] },
    next_action: { type: "string" },
  },
} as const;

export type InvestigationReport = {
  overview: string;
  problems: { problem: string; evidence: string; severity: "low" | "medium" | "high" }[];
  recommended_offer: string;
  offer_reasoning: string;
  score: number;
  confidence: string;
  estimated_deal_value_usd: number | null;
  conversion_probability: string;
  delivery_effort: string;
  next_action: string;
};

export async function analyzeWithAI(business: Record<string, unknown>, site: WebsiteFindings): Promise<InvestigationReport> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured (missing key).");

  const instructions = `You are the investigation analyst for a private revenue engine run by one freelance developer.
Their sellable capabilities: website development, website redesign, performance improvement, business automation, custom software, DukaLinka (a shop/order/payment management product for small businesses), digital products and services.
Analyse ONLY the evidence provided. Never invent facts, contacts, reviews or numbers. Every problem must cite concrete evidence from the data. If evidence is weak, say so and lower confidence.
score: 0-100 opportunity score (fit x likely need x ability to pay x reachability). Use "No offer — not a fit" when nothing fits.
estimated_deal_value_usd: rough realistic figure for this market, or null if impossible to judge. Keep overview under 80 words.`;

  const input = `BUSINESS (from Google Places):\n${JSON.stringify(business, null, 2)}\n\nWEBSITE PROBE:\n${JSON.stringify(site, null, 2)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      Authorization: `Bearer ${apiKey}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions,
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "investigation_report", strict: true, schema: reportSchema } },
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits in workspace billing.");
    if (res.status === 429) throw new Error("AI is rate limited right now. Try again in a minute.");
    throw new Error(`AI request failed [${res.status}]: ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let failure: string | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "response.output_text.delta") text += evt.delta ?? "";
        else if (evt.type === "response.failed" || evt.type === "error") {
          failure = evt.response?.error?.message ?? evt.message ?? "AI response failed";
        } else if (evt.type === "response.refusal.delta") failure = "The AI declined to analyse this business.";
      } catch {
        /* ignore partial */
      }
    }
  }
  if (failure) throw new Error(failure);
  if (!text) throw new Error("AI returned an empty answer.");
  const parsed = JSON.parse(text) as InvestigationReport;
  parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
  return parsed;
}
