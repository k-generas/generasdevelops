import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { performRwandaScan } from "./rwanda-scan.server";
import type { IndustryKey } from "./rwanda";

const INDUSTRY_KEYS = [
  "manufacturing",
  "wholesale_retail",
  "agriculture",
  "construction",
  "transport",
  "hospitality",
  "health",
  "education",
  "finance",
  "technology",
  "professional",
  "trade",
  "energy_mining",
  "other",
] as const;

export const runRwandaScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        industries: z.array(z.enum(INDUSTRY_KEYS)).min(1).max(14),
        national: z.boolean().optional().default(false),
        province: z.string().trim().max(60).optional(),
        districts: z.array(z.string().trim().max(60)).max(30).optional(),
        maxQueries: z.number().int().min(1).max(10).optional(),
        title: z.string().trim().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return performRwandaScan(supabase, userId, {
      ...data,
      industries: data.industries as IndustryKey[],
    });
  });
