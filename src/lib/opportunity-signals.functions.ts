import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.server";
import { supabase } from "@/integrations/supabase/server";
import {
  mapActivityToSignal,
  suggestServicesForSignal,
  generateValidationQuestion,
  computeSignalPriority,
  isSignalExpired,
  type OpportunitySignal,
  type OpportunitySignalCategory,
  type OpportunitySignalStatus,
} from "@/lib/opportunity-signals";

const SignalCategorySchema = z.enum([
  "business_expansion",
  "new_branch_location",
  "new_product_service",
  "hiring_activity",
  "new_contracts_projects",
  "new_partnerships",
  "market_expansion",
  "digital_transformation",
  "technology_adoption",
  "changes_business_operations",
  "customer_experience_concerns",
  "digital_presence_improvements",
  "new_supplier_distributor",
]);

const SignalStatusSchema = z.enum([
  "NEW",
  "UNDER_REVIEW",
  "CONFIRMED",
  "NEEDS_VALIDATION",
  "EXPIRED",
  "DISMISSED",
  "CONVERTED_TO_OPPORTUNITY",
]);

export const getOpportunitySignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.user.id;
    const { data, error } = await supabase
      .from("opportunity_signals")
      .select("*")
      .eq("owner_id", userId)
      .order("detected_at", { ascending: false });

    if (error) throw new Error(error.message);
    
    // Auto-expire old signals
    const signals = (data ?? []).map((row: any) => {
      const signal: OpportunitySignal = {
        id: row.id,
        business_id: row.business_id,
        category: row.category as OpportunitySignalCategory,
        description: row.description,
        evidence_source: row.evidence_source,
        source_url: row.source_url,
        published_at: row.published_at,
        detected_at: row.detected_at,
        last_verification_date: row.last_verification_date,
        confidence_level: Number(row.confidence_level),
        possible_business_need: row.possible_business_need,
        relevant_generas_service: Array.isArray(row.relevant_generas_service) ? row.relevant_generas_service : [],
        suggested_investigation: row.suggested_investigation,
        suggested_validation_question: row.suggested_validation_question,
        priority: row.priority,
        status: row.status as OpportunitySignalStatus,
        industry: row.industry,
        location: row.location,
        metadata: row.metadata || {},
      };
      
      if (signal.status === "NEW" && isSignalExpired(signal)) {
        // Update to EXPIRED (fire and forget)
        supabase.from("opportunity_signals").update({ status: "EXPIRED" }).eq("id", signal.id).then(() => {});
        signal.status = "EXPIRED";
      }
      
      return signal;
    });
    
    return { signals };
  });

export const createOpportunitySignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    business_id: z.string().uuid(),
    category: SignalCategorySchema,
    description: z.string().min(1),
    evidence_source: z.string().min(1),
    source_url: z.string().url().nullable().optional(),
    published_at: z.string().nullable().optional(),
    confidence_level: z.number().min(0).max(1).default(0.5),
    possible_business_need: z.string().min(1),
    suggested_investigation: z.string().min(1),
    industry: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    
    const relevant_generas_service = suggestServicesForSignal({
      category: data.category,
      confidence_level: data.confidence_level,
    } as OpportunitySignal);
    
    const suggested_validation_question = generateValidationQuestion({
      category: data.category,
    } as OpportunitySignal);
    
    const priority = computeSignalPriority({
      category: data.category,
      confidence_level: data.confidence_level,
    } as OpportunitySignal);
    
    const { data: signal, error } = await supabase
      .from("opportunity_signals")
      .insert({
        owner_id: userId,
        business_id: data.business_id,
        category: data.category,
        description: data.description,
        evidence_source: data.evidence_source,
        source_url: data.source_url || null,
        published_at: data.published_at || null,
        confidence_level: data.confidence_level,
        possible_business_need: data.possible_business_need,
        relevant_generas_service: relevant_generas_service,
        suggested_investigation: data.suggested_investigation,
        suggested_validation_question: suggested_validation_question,
        priority: priority,
        industry: data.industry || null,
        location: data.location || null,
        metadata: data.metadata || {},
      })
      .select()
      .single();
    
    if (error) throw new Error(error.message);
    return { signal };
  });

export const updateOpportunitySignalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    signal_id: z.string().uuid(),
    status: SignalStatusSchema,
    notes: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    
    const updateData: any = { 
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    
    if (data.status === "CONFIRMED" || data.status === "NEEDS_VALIDATION") {
      updateData.last_verification_date = new Date().toISOString();
    }
    
    const { error } = await supabase
      .from("opportunity_signals")
      .update(updateData)
      .eq("id", data.signal_id)
      .eq("owner_id", userId);
    
    if (error) throw new Error(error.message);
    return { ok: true };
  });
