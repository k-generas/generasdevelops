import {
  CONTACT_CHANNELS,
  contactChannelLabel,
  type ContactChannel,
  type OutreachEligibility,
} from "./compliance";

export const CAMPAIGN_STATUSES = [
  "draft",
  "ready",
  "running",
  "paused",
  "completed",
  "archived",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const QUEUE_STATUSES = [
  "draft",
  "needs_review",
  "blocked",
  "approved",
  "sent",
  "skipped",
] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const CAMPAIGN_AUDIENCE_KINDS = ["business", "professional"] as const;

export type CampaignAudienceKind = (typeof CAMPAIGN_AUDIENCE_KINDS)[number];

export type Campaign = {
  id: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  audienceKind: CampaignAudienceKind;
  dailyLimit: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignStep = {
  id: string;
  campaignId: string;
  stepOrder: number;
  channel: ContactChannel;
  delayDays: number;
  subjectTemplate: string | null;
  bodyTemplate: string;
  requiresApproval: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CampaignStepInput = {
  stepOrder: number;
  channel: ContactChannel;
  delayDays: number;
  subjectTemplate?: string | null;
  bodyTemplate: string;
  requiresApproval?: boolean;
  active?: boolean;
};

export type CampaignTarget = {
  kind: CampaignAudienceKind;
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  domain?: string | null;
  country?: string | null;
  website?: string | null;
  context?: string | null;
  doNotContact?: boolean;
};

export type CampaignQueueItem = {
  id: string;
  campaignId: string;
  stepId: string;
  businessId: string | null;
  professionalId: string | null;
  channel: ContactChannel;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientDomain: string | null;
  country: string | null;
  status: QueueStatus;
  eligibility: OutreachEligibility | null;
  draftSubject: string | null;
  draftBody: string;
  approvedAt: string | null;
  sentAt: string | null;
  ownerNote: string | null;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignValidationInput = {
  name: string;
  dailyLimit: number;
  steps: CampaignStepInput[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function campaignStatusLabel(status: CampaignStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function queueStatusLabel(status: QueueStatus): string {
  const labels: Record<QueueStatus, string> = {
    draft: "Draft",
    needs_review: "Needs review",
    blocked: "Blocked",
    approved: "Approved",
    sent: "Sent manually",
    skipped: "Skipped",
  };
  return labels[status];
}

export function audienceKindLabel(kind: CampaignAudienceKind): string {
  return kind === "business" ? "Businesses" : "Professionals";
}

export function stepChannelLabel(channel: ContactChannel): string {
  return contactChannelLabel(channel);
}

export function stepDelayLabel(days: number): string {
  if (days <= 0) return "Same day";
  if (days === 1) return "Next day";
  return `After ${days} days`;
}

export function templateVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    found.add((match[1] ?? "").toLowerCase());
  }
  return [...found].sort();
}

export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return template
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
      const value = variables[key.toLowerCase()];
      return value === null || value === undefined ? "" : String(value);
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function ensureOptOutRoute(body: string): string {
  const trimmed = body.trim();
  if (/(unsubscribe|opt[ -]?out|reply stop|do not contact)/i.test(trimmed)) return trimmed;
  return `${trimmed}\n\nIf this is not relevant, reply STOP and we will not contact you again.`.trim();
}

export function targetVariables(target: CampaignTarget): Record<string, string> {
  const firstName = target.name.trim().split(/\s+/)[0] ?? "";
  return {
    name: target.name,
    first_name: firstName,
    business: target.kind === "business" ? target.name : "",
    country: target.country ?? "",
    website: target.website ?? "",
    email: target.email ?? "",
    phone: target.phone ?? "",
    context: target.context ?? "",
  };
}

export function renderCampaignDraft(
  step: Pick<CampaignStepInput, "channel" | "subjectTemplate" | "bodyTemplate">,
  target: CampaignTarget,
): { subject: string | null; body: string } {
  const variables = targetVariables(target);
  const subject = step.subjectTemplate?.trim()
    ? renderTemplate(step.subjectTemplate, variables)
    : null;
  const body = ensureOptOutRoute(renderTemplate(step.bodyTemplate, variables));
  return { subject: subject || null, body };
}

export function campaignDedupeKey(
  kind: CampaignAudienceKind,
  id: string,
  stepOrder: number,
): string {
  return `${kind}:${id.trim().toLowerCase()}:step:${stepOrder}`;
}

export function campaignTargetDedupeKey(target: CampaignTarget, stepOrder: number): string {
  return campaignDedupeKey(target.kind, target.id, stepOrder);
}

export function validateCampaignSteps(steps: CampaignStepInput[]): ValidationResult {
  const errors: string[] = [];
  if (steps.length === 0) errors.push("Add at least one sequence step.");
  if (steps.length > 20) errors.push("A campaign can have at most 20 steps.");

  const orders = new Set<number>();
  for (const step of steps) {
    if (!Number.isInteger(step.stepOrder) || step.stepOrder < 1) {
      errors.push("Every step needs a positive order number.");
    }
    if (orders.has(step.stepOrder)) errors.push(`Step order ${step.stepOrder} is duplicated.`);
    orders.add(step.stepOrder);
    if (!CONTACT_CHANNELS.includes(step.channel)) errors.push("Choose a valid step channel.");
    if (!Number.isInteger(step.delayDays) || step.delayDays < 0 || step.delayDays > 90) {
      errors.push(`Step ${step.stepOrder} delay must be between 0 and 90 days.`);
    }
    if (!step.bodyTemplate.trim()) errors.push(`Step ${step.stepOrder} needs a message body.`);
    if (step.bodyTemplate.length > 8000) errors.push(`Step ${step.stepOrder} body is too long.`);
    if ((step.subjectTemplate ?? "").length > 300) {
      errors.push(`Step ${step.stepOrder} subject is too long.`);
    }
    if (
      (step.channel === "email" || step.channel === "contact_form") &&
      !(step.subjectTemplate ?? "").trim()
    ) {
      errors.push(`Step ${step.stepOrder} needs a subject for ${stepChannelLabel(step.channel)}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateCampaign(input: CampaignValidationInput): ValidationResult {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Campaign name is required.");
  if (input.name.trim().length > 160) errors.push("Campaign name must be 160 characters or less.");
  if (!Number.isInteger(input.dailyLimit) || input.dailyLimit < 1 || input.dailyLimit > 500) {
    errors.push("Daily review limit must be between 1 and 500.");
  }
  errors.push(...validateCampaignSteps(input.steps).errors);
  return { valid: errors.length === 0, errors };
}

export function queueStatusFromEligibility(eligibility: OutreachEligibility): QueueStatus {
  return eligibility.status === "blocked" ? "blocked" : "needs_review";
}

const TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  draft: ["needs_review", "skipped"],
  needs_review: ["approved", "blocked", "skipped"],
  blocked: ["needs_review", "skipped"],
  approved: ["sent", "skipped"],
  sent: [],
  skipped: [],
};

export function canTransitionQueue(from: QueueStatus, to: QueueStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canApproveQueueItem(
  item: Pick<CampaignQueueItem, "status" | "eligibility" | "draftBody">,
  ownerConfirmedLawfulBasis: boolean,
): { allowed: boolean; reason: string | null } {
  if (item.status !== "needs_review")
    return { allowed: false, reason: "Only review items can be approved." };
  if (item.eligibility?.status === "blocked") {
    return { allowed: false, reason: "Blocked contacts cannot be approved." };
  }
  if (!item.draftBody.trim()) return { allowed: false, reason: "The message draft is empty." };
  if (!ownerConfirmedLawfulBasis) {
    return { allowed: false, reason: "Confirm the lawful basis before approving this contact." };
  }
  return { allowed: true, reason: null };
}

export function canMarkQueueSent(
  item: Pick<CampaignQueueItem, "status">,
  ownerConfirmedManualSend: boolean,
): { allowed: boolean; reason: string | null } {
  if (item.status !== "approved") return { allowed: false, reason: "Approve the item first." };
  if (!ownerConfirmedManualSend) {
    return {
      allowed: false,
      reason: "Confirm that the message was sent manually outside this app.",
    };
  }
  return { allowed: true, reason: null };
}

export type CampaignSummary = {
  total: number;
  needsReview: number;
  blocked: number;
  approved: number;
  sent: number;
  skipped: number;
};

export function campaignSummary(items: Pick<CampaignQueueItem, "status">[]): CampaignSummary {
  return {
    total: items.length,
    needsReview: items.filter((item) => item.status === "needs_review").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    approved: items.filter((item) => item.status === "approved").length,
    sent: items.filter((item) => item.status === "sent").length,
    skipped: items.filter((item) => item.status === "skipped").length,
  };
}
