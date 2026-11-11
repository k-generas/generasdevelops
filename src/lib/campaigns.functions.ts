import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  CAMPAIGN_AUDIENCE_KINDS,
  CAMPAIGN_STATUSES,
  QUEUE_STATUSES,
  campaignSummary,
  canApproveQueueItem,
  canMarkQueueSent,
  canTransitionQueue,
  queueStatusFromEligibility,
  renderCampaignDraft,
  validateCampaign,
  validateCampaignSteps,
  type Campaign,
  type CampaignAudienceKind,
  type CampaignQueueItem,
  type CampaignStatus,
  type CampaignStep,
  type CampaignStepInput,
  type CampaignSummary,
  type CampaignTarget,
  type QueueStatus,
} from "./campaign";
import {
  CONTACT_CHANNELS,
  outreachEligibility,
  type ContactChannel,
  type OutreachEligibility,
  type SuppressionEntry,
} from "./compliance";
import { normalizeUrl } from "./professional-intelligence";

type CampaignRow = Database["public"]["Tables"]["outreach_campaigns"]["Row"];
type CampaignInsert = Database["public"]["Tables"]["outreach_campaigns"]["Insert"];
type StepRow = Database["public"]["Tables"]["outreach_campaign_steps"]["Row"];
type StepInsert = Database["public"]["Tables"]["outreach_campaign_steps"]["Insert"];
type QueueRow = Database["public"]["Tables"]["outreach_queue_items"]["Row"];
type QueueInsert = Database["public"]["Tables"]["outreach_queue_items"]["Insert"];
type SuppressionRow = Database["public"]["Tables"]["suppression_entries"]["Row"];

function isMissing(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table")
  );
}

function missingMessage(table: string): string {
  return `The ${table} table is not available yet. Apply the outreach campaign migration and try again.`;
}

function readEligibility(value: Json): OutreachEligibility | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as { status?: unknown }).status;
  if (status !== "allowed" && status !== "review_required" && status !== "blocked") return null;
  return value as unknown as OutreachEligibility;
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status as CampaignStatus,
    audienceKind: row.audience_kind as CampaignAudienceKind,
    dailyLimit: row.daily_limit,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStep(row: StepRow): CampaignStep {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    stepOrder: row.step_order,
    channel: row.channel as ContactChannel,
    delayDays: row.delay_days,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    requiresApproval: row.requires_approval,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toQueueItem(row: QueueRow): CampaignQueueItem {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    stepId: row.step_id,
    businessId: row.business_id,
    professionalId: row.professional_id,
    channel: row.channel as ContactChannel,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    recipientDomain: row.recipient_domain,
    country: row.country,
    status: row.status as QueueStatus,
    eligibility: readEligibility(row.eligibility),
    draftSubject: row.draft_subject,
    draftBody: row.draft_body,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    ownerNote: row.owner_note,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function suppressionEntry(row: SuppressionRow): SuppressionEntry {
  return {
    id: row.id,
    scope: row.scope as SuppressionEntry["scope"],
    value: row.value,
    channel: row.channel as SuppressionEntry["channel"],
    reason: row.reason,
    source: row.source,
    country: row.country,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export type CampaignListResult = {
  rows: Campaign[];
  applied: boolean;
};

export const getCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignListResult> => {
    const { data, error } = await context.supabase
      .from("outreach_campaigns")
      .select("*")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isMissing(error.message)) return { rows: [], applied: false };
      throw new Error(error.message);
    }
    return { rows: (data ?? []).map(toCampaign), applied: true };
  });

export type CampaignDetailResult = {
  campaign: Campaign | null;
  steps: CampaignStep[];
  applied: boolean;
};

export const getCampaignDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<CampaignDetailResult> => {
    const [{ data: campaign, error: campaignError }, { data: steps, error: stepsError }] =
      await Promise.all([
        context.supabase
          .from("outreach_campaigns")
          .select("*")
          .eq("owner_id", context.userId)
          .eq("id", data.id)
          .maybeSingle(),
        context.supabase
          .from("outreach_campaign_steps")
          .select("*")
          .eq("owner_id", context.userId)
          .eq("campaign_id", data.id)
          .order("step_order", { ascending: true }),
      ]);
    if (campaignError) {
      if (isMissing(campaignError.message)) return { campaign: null, steps: [], applied: false };
      throw new Error(campaignError.message);
    }
    if (stepsError) {
      if (isMissing(stepsError.message)) return { campaign: null, steps: [], applied: false };
      throw new Error(stepsError.message);
    }
    return {
      campaign: campaign ? toCampaign(campaign) : null,
      steps: (steps ?? []).map(toStep),
      applied: true,
    };
  });

const saveCampaignInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  objective: z.string().trim().max(1000).nullable().optional(),
  status: z.enum([...CAMPAIGN_STATUSES] as [CampaignStatus, ...CampaignStatus[]]).default("draft"),
  audienceKind: z
    .enum([...CAMPAIGN_AUDIENCE_KINDS] as [CampaignAudienceKind, ...CampaignAudienceKind[]])
    .default("business"),
  dailyLimit: z.number().int().min(1).max(500).default(20),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type SaveCampaignInput = z.infer<typeof saveCampaignInput>;

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveCampaignInput.parse(d))
  .handler(async ({ data, context }): Promise<Campaign> => {
    const validation = validateCampaign({
      name: data.name,
      dailyLimit: data.dailyLimit,
      steps: [],
    });
    const nonStepErrors = validation.errors.filter((error) => !error.startsWith("Add at least"));
    if (nonStepErrors.length > 0) throw new Error(nonStepErrors.join(" "));

    const row: CampaignInsert = {
      owner_id: context.userId,
      name: data.name,
      objective: data.objective ?? null,
      status: data.status,
      audience_kind: data.audienceKind,
      daily_limit: data.dailyLimit,
      notes: data.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) row.id = data.id;
    const { data: saved, error } = await context.supabase
      .from("outreach_campaigns")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("outreach_campaigns"));
      throw new Error(error.message);
    }
    return toCampaign(saved);
  });

const stepsInput = z.object({
  campaignId: z.string().uuid(),
  steps: z
    .array(
      z.object({
        stepOrder: z.number().int().min(1).max(100),
        channel: z.enum([...CONTACT_CHANNELS] as [ContactChannel, ...ContactChannel[]]),
        delayDays: z.number().int().min(0).max(90),
        subjectTemplate: z.string().trim().max(300).nullable().optional(),
        bodyTemplate: z.string().trim().min(1).max(8000),
        requiresApproval: z.boolean().default(true),
        active: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(20),
});

export type SaveCampaignStepsInput = z.infer<typeof stepsInput>;

export const saveCampaignSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => stepsInput.parse(d))
  .handler(async ({ data, context }): Promise<CampaignStep[]> => {
    const steps = data.steps as CampaignStepInput[];
    const validation = validateCampaignSteps(steps);
    if (!validation.valid) throw new Error(validation.errors.join(" "));

    const { data: campaign, error: campaignError } = await context.supabase
      .from("outreach_campaigns")
      .select("id")
      .eq("owner_id", context.userId)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campaign not found.");

    const { count, error: countError } = await context.supabase
      .from("outreach_queue_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", context.userId)
      .eq("campaign_id", data.campaignId);
    if (countError) {
      if (!isMissing(countError.message)) throw new Error(countError.message);
    } else if ((count ?? 0) > 0) {
      throw new Error(
        "Remove or archive the existing review queue before changing sequence steps.",
      );
    }

    const { error: deleteError } = await context.supabase
      .from("outreach_campaign_steps")
      .delete()
      .eq("owner_id", context.userId)
      .eq("campaign_id", data.campaignId);
    if (deleteError) {
      if (isMissing(deleteError.message))
        throw new Error(missingMessage("outreach_campaign_steps"));
      throw new Error(deleteError.message);
    }

    const rows: StepInsert[] = steps.map((step) => ({
      owner_id: context.userId,
      campaign_id: data.campaignId,
      step_order: step.stepOrder,
      channel: step.channel,
      delay_days: step.delayDays,
      subject_template: step.subjectTemplate ?? null,
      body_template: step.bodyTemplate,
      requires_approval: step.requiresApproval ?? true,
      active: step.active ?? true,
    }));
    const { data: saved, error } = await context.supabase
      .from("outreach_campaign_steps")
      .insert(rows)
      .select("*")
      .order("step_order", { ascending: true });
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("outreach_campaign_steps"));
      throw new Error(error.message);
    }
    return (saved ?? []).map(toStep);
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("outreach_campaigns")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("outreach_campaigns"));
      throw new Error(error.message);
    }
    return { ok: true };
  });

