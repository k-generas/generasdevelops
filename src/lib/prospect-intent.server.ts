import { callResponsesJSON } from "./ai.server";
import {
  interpretProspectPromptRules,
  validateAiProspectInterpretation,
  type ProspectInterpretation,
} from "./prospect-intent";

export const PROSPECT_AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entityKind", "filters", "unsupported"],
  properties: {
    entityKind: { type: "string", enum: ["business", "professional"] },
    filters: {
      type: "object",
      additionalProperties: false,
      required: [
        "query",
        "location",
        "district",
        "sector",
        "stage",
        "country",
        "professionalType",
        "availability",
      ],
      properties: {
        query: { type: "string" },
        location: { type: "string" },
        district: { type: "string" },
        sector: { type: "string" },
        stage: { type: "string" },
        country: { type: "string" },
        professionalType: { type: "string" },
        availability: { type: "string" },
      },
    },
    unsupported: {
      type: "array",
      items: { type: "string" },
      maxItems: 8,
    },
  },
};

export const PROSPECT_AI_INSTRUCTIONS = `You convert a sales prospecting request into saved-list filters.

Only use facts stated in the request. Do not invent people, businesses, places, contact details, intent, funding, hiring signals or website conditions.

Choose entityKind "business" for companies, agencies, clinics, hotels, shops, startups and similar organisations. Choose "professional" for individual people and roles.

Supported filters:
- query: one short keyword for name, sector or headline. Use the most specific domain word, not a full sentence.
- location: a place explicitly named in the request.
- district, sector, stage, country, professionalType, availability: only when explicitly requested with a supported value.

Business outreach stages: not_contacted, messaged, replied, negotiating, won, lost.
Professional types: founder, owner, executive, director, manager, consultant, freelancer, creator, engineer, designer, marketer, salesperson, investor, partner, other.
Professional availability: unknown, open, limited, unavailable.

Use an empty string for every filter that is not explicitly stated. Never guess a place or taxonomy value.

If the request asks for a condition GARE cannot filter, such as website quality, missing website, hiring, funding, buying intent, white-label or subcontract fit, add the exact condition to unsupported and leave it out of the filters.`;

export type ProspectAiCaller = (
  instructions: string,
  input: string,
  name: string,
  schema: object,
) => Promise<string>;

function fallbackMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 220 ? `${message.slice(0, 217)}...` : message;
}

export async function interpretProspectPromptWithAi(
  prompt: string,
  aiCall: ProspectAiCaller = callResponsesJSON,
): Promise<ProspectInterpretation> {
  const rules = interpretProspectPromptRules(prompt);
  try {
    const text = await aiCall(
      PROSPECT_AI_INSTRUCTIONS,
      `Prospecting request: ${rules.prompt}`,
      "prospect_filters",
      PROSPECT_AI_SCHEMA,
    );
    return validateAiProspectInterpretation(JSON.parse(text) as unknown, rules.prompt);
  } catch (error) {
    return {
      ...rules,
      fallbackReason: `AI interpretation was unavailable, so rule-based filters were used. ${fallbackMessage(error)}`,
    };
  }
}
