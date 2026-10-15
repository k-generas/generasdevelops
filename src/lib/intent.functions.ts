// Server function for the Buyer Intent board (Feature D). Owner-scoped; scoring
// is pure (`@/lib/intent`), this just loads evidence and ranks it.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rankByIntent, summarizeIntent, type IntentCounts } from "./intent";
import { computeIntentBoard, type IntentBoardRow } from "./intent.server";

export type { IntentBoardRow };

export type IntentBoard = {
  applied: boolean;
  error: string | null;
  rows: IntentBoardRow[];
  counts: IntentCounts;
};

export const getIntentBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntentBoard> => {
    const { rows, applied, error } = await computeIntentBoard(context.supabase, context.userId);
    const ranked = rankByIntent(rows) as IntentBoardRow[];
    return { applied, error, rows: ranked, counts: summarizeIntent(ranked) };
  });
