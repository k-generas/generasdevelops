import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildRecommendationsForBusiness,
  createMaintenanceRecord,
  generatePromptSet,
  updateMaintenanceDetails,
  updateMaintenanceStatus,
  updateRecommendationStatus,
} from "./solution.server";
import { MAINTENANCE_STATUSES } from "./solution-builder";

export const buildSolutionRecommendationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        businessId: z.string().uuid(),
        investigationId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    buildRecommendationsForBusiness(
      context.supabase,
      context.userId,
      data.businessId,
      data.investigationId,
    ),
  );

export const generateSolutionPromptsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        recommendationId: z.string().uuid(),
        requestedOutcome: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    generatePromptSet(context.supabase, context.userId, data.recommendationId, {
      requestedOutcome: data.requestedOutcome,
    }),
  );

export const setSolutionRecommendationStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        recommendationId: z.string().uuid(),
        status: z.enum(["recommended", "accepted", "dismissed"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await updateRecommendationStatus(context.supabase, data.recommendationId, data.status);
    return { ok: true };
  });

export const createMaintenanceRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ recommendationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    createMaintenanceRecord(context.supabase, context.userId, data.recommendationId),
  );

export const updateMaintenanceStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        recordId: z.string().uuid(),
        status: z.enum(MAINTENANCE_STATUSES),
        completionNote: z.string().trim().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await updateMaintenanceStatus(
      context.supabase,
      data.recordId,
      data.status,
      data.completionNote,
    );
    return { ok: true };
  });

export const updateMaintenanceDetailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        recordId: z.string().uuid(),
        cadence: z.string().trim().max(120).nullable(),
        nextDueAt: z.string().datetime().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await updateMaintenanceDetails(context.supabase, data.recordId, {
      cadence: data.cadence?.trim() || null,
      nextDueAt: data.nextDueAt,
    });
    return { ok: true };
  });