const queueInput = z.object({
  campaignId: z.string().uuid(),
  status: z.string().trim().max(30).optional().default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export type CampaignQueueResult = {
  rows: CampaignQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: CampaignSummary;
  applied: boolean;
};

type CountQuery = PromiseLike<{ count: number | null }>;

async function countOf(query: CountQuery): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

export const getCampaignQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => queueInput.parse(d))
  .handler(async ({ data, context }): Promise<CampaignQueueResult> => {
    const empty: CampaignQueueResult = {
      rows: [],
      total: 0,
      page: data.page,
      pageSize: data.pageSize,
      summary: campaignSummary([]),
      applied: false,
    };
    const base = () =>
      context.supabase
        .from("outreach_queue_items")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", context.userId)
        .eq("campaign_id", data.campaignId);

    let query = context.supabase
      .from("outreach_queue_items")
      .select("*", { count: "exact" })
      .eq("owner_id", context.userId)
      .eq("campaign_id", data.campaignId);
    if (data.status) query = query.eq("status", data.status);
    const from = (data.page - 1) * data.pageSize;
    const [{ data: rows, count, error }, total, needsReview, blocked, approved, sent, skipped] =
      await Promise.all([
        query.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1),
        countOf(base()),
        countOf(base().eq("status", "needs_review")),
        countOf(base().eq("status", "blocked")),
        countOf(base().eq("status", "approved")),
        countOf(base().eq("status", "sent")),
        countOf(base().eq("status", "skipped")),
      ]);
    if (error) {
      if (isMissing(error.message)) return empty;
      throw new Error(error.message);
    }
    return {
      rows: (rows ?? []).map(toQueueItem),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      summary: campaignSummary([
        ...Array<{ status: QueueStatus }>(needsReview).fill({ status: "needs_review" }),
        ...Array<{ status: QueueStatus }>(blocked).fill({ status: "blocked" }),
        ...Array<{ status: QueueStatus }>(approved).fill({ status: "approved" }),
        ...Array<{ status: QueueStatus }>(sent).fill({ status: "sent" }),
        ...Array<{ status: QueueStatus }>(skipped).fill({ status: "skipped" }),
      ]),
      applied: true,
    };
  });

const buildInput = z.object({
  campaignId: z.string().uuid(),
  stepId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(25),
  query: z.string().trim().max(160).optional().default(""),
  district: z.string().trim().max(120).optional().default(""),
  sector: z.string().trim().max(120).optional().default(""),
  stage: z.string().trim().max(80).optional().default(""),
  country: z.string().trim().max(80).optional().default(""),
  professionalType: z.string().trim().max(40).optional().default(""),
  availability: z.string().trim().max(40).optional().default(""),
});

export type BuildCampaignQueueInput = z.infer<typeof buildInput>;

export type BuildCampaignQueueResult = {
  queued: number;
  skipped: number;
  blocked: number;
  applied: boolean;
};

function missingContact(
  channel: ContactChannel,
  email: string | null,
  phone: string | null,
): string | null {
  if ((channel === "email" || channel === "contact_form") && !email) {
    return "No email address is available for this contact.";
  }
  if ((channel === "phone" || channel === "whatsapp" || channel === "sms") && !phone) {
    return "No phone number is available for this contact.";
  }
  return null;
}

