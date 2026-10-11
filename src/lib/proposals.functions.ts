import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createProposal } from "./proposals.server";

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
  .handler(async ({ data, context }) => createProposal(context.supabase, context.userId, data));
