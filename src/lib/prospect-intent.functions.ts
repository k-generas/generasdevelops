import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiUsageLimitMessage, consumeAiUsage, type AiUsageEntry } from "./ai-usage";
import {
  PROSPECT_PROMPT_MAX,
  interpretProspectPromptRules,
  type ProspectInterpretation,
} from "./prospect-intent";
import { interpretProspectPromptWithAi } from "./prospect-intent.server";

const interpretInput = z.object({
  prompt: z.string().trim().min(3).max(PROSPECT_PROMPT_MAX),
  useAi: z.boolean().default(false),
});

export type InterpretProspectPromptInput = z.infer<typeof interpretInput>;

const aiUsage = new Map<string, AiUsageEntry>();

export const interpretProspectPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => interpretInput.parse(data))
  .handler(async ({ data, context }): Promise<ProspectInterpretation> => {
    const rules = interpretProspectPromptRules(data.prompt);
    if (!data.useAi) return rules;

    const usage = consumeAiUsage(aiUsage, context.userId);
    if (!usage.allowed) {
      return {
        ...rules,
        fallbackReason: `${aiUsageLimitMessage(usage)} Rule-based filters were used instead.`,
      };
    }

    const result = await interpretProspectPromptWithAi(data.prompt);
    console.info("[prospect-ai] interpretation", {
      source: result.source,
      fallback: !!result.fallbackReason,
      remainingWindow: usage.remainingWindow,
      remainingDay: usage.remainingDay,
    });
    return result;
  });