export const buildCampaignQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => buildInput.parse(d))
  .handler(async ({ data, context }): Promise<BuildCampaignQueueResult> => {
    const { data: campaign, error: campaignError } = await context.supabase
      .from("outreach_campaigns")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (campaignError) {
      if (isMissing(campaignError.message)) throw new Error(missingMessage("outreach_campaigns"));
      throw new Error(campaignError.message);
    }
    if (!campaign) throw new Error("Campaign not found.");

    const { data: step, error: stepError } = await context.supabase
      .from("outreach_campaign_steps")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("campaign_id", data.campaignId)
      .eq("id", data.stepId)
      .maybeSingle();
    if (stepError) {
      if (isMissing(stepError.message)) throw new Error(missingMessage("outreach_campaign_steps"));
      throw new Error(stepError.message);
    }
    if (!step) throw new Error("Campaign step not found.");
    if (!step.active) throw new Error("This sequence step is inactive.");

    const channel = step.channel as ContactChannel;
    const kind = campaign.audience_kind as CampaignAudienceKind;
    const targets: CampaignTarget[] = [];
    let businessDoNotContact = new Map<string, boolean>();
    let professionalDoNotContact = new Map<string, boolean>();

    if (kind === "business") {
      let query = context.supabase
        .from("businesses")
        .select(
          "id,name,emails,phone,website,district,province,sector,industry,outreach_stage,address,contact_suppressed",
        )
        .eq("owner_id", context.userId);
      if (data.query) {
        const term = data.query.replace(/[(),]/g, " ").trim();
        if (term) {
          query = query.or(
            `name.ilike.%${term}%,sector.ilike.%${term}%,industry.ilike.%${term}%,district.ilike.%${term}%`,
          );
        }
      }
      if (data.district) query = query.ilike("district", `%${data.district}%`);
      if (data.sector) query = query.eq("sector", data.sector);
      if (data.stage) query = query.eq("outreach_stage", data.stage);
      const { data: rows, error } = await query
        .order("updated_at", { ascending: false })
        .limit(data.limit);
      if (error) throw new Error(error.message);
      businessDoNotContact = new Map((rows ?? []).map((row) => [row.id, !!row.contact_suppressed]));
      for (const row of rows ?? []) {
        const email = row.emails?.[0] ?? null;
        const domain = normalizeUrl(row.website);
        targets.push({
          kind: "business",
          id: row.id,
          name: row.name,
          email,
          phone: row.phone,
          domain,
          country: row.province ?? row.district,
          website: row.website,
          context: row.sector ?? row.industry ?? row.address,
        });
      }
    } else {
      let query = context.supabase
        .from("professionals")
        .select(
          "id,full_name,public_email,public_phone,website,country,headline,do_not_contact,availability_status,professional_type",
        )
        .eq("owner_id", context.userId);
      if (data.query) {
        const term = data.query.replace(/[(),]/g, " ").trim();
        if (term) {
          query = query.or(
            `full_name.ilike.%${term}%,headline.ilike.%${term}%,country.ilike.%${term}%`,
          );
        }
      }
      if (data.country) query = query.ilike("country", `%${data.country}%`);
      if (data.professionalType) query = query.eq("professional_type", data.professionalType);
      if (data.availability) query = query.eq("availability_status", data.availability);
      const { data: rows, error } = await query
        .order("updated_at", { ascending: false })
        .limit(data.limit);
      if (error) {
        if (isMissing(error.message)) throw new Error(missingMessage("professionals"));
        throw new Error(error.message);
      }
      professionalDoNotContact = new Map((rows ?? []).map((row) => [row.id, !!row.do_not_contact]));
      for (const row of rows ?? []) {
        const domain = normalizeUrl(row.website);
        targets.push({
          kind: "professional",
          id: row.id,
          name: row.full_name,
          email: row.public_email,
          phone: row.public_phone,
          domain,
          country: row.country,
          website: row.website,
          context: row.headline,
        });
      }
    }

    const { data: entries, error: ledgerError } = await context.supabase
      .from("suppression_entries")
      .select("*")
      .eq("owner_id", context.userId)
      .limit(10000);
    if (ledgerError && !isMissing(ledgerError.message)) throw new Error(ledgerError.message);
    const ledger = (entries ?? []).map(suppressionEntry);

    let blocked = 0;
    const rows: QueueInsert[] = targets.map((target) => {
      const eligibility = outreachEligibility({
        channel,
        country: target.country ?? null,
        contact: {
          email: target.email ?? null,
          phone: target.phone ?? null,
          domain: target.domain ?? null,
          businessId: target.kind === "business" ? target.id : null,
          professionalId: target.kind === "professional" ? target.id : null,
        },
        entries: ledger,
        businessDoNotContact:
          target.kind === "business" ? (businessDoNotContact.get(target.id) ?? false) : false,
        professionalDoNotContact:
          target.kind === "professional"
            ? (professionalDoNotContact.get(target.id) ?? false)
            : false,
        ownerConfirmedLawfulBasis: false,
      });
      const missing = missingContact(channel, target.email ?? null, target.phone ?? null);
      const gated: OutreachEligibility = missing
        ? {
            ...eligibility,
            status: "blocked",
            allowed: false,
            reasons: [...eligibility.reasons, missing],
          }
        : eligibility;
      const status = queueStatusFromEligibility(gated);
      if (status === "blocked") blocked++;
      const draft = renderCampaignDraft(
        {
          channel,
          subjectTemplate: step.subject_template,
          bodyTemplate: step.body_template,
        },
        target,
      );
      return {
        owner_id: context.userId,
        campaign_id: data.campaignId,
        step_id: data.stepId,
        business_id: target.kind === "business" ? target.id : null,
        professional_id: target.kind === "professional" ? target.id : null,
        channel,
        recipient_name: target.name,
        recipient_email: target.email ?? null,
        recipient_phone: target.phone ?? null,
        recipient_domain: target.domain ?? null,
        country: target.country ?? null,
        status,
        eligibility: gated as unknown as Json,
        draft_subject: draft.subject,
        draft_body: draft.body,
        dedupe_key: `${target.kind}:${target.id}:step:${step.step_order}`,
      };
    });

    if (rows.length === 0) {
      return { queued: 0, skipped: 0, blocked: 0, applied: true };
    }

    const { data: inserted, error } = await context.supabase
      .from("outreach_queue_items")
      .upsert(rows, {
        onConflict: "owner_id,campaign_id,step_id,dedupe_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("outreach_queue_items"));
      throw new Error(error.message);
    }
    const queued = inserted?.length ?? 0;
    return {
      queued,
      skipped: Math.max(0, rows.length - queued),
      blocked,
      applied: true,
    };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  status: z.enum([...QUEUE_STATUSES] as [QueueStatus, ...QueueStatus[]]),
  ownerNote: z.string().trim().max(2000).nullable().optional(),
  ownerConfirmedLawfulBasis: z.boolean().default(false),
  ownerConfirmedManualSend: z.boolean().default(false),
});

export type UpdateQueueItemInput = z.infer<typeof updateInput>;

export const updateQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateInput.parse(d))
  .handler(async ({ data, context }): Promise<CampaignQueueItem> => {
    const { data: row, error } = await context.supabase
      .from("outreach_queue_items")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("outreach_queue_items"));
      throw new Error(error.message);
    }
    if (!row) throw new Error("Queue item not found.");

    const item = toQueueItem(row);
    if (!canTransitionQueue(item.status, data.status)) {
      throw new Error(`Cannot change a ${item.status} item to ${data.status}.`);
    }
    if (data.status === "approved") {
      const gate = canApproveQueueItem(item, data.ownerConfirmedLawfulBasis);
      if (!gate.allowed) throw new Error(gate.reason ?? "This item cannot be approved.");
    }
    if (data.status === "sent") {
      const gate = canMarkQueueSent(item, data.ownerConfirmedManualSend);
      if (!gate.allowed) throw new Error(gate.reason ?? "This item cannot be marked sent.");
    }

    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["outreach_queue_items"]["Update"] = {
      status: data.status,
      updated_at: now,
    };
    if (data.ownerNote !== undefined) patch.owner_note = data.ownerNote ?? null;
    if (data.status === "approved") patch.approved_at = now;
    if (data.status === "sent") patch.sent_at = now;
    if (data.status === "skipped" || data.status === "blocked" || data.status === "needs_review") {
      patch.approved_at = null;
      patch.sent_at = null;
    }
    const { data: saved, error: saveError } = await context.supabase
      .from("outreach_queue_items")
      .update(patch)
      .eq("owner_id", context.userId)
      .eq("id", data.id)
      .select("*")
      .single();
    if (saveError) throw new Error(saveError.message);
    return toQueueItem(saved);
  });

export const deleteQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("outreach_queue_items")
      .delete()
      .eq("owner_id", context.userId)
      .eq("id", data.id);
    if (error) {
      if (isMissing(error.message)) throw new Error(missingMessage("outreach_queue_items"));
      throw new Error(error.message);
    }
    return { ok: true };
  });
