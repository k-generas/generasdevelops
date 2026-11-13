// Returns the final JSON text from an AI call. Supports several providers and can
// fall back from one to the next. Auto order: your own key first, Lovable credits last:
//   gemini  -> https://generativelanguage.googleapis.com      (GEMINI_API_KEY)   [first]
//   openai  -> https://api.openai.com/v1/responses            (OPENAI_API_KEY)
//   lovable -> https://ai.gateway.lovable.dev/v1/responses    (LOVABLE_API_KEY)  [last]
export type AiProvider = "auto" | "openai" | "gemini" | "lovable";

export const AI_PROVIDERS: AiProvider[] = ["auto", "openai", "gemini", "lovable"];

export function aiModelLabel(provider: AiProvider): string {
  if (provider === "openai") return process.env["OPENAI_MODEL"] || "gpt-4.1";
  if (provider === "gemini") return geminiModels()[0] ?? "gemini-3.5-flash";
  if (provider === "lovable") return "openai/gpt-6-astra";
  return "auto (gemini → openai → lovable)";
}

const OPENAI_URL = "https://api.openai.com/v1/responses";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/responses";
const AI_TIMEOUT_MS = Number(process.env["AI_TIMEOUT_MS"]) || 120_000;

function openaiKey() {
  return process.env["OPENAI_API_KEY"];
}
function geminiKey() {
  return process.env["GEMINI_API_KEY"] || process.env["GOOGLE_AI_API_KEY"];
}
function lovableKey() {
  return process.env["LOVABLE_API_KEY"];
}

function extractResponsesText(data: unknown): string {
  const d = data as {
    output_text?: unknown;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof d?.output_text === "string" && d.output_text) return d.output_text;
  let out = "";
  for (const item of d?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") out += c.text;
    }
  }
  return out;
}

async function callOpenAI(
  instructions: string,
  input: string,
  name: string,
  schema: object,
): Promise<string> {
  const apiKey = openaiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  const model = process.env["OPENAI_MODEL"] || "gpt-4.1";
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("OpenAI rejected the key (401). Check OPENAI_API_KEY.");
    if (res.status === 429 && /insufficient_quota|credit_balance_exhausted/i.test(body))
      throw new Error("OpenAI has no credits remaining. Add billing at platform.openai.com.");
    if (res.status === 429)
      throw new Error("OpenAI is rate limited right now. Try again in a minute.");
    throw new Error(`OpenAI request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const text = extractResponsesText(await res.json());
  if (!text) throw new Error("OpenAI returned an empty answer.");
  return text;
}

// Gemini's response_schema only accepts an OpenAPI subset: no additionalProperties,
// and nullability is expressed with a "nullable" flag instead of a type array.
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (node && typeof node === "object") {
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k === "additionalProperties" || k === "$schema") continue;
      if (k === "type" && Array.isArray(v)) {
        const nonNull = v.find((t) => t !== "null");
        if (nonNull) out["type"] = nonNull;
        if (v.includes("null")) out["nullable"] = true;
        continue;
      }
      if (k === "properties" && v && typeof v === "object") {
        out["properties"] = Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]),
        );
        continue;
      }
      if (k === "items") {
        out["items"] = toGeminiSchema(v);
        continue;
      }
      out[k] = v;
    }
    return out;
  }
  return node;
}

// Transient provider statuses (rate limits, capacity spikes). Worth one short
// retry before moving on — Gemini's 503 "high demand" spikes usually clear in
// seconds, and the alternative is burning Lovable credits on every spike.
function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

const DEFAULT_GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
] as const;

// A capacity spike on one model should not burn Lovable credits or fail the
// investigation. GEMINI_MODEL can be a comma-separated preference list.
function geminiModels(): string[] {
  const configured = (process.env["GEMINI_MODEL"] ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_GEMINI_MODELS])];
}

async function callGemini(
  instructions: string,
  input: string,
  _name: string,
  schema: object,
): Promise<string> {
  const apiKey = geminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const modelErrors: string[] = [];
  for (const model of geminiModels()) {
    let modelError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: input }] }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: toGeminiSchema(schema),
          },
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        if (!text) {
          modelError = new Error(`Gemini ${model} returned an empty answer.`);
          break;
        }
        return text;
      }
      const body = await res.text().catch(() => "");
      if (res.status === 400 && /API key not valid/i.test(body))
        throw new Error("Gemini rejected the key. Check GEMINI_API_KEY.");
      if (res.status === 404) {
        modelError = new Error(`Gemini model ${model} is unavailable [404]: ${body.slice(0, 160)}`);
        break;
      }
      if (!isTransient(res.status))
        throw new Error(`Gemini request failed [${res.status}]: ${body.slice(0, 300)}`);
      modelError = new Error(
        `Gemini ${model} unavailable [${res.status}]: ${body.slice(0, 160) || "transient provider error"}`,
      );
    }
    if (modelError) modelErrors.push(modelError.message);
  }
  throw new Error(
    modelErrors.length > 0
      ? `Gemini is temporarily unavailable on all configured models: ${modelErrors.join(" | ")}`
      : "Gemini request failed.",
  );
}

async function callLovable(
  instructions: string,
  input: string,
  name: string,
  schema: object,
): Promise<string> {
  const apiKey = lovableKey();
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not set.");
  const res = await fetch(LOVABLE_URL, {
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
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (res.status === 402)
      throw new Error("AI credits are exhausted. Add credits in workspace billing.");
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
        else if (evt.type === "response.failed" || evt.type === "error")
          failure = evt.response?.error?.message ?? evt.message ?? "AI response failed";
        else if (evt.type === "response.refusal.delta") failure = "The AI declined this request.";
      } catch {
        /* partial */
      }
    }
  }
  if (failure) throw new Error(failure);
  if (!text) throw new Error("AI returned an empty answer.");
  return text;
}

export async function callResponsesJSON(
  instructions: string,
  input: string,
  name: string,
  schema: object,
  provider: AiProvider = "auto",
): Promise<string> {
  const order: AiProvider[] = provider === "auto" ? ["gemini", "openai", "lovable"] : [provider];
  const errors: string[] = [];
  for (const p of order) {
    // Skip providers with no key configured instead of recording a throwaway
    // error — keeps the final message about real failures only.
    if (p === "openai" && !openaiKey()) continue;
    if (p === "gemini" && !geminiKey()) continue;
    if (p === "lovable" && !lovableKey()) continue;
    try {
      if (p === "openai") return await callOpenAI(instructions, input, name, schema);
      if (p === "gemini") return await callGemini(instructions, input, name, schema);
      if (p === "lovable") return await callLovable(instructions, input, name, schema);
    } catch (e) {
      errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (provider !== "auto")
    throw new Error(errors[0] ?? `AI provider "${provider}" is not configured (missing key).`);
  if (errors.length === 0) throw new Error("AI is not configured (missing key).");
  if (errors.every((e) => e.includes("is not set"))) {
    throw new Error("AI is not configured (missing key).");
  }
  throw new Error(
    `AI request failed [ai-v2]. Tried: ${errors.join(" | ")}. Gemini may be overloaded. Add billing/credits to OpenAI or Lovable, or verify OPENAI_API_KEY in Lovable project Settings → Environment variables, then retry.`,
  );
}
