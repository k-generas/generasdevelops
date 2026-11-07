// Phase 7: turn recorded investigation evidence into concrete solution
// recommendations, implementation requirements and platform-specific prompts.
// This module is pure so recommendation and prompt quality rules can be tested
// without calling AI or the database. AI may write the prompts, but it may not
// add facts that are not present in this evidence package.
import type { IntelFindings } from "@/lib/business-intel";
import { usableGaps, type OpportunityGap } from "@/lib/opportunity-engine";

export const SOLUTION_TYPES = [
  "website_new",
  "ordering_ecommerce",
  "booking_appointments",
  "website_repair",
  "maintenance",
  "custom_system",
  "automation",
  "other",
] as const;

export type SolutionType = (typeof SOLUTION_TYPES)[number];

export const SOLUTION_TYPE_LABELS: Record<SolutionType, string> = {
  website_new: "New website",
  ordering_ecommerce: "Ordering / e-commerce",
  booking_appointments: "Booking / appointments",
  website_repair: "Existing website repair",
  maintenance: "Website maintenance",
  custom_system: "Custom management system",
  automation: "Business automation",
  other: "Other supported digital solution",
};

export const SOLUTION_INTENTS = [
  "CREATE",
  "REPAIR",
  "IMPROVE",
  "MAINTAIN",
  "ANALYZE",
  "AUTOMATE",
] as const;

export type SolutionIntent = (typeof SOLUTION_INTENTS)[number];

export const SOLUTION_INTENT_LABELS: Record<SolutionIntent, string> = {
  CREATE: "Create",
  REPAIR: "Repair",
  IMPROVE: "Improve",
  MAINTAIN: "Maintain",
  ANALYZE: "Analyze",
  AUTOMATE: "Automate",
};

export const REQUESTED_DELIVERABLES = [
  "business_website",
  "online_ordering_website",
  "booking_website",
  "website_repair",
  "website_maintenance",
  "business_system",
  "automation",
  "analysis",
] as const;

export type RequestedDeliverable = (typeof REQUESTED_DELIVERABLES)[number];

export const REQUESTED_DELIVERABLE_LABELS: Record<RequestedDeliverable, string> = {
  business_website: "Customer-facing business website",
  online_ordering_website: "Online catalogue and ordering website",
  booking_website: "Service booking website",
  website_repair: "Repair of the existing website",
  website_maintenance: "Website maintenance plan",
  business_system: "Internal business management system",
  automation: "Business automation workflow",
  analysis: "Analysis and scoping deliverable",
};

const WEBSITE_DELIVERABLES: RequestedDeliverable[] = [
  "business_website",
  "online_ordering_website",
  "booking_website",
  "website_repair",
];

export function isWebsiteDeliverable(deliverable: RequestedDeliverable): boolean {
  return WEBSITE_DELIVERABLES.includes(deliverable);
}

export type SolutionClassification = {
  intent: SolutionIntent;
  requested_deliverable: RequestedDeliverable;
  ambiguous: boolean;
  clarification: string | null;
};

const WEBSITE_TERMS =
  /(website|web site|webpage|web page|landing page|web app|online store|online shop|e-?commerce|booking site|catalogue site|catalog site|online presence)/i;
const REPAIR_TERMS = /\b(repair|fix|broken|not working|offline|down|error|slow|bug)\b/i;
const MAINTAIN_TERMS =
  /\b(maintain|maintenance|keep .{0,30}(updated|secure|running)|backup|monitor|security update|ongoing support)\b/i;
const IMPROVE_TERMS = /\b(improve|upgrade|enhance|redesign|moderni[sz]e|optimi[sz]e|add|extend)\b/i;
const ANALYZE_TERMS =
  /\b(audit|assess|analysis|analy[sz]e|research|review|report|recommend|strategy|competitor)\b/i;
const AUTOMATE_TERMS =
  /\b(automat|workflow|reminder|follow[- ]?up|integration|internal tool|management system|crm|erp)\b/i;
const CREATE_TERMS = /\b(create|build|launch|design|develop|make|set up|new)\b/i;
const SYSTEM_TERMS =
  /\b(dashboard|internal tool|management system|crm|erp|portal|admin panel|database|reporting system)\b/i;
const AMBIGUOUS_TERMS =
  /\b(not sure|unsure|clarify|whatever|anything|some kind|maybe|decide for me)\b/i;

function websiteDeliverable(text: string): RequestedDeliverable {
  if (/\b(order|ordering|shop|store|e-?commerce|cart|checkout|catalogue|catalog)\b/i.test(text)) {
    return "online_ordering_website";
  }
  if (/\b(book|booking|appointment|appointments|reservation|schedule)\b/i.test(text)) {
    return "booking_website";
  }
  return "business_website";
}

export function defaultSolutionClassification(
  solutionType: SolutionType,
  hasWebsite = false,
): SolutionClassification {
  const base = {
    ambiguous: false,
    clarification: null,
  } satisfies Pick<SolutionClassification, "ambiguous" | "clarification">;
  if (solutionType === "website_new") {
    return { ...base, intent: "CREATE", requested_deliverable: "business_website" };
  }
  if (solutionType === "ordering_ecommerce") {
    return {
      ...base,
      intent: hasWebsite ? "IMPROVE" : "CREATE",
      requested_deliverable: "online_ordering_website",
    };
  }
  if (solutionType === "booking_appointments") {
    return {
      ...base,
      intent: hasWebsite ? "IMPROVE" : "CREATE",
      requested_deliverable: "booking_website",
    };
  }
  if (solutionType === "website_repair") {
    return { ...base, intent: "REPAIR", requested_deliverable: "website_repair" };
  }
  if (solutionType === "maintenance") {
    return { ...base, intent: "MAINTAIN", requested_deliverable: "website_maintenance" };
  }
  if (solutionType === "custom_system") {
    return { ...base, intent: "AUTOMATE", requested_deliverable: "business_system" };
  }
  if (solutionType === "automation") {
    return { ...base, intent: "AUTOMATE", requested_deliverable: "automation" };
  }
  return { ...base, intent: "ANALYZE", requested_deliverable: "analysis" };
}

export function classifySolutionRequest(args: {
  solution_type: SolutionType;
  requested_outcome?: string | null | undefined;
  has_website?: boolean;
}): SolutionClassification {
  const fallback = defaultSolutionClassification(args.solution_type, args.has_website);
  const text = (args.requested_outcome ?? "").trim();
  if (!text) return fallback;
  if (AMBIGUOUS_TERMS.test(text)) {
    return {
      ...fallback,
      ambiguous: true,
      clarification:
        "Please clarify the exact outcome the client wants before generating the implementation prompt.",
    };
  }

  const website = WEBSITE_TERMS.test(text);
  const repair = REPAIR_TERMS.test(text);
  const maintain = MAINTAIN_TERMS.test(text);
  const improve = IMPROVE_TERMS.test(text);
  const analyze = ANALYZE_TERMS.test(text);
  const automate = AUTOMATE_TERMS.test(text);
  const create = CREATE_TERMS.test(text);
  const system = SYSTEM_TERMS.test(text);

  if (website) {
    if (repair) {
      return {
        ...fallback,
        intent: "REPAIR",
        requested_deliverable: "website_repair",
      };
    }
    if (maintain) {
      return {
        ...fallback,
        intent: "MAINTAIN",
        requested_deliverable: "website_maintenance",
      };
    }
    if (improve) {
      return {
        ...fallback,
        intent: "IMPROVE",
        requested_deliverable: websiteDeliverable(text),
      };
    }
    if (analyze && !create) {
      return { ...fallback, intent: "ANALYZE", requested_deliverable: "analysis" };
    }
    if (create) {
      return {
        ...fallback,
        intent: "CREATE",
        requested_deliverable: websiteDeliverable(text),
      };
    }
  }

  if (analyze && !create) {
    return { ...fallback, intent: "ANALYZE", requested_deliverable: "analysis" };
  }
  if (maintain) {
    return {
      ...fallback,
      intent: "MAINTAIN",
      requested_deliverable: fallback.requested_deliverable,
    };
  }
  if (repair) {
    return {
      ...fallback,
      intent: "REPAIR",
      requested_deliverable: fallback.requested_deliverable,
    };
  }
  if (automate) {
    return {
      ...fallback,
      intent: "AUTOMATE",
      requested_deliverable: system ? "business_system" : "automation",
    };
  }
  if (improve) {
    return {
      ...fallback,
      intent: "IMPROVE",
      requested_deliverable: fallback.requested_deliverable,
    };
  }
  if (create) {
    return {
      ...fallback,
      intent: "CREATE",
      requested_deliverable: system ? "business_system" : fallback.requested_deliverable,
    };
  }
  return fallback;
}

export const PROMPT_PLATFORMS = [
  "opencode",
  "lovable",
  "google_ai_studio",
  "developer_spec",
] as const;

export type PromptPlatform = (typeof PROMPT_PLATFORMS)[number];

export const PROMPT_PLATFORM_LABELS: Record<PromptPlatform, string> = {
  opencode: "OpenCode",
  lovable: "Lovable",
  google_ai_studio: "Google AI Studio",
  developer_spec: "Developer spec",
};

export const RECOMMENDATION_STATUSES = ["recommended", "accepted", "dismissed"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const MAINTENANCE_STATUSES = [
  "recommended",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  recommended: "Recommended",
  accepted: "Accepted",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  recommended: ["accepted", "cancelled"],
  accepted: ["scheduled", "in_progress", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["recommended"],
};

export function allowedMaintenanceTransitions(from: MaintenanceStatus): MaintenanceStatus[] {
  return MAINTENANCE_TRANSITIONS[from];
}

export function canTransitionMaintenance(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return from === to || MAINTENANCE_TRANSITIONS[from].includes(to);
}

export function maintenanceCompletionError(
  status: MaintenanceStatus,
  completionNote: string | null | undefined,
): string | null {
  if (status !== "completed") return null;
  if ((completionNote ?? "").trim().length < 5) {
    return "Completed maintenance requires a short dated note or verification result.";
  }
  return null;
}

export type SolutionEvidenceKind = "verified_fact" | "evidence_backed_finding" | "hypothesis";

export type SolutionEvidence = {
  kind: SolutionEvidenceKind;
  label: string;
  detail: string;
  source: string;
  observed_at: string | null;
  ref: string | null;
};

export type RequirementPriority = "must" | "should" | "could";

export type SolutionRequirement = {
  requirement: string;
  rationale: string;
  priority: RequirementPriority;
  acceptance_criteria: string[];
};

export type SolutionRequirementGroup = {
  key: string;
  label: string;
  items: SolutionRequirement[];
};

export type SolutionRecommendationDraft = {
  solution_type: SolutionType;
  intent: SolutionIntent;
  requested_deliverable: RequestedDeliverable;
  title: string;
  summary: string;
  why_recommended: string;
  confidence: number;
  hypothesis: boolean;
  evidence: SolutionEvidence[];
  requirements: SolutionRequirementGroup[];
  assumptions: string[];
  unknowns: string[];
  maintenance_required: boolean;
  dedupe_key: string;
};

export type SolutionBusiness = {
  id: string;
  name: string;
  category?: string | null;
  address?: string | null;
  website?: string | null;
  website_check?: { confidence?: string | null; source?: string | null } | null;
  business_status?: string | null;
  rating?: number | null;
  review_count?: number | null;
  phone?: string | null;
  emails?: string[] | null;
  maps_url?: string | null;
  sector?: string | null;
  industry?: string | null;
  province?: string | null;
  district?: string | null;
  employees_min?: number | null;
  employees_max?: number | null;
};

export type SolutionFindings = IntelFindings & {
  https?: boolean | null;
  title?: string | null;
  meta_description?: string | null;
  text_excerpt?: string | null;
  socials?: Record<string, string> | null;
  error?: string | null;
};

export type SolutionReport = {
  overview?: string | null;
  problems?: { problem: string; evidence: string; severity: string }[] | null;
  recommended_offer?: string | null;
  offer_reasoning?: string | null;
  confidence?: string | null;
};

export type SolutionOpportunity = {
  id: string | null;
  title?: string | null;
  identified_problem?: string | null;
  relevant_service?: string | null;
  confidence?: number | null;
  validation_status?: string | null;
  qualification_stage?: string | null;
  gaps?: OpportunityGap[] | null;
};

export type SolutionInput = {
  business: SolutionBusiness;
  findings: SolutionFindings | null;
  report: SolutionReport | null;
  observedAt: string;
  investigationId: string | null;
  opportunity: SolutionOpportunity | null;
};

const ORDERING_CATEGORIES =
  /(retail|shop|store|market|boutique|restaurant|cafe|coffee|bakery|food|grocery|pharmacy|florist|furniture|fashion|electronics)/i;
const BOOKING_CATEGORIES =
  /(salon|spa|barber|beauty|nails|clinic|dental|medical|doctor|hotel|lodge|guest|consult|agency|training|school|gym|fitness|repair|service)/i;

function fact(
  label: string,
  detail: string,
  source: string,
  observedAt: string | null,
  ref: string | null = null,
): SolutionEvidence {
  return {
    kind: "verified_fact",
    label,
    detail,
    source,
    observed_at: observedAt,
    ref,
  };
}

function finding(
  label: string,
  detail: string,
  source: string,
  observedAt: string | null,
  ref: string | null = null,
): SolutionEvidence {
  return {
    kind: "evidence_backed_finding",
    label,
    detail,
    source,
    observed_at: observedAt,
    ref,
  };
}

function hypothesis(
  label: string,
  detail: string,
  source = "solution_engine",
  observedAt: string | null = null,
): SolutionEvidence {
  return {
    kind: "hypothesis",
    label,
    detail,
    source,
    observed_at: observedAt,
    ref: null,
  };
}

function uniqueEvidence(items: SolutionEvidence[]): SolutionEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.label}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function websiteConfirmedMissing(business: SolutionBusiness): boolean {
  return !business.website && business.website_check?.confidence === "none_found";
}

function businessFacts(business: SolutionBusiness): string[] {
  return [
    `Business: ${business.name}`,
    business.category ? `Category: ${business.category}` : "",
    business.address ? `Location: ${business.address}` : "",
    business.phone ? `Phone: ${business.phone}` : "",
    business.emails?.length ? `Public email: ${business.emails.join(", ")}` : "",
    business.website ? `Website: ${business.website}` : "",
    business.rating != null ? `Google rating: ${business.rating}` : "",
    business.review_count != null ? `Google reviews: ${business.review_count}` : "",
  ].filter(Boolean);
}

function commonAmbiguities(business: SolutionBusiness): {
  assumptions: string[];
  unknowns: string[];
} {
  const assumptions = [
    "The owner can confirm the final scope, budget and timeline before implementation.",
    "Only business facts shown in this brief may be used in public copy.",
    "Any service, price, photo, review or delivery claim not listed here must be supplied by the owner.",
  ];
  const unknowns = [
    "The owner's preferred brand voice, visual assets and examples are not confirmed.",
    "The owner's budget, deadline and decision process are not confirmed.",
    ...(business.website
      ? [
          "The current website's source code, hosting, analytics and admin access are not inspected.",
        ]
      : ["Domain ownership and hosting preference are not confirmed."]),
  ];
  return { assumptions, unknowns };
}

function baseRequirements(
  business: SolutionBusiness,
  evidence: SolutionEvidence[],
): SolutionRequirementGroup[] {
  const facts = businessFacts(business);
  return [
    {
      key: "context",
      label: "Business context and evidence",
      items: [
        {
          requirement: `Use only these verified or evidence-backed business facts: ${facts.join("; ")}.`,
          rationale: "Prevents invented copy, services, prices or contact details.",
          priority: "must",
          acceptance_criteria: [
            "Every public business fact in the build is traceable to the supplied evidence package.",
            "No placeholder telephone number, address, price, review or service is published.",
          ],
        },
        {
          requirement: `Treat these findings as the complete evidence base: ${evidence
            .map((item) => `${item.kind}: ${item.label}`)
            .join("; ")}.`,
          rationale: "Keeps recommendations tied to observed evidence rather than assumptions.",
          priority: "must",
          acceptance_criteria: [
            "Unsupported findings are labelled as hypotheses or omitted.",
            "The owner can identify which problem prompted each feature.",
          ],
        },
      ],
    },
    {
      key: "quality",
      label: "Quality, security and delivery",
      items: [
        {
          requirement:
            "Validate all user input, protect secrets on the server, and do not expose credentials or private business data.",
          rationale: "Basic security hygiene for any public-facing business system.",
          priority: "must",
          acceptance_criteria: [
            "No API key or secret appears in client code or the repository.",
            "Invalid form submissions show a useful error and are not stored.",
            "Sensitive actions require the documented authentication and authorisation rules.",
          ],
        },
        {
          requirement:
            "Handle loading, empty, success, validation-error and provider-error states explicitly.",
          rationale:
            "The business owner must be able to understand what happened without developer tools.",
          priority: "should",
          acceptance_criteria: [
            "Every data-driven screen has an empty state.",
            "Failed requests show a retry path and do not look successful.",
          ],
        },
        {
          requirement:
            "Provide automated tests for core logic and a manual acceptance checklist for the delivered experience.",
          rationale: "Evidence-based delivery needs verifiable completion, not claims.",
          priority: "must",
          acceptance_criteria: [
            "Core validation and workflow tests pass in the project test command.",
            "Every numbered acceptance criterion has a pass/fail result before handover.",
          ],
        },
      ],
    },
  ];
}

function requirementsFor(
  type: SolutionType,
  business: SolutionBusiness,
  evidence: SolutionEvidence[],
): SolutionRequirementGroup[] {
  const groups = baseRequirements(business, evidence);

  if (type === "website_new") {
    groups.push(
      {
        key: "pages",
        label: "Pages and components",
        items: [
          {
            requirement:
              "Build a responsive home page, services or products page, about page and contact page.",
            rationale: "Covers the minimum public information a prospective customer needs.",
            priority: "must",
            acceptance_criteria: [
              "Each page is reachable from the main navigation.",
              "The contact route is reachable in at most two clicks from the home page.",
            ],
          },
          {
            requirement:
              "Include a clear contact action using the verified phone, WhatsApp, email or map link; omit channels that are not verified.",
            rationale: "Creates a usable enquiry path without inventing contact details.",
            priority: "must",
            acceptance_criteria: [
              "Every displayed contact detail matches the evidence package.",
              "The primary contact action works on a mobile device.",
            ],
          },
        ],
      },
      {
        key: "journey",
        label: "User journeys and frontend",
        items: [
          {
            requirement:
              "A visitor can understand the offer, review the business location and contact the business without creating an account.",
            rationale: "The first website should reduce friction for a local customer.",
            priority: "must",
            acceptance_criteria: [
              "The home page states what the business does and where it operates.",
              "The visitor can reach a working contact action without signing in.",
            ],
          },
        ],
      },
      {
        key: "delivery",
        label: "Deployment and acceptance",
        items: [
          {
            requirement:
              "Prepare deployment instructions, environment variables and a documented content-update path.",
            rationale: "The owner must be able to run and maintain the site after handover.",
            priority: "should",
            acceptance_criteria: [
              "A fresh deployment can be completed from the written instructions.",
              "All pages return HTTP 200 in the production build.",
              "The layout works at 360px and 1280px viewport widths.",
            ],
          },
        ],
      },
    );
  }

  if (type === "website_repair") {
    groups.push(
      {
        key: "preserve",
        label: "Preserve the existing implementation",
        items: [
          {
            requirement:
              "Inspect the existing website before editing and preserve its content, branding, URLs and working integrations unless a change is explicitly required by the evidence.",
            rationale: "The confirmed problem is an existing site issue, not a reason to rebuild.",
            priority: "must",
            acceptance_criteria: [
              "Existing public URLs continue to resolve or have documented redirects.",
              "Unrelated pages, content and integrations are not rewritten.",
              "No destructive database or hosting operation is performed.",
            ],
          },
          {
            requirement:
              "Fix only the confirmed issues listed in the evidence package and record before/after measurements for each fix.",
            rationale: "Keeps the repair bounded and verifiable.",
            priority: "must",
            acceptance_criteria: [
              "Each repaired issue has a before and after observation.",
              "A fix that cannot be verified is reported as unverified rather than claimed complete.",
            ],
          },
        ],
      },
      {
        key: "verification",
        label: "Verification and rollback",
        items: [
          {
            requirement:
              "Create a safe rollback path and test the site after every material change.",
            rationale: "A repair must not make the live business site worse.",
            priority: "must",
            acceptance_criteria: [
              "The previous deploy or file state is recoverable.",
              "The repaired pages load successfully on mobile and desktop.",
              "Load time for the tested pages is measured and reported.",
            ],
          },
        ],
      },
    );
  }

  if (type === "booking_appointments") {
    groups.push(
      {
        key: "booking",
        label: "Booking flow",
        items: [
          {
            requirement:
              "Implement a service selection, preferred date/time, customer details and confirmation flow; do not imply live availability until the owner supplies a calendar or availability rules.",
            rationale: "Booking is only useful when availability and confirmation are real.",
            priority: "must",
            acceptance_criteria: [
              "A booking cannot be submitted without required customer and service fields.",
              "The confirmation message states whether the slot is confirmed or awaiting owner approval.",
              "The owner receives the booking through a documented channel.",
            ],
          },
        ],
      },
      {
        key: "backend",
        label: "Data, backend and integrations",
        items: [
          {
            requirement:
              "Persist bookings with a clear status, timestamps and owner-visible contact details; add a staff view only when roles are confirmed.",
            rationale: "Prevents lost enquiries and makes the workflow inspectable.",
            priority: "must",
            acceptance_criteria: [
              "Each booking has a unique identifier and a visible status.",
              "The owner can distinguish new, approved, completed and cancelled bookings.",
              "Duplicate submissions are prevented for the same customer and time request.",
            ],
          },
        ],
      },
    );
  }

  if (type === "ordering_ecommerce") {
    groups.push(
      {
        key: "catalogue",
        label: "Catalogue and ordering flow",
        items: [
          {
            requirement:
              "Build a catalogue with product name, description, price and availability only for products the owner confirms; include product detail and an order or checkout path.",
            rationale: "Accurate product data is required before an order can be taken.",
            priority: "must",
            acceptance_criteria: [
              "No product, price or stock claim is shown without owner-supplied data.",
              "A customer can add an item and review the order before submitting it.",
              "The owner can see the order details and customer contact.",
            ],
          },
        ],
      },
      {
        key: "payments",
        label: "Payments, delivery and operations",
        items: [
          {
            requirement:
              "Do not add online payments, delivery pricing, tax or stock automation until the owner confirms the provider, rules and operating process.",
            rationale: "Unconfirmed commercial rules create financial and trust risk.",
            priority: "must",
            acceptance_criteria: [
              "The checkout clearly states whether payment is online, on delivery or by arrangement.",
              "Delivery and payment assumptions are listed as unknowns when not confirmed.",
              "A failed payment or order request shows a recoverable error.",
            ],
          },
        ],
      },
    );
  }

  if (type === "custom_system" || type === "automation") {
    groups.push(
      {
        key: "workflow",
        label: "Workflow and roles",
        items: [
          {
            requirement:
              "Map the current manual workflow with the owner before designing screens; support only roles and approvals confirmed during discovery.",
            rationale: "Custom systems fail when they encode an assumed process.",
            priority: "must",
            acceptance_criteria: [
              "The documented process has an owner, trigger, inputs, outputs and exception path.",
              "Each role sees only the screens and data required for its work.",
              "The first release can be tested against a real historical example.",
            ],
          },
        ],
      },
      {
        key: "data",
        label: "Data model, audit and operations",
        items: [
          {
            requirement:
              "Model records, statuses and ownership explicitly, with validation, audit history and a backup/export path.",
            rationale: "Business records must be recoverable and accountable.",
            priority: "must",
            acceptance_criteria: [
              "Invalid status transitions are rejected.",
              "Every material change records who changed it and when.",
              "The owner can export their records without developer help.",
            ],
          },
        ],
      },
    );
  }

  if (type === "maintenance") {
    groups.push(
      {
        key: "maintenance",
        label: "Maintenance scope and records",
        items: [
          {
            requirement:
              "Create a real maintenance record before promising ongoing work; record the scope, cadence, next due date, owner and completion evidence.",
            rationale: "A maintenance recommendation must not become a placeholder promise.",
            priority: "must",
            acceptance_criteria: [
              "The maintenance record exists and is linked to this business and recommendation.",
              "Status moves only through the documented lifecycle.",
              "Completed maintenance includes a dated note or verification result.",
            ],
          },
        ],
      },
      {
        key: "checks",
        label: "Recurring checks",
        items: [
          {
            requirement:
              "Check uptime, HTTPS, mobile rendering, contact paths, broken links, backup status and content freshness on the agreed cadence.",
            rationale: "These checks map to the evidence already collected for the site.",
            priority: "should",
            acceptance_criteria: [
              "Each completed cycle records the date and outcome of every check.",
              "A failed check creates a follow-up action rather than being silently closed.",
            ],
          },
        ],
      },
    );
  }

  if (type === "other") {
    groups.push({
      key: "scope",
      label: "Scope discovery",
      items: [
        {
          requirement:
            "Define the exact supported digital solution, its user journey, data and acceptance criteria with the owner before implementation.",
          rationale: "The evidence does not justify a more specific solution yet.",
          priority: "must",
          acceptance_criteria: [
            "The owner confirms the problem and the proposed outcome.",
            "The scope lists what is explicitly out of scope.",
          ],
        },
      ],
    });
  }

  return groups;
}

function recommendation(
  type: SolutionType,
  input: SolutionInput,
  args: {
    summary: string;
    why: string;
    confidence: number;
    hypothesis: boolean;
    evidence: SolutionEvidence[];
    maintenanceRequired?: boolean;
  },
): SolutionRecommendationDraft {
  const evidence = uniqueEvidence(args.evidence);
  const { assumptions, unknowns } = commonAmbiguities(input.business);
  const classification = defaultSolutionClassification(
    type,
    Boolean(input.business.website?.trim()),
  );
  return {
    solution_type: type,
    intent: classification.intent,
    requested_deliverable: classification.requested_deliverable,
    title: `${input.business.name}: ${SOLUTION_TYPE_LABELS[type].toLowerCase()}`,
    summary: args.summary,
    why_recommended: args.why,
    confidence: clamp(args.confidence),
    hypothesis: args.hypothesis,
    evidence,
    requirements: requirementsFor(type, input.business, evidence),
    assumptions,
    unknowns,
    maintenance_required:
      args.maintenanceRequired ?? (type === "maintenance" || input.business.website != null),
    dedupe_key: `${input.investigationId ?? input.opportunity?.id ?? "business"}:${type}`,
  };
}

function opportunityEvidence(
  opportunity: SolutionOpportunity | null,
  at: string,
): SolutionEvidence[] {
  if (!opportunity) return [];
  const out: SolutionEvidence[] = [];
  if (opportunity.identified_problem?.trim()) {
    out.push(
      finding(
        "Recorded opportunity problem",
        opportunity.identified_problem.trim(),
        `opportunity:${opportunity.id ?? "unknown"}`,
        at,
        opportunity.id,
      ),
    );
  }
  for (const gap of usableGaps(opportunity.gaps ?? [])) {
    out.push(
      finding(
        `Recorded gap: ${gap.label}`,
        gap.evidence,
        gap.source,
        gap.last_checked_at,
        opportunity.id,
      ),
    );
  }
  return out;
}

export function buildSolutionRecommendations(input: SolutionInput): SolutionRecommendationDraft[] {
  const business = input.business;
  const findings = input.findings;
  const report = input.report;
  const at = input.observedAt;
  if (business.business_status === "CLOSED_PERMANENTLY") return [];

  const out: SolutionRecommendationDraft[] = [];
  const reportProblems = report?.problems ?? [];
  const reportEvidence = reportProblems.map((problem) =>
    finding(
      `Investigation finding: ${problem.problem}`,
      problem.evidence,
      "investigation_report",
      at,
      input.investigationId,
    ),
  );
  const opportunityEvidenceItems = opportunityEvidence(input.opportunity, at);

  if (websiteConfirmedMissing(business)) {
    out.push(
      recommendation("website_new", input, {
        summary:
          "Create a small, mobile-first business website with the verified business details and a clear enquiry path.",
        why: "The website was double-checked and none could be found, so there is no owned public web presence for customers to reach.",
        confidence: 0.82,
        hypothesis: false,
        evidence: [
          fact(
            "No website found after double-check",
            "The website verification completed without finding an owned website.",
            "website_check",
            at,
          ),
          ...reportEvidence,
          ...opportunityEvidenceItems,
        ],
      }),
    );
  }

  const hasWebsite = business.website != null || findings?.url != null;
  const siteIssueEvidence: SolutionEvidence[] = [];
  if (findings?.reachable === false) {
    siteIssueEvidence.push(
      finding(
        "Website did not load",
        `The website probe could not reach the site (status ${findings.status ?? "unknown"}).`,
        "website probe",
        at,
      ),
    );
  }
  if (findings?.https === false) {
    siteIssueEvidence.push(
      finding(
        "Website is not served over HTTPS",
        "The final website URL was not HTTPS.",
        "website probe",
        at,
      ),
    );
  }
  if (findings?.load_ms != null && findings.load_ms > 3000) {
    siteIssueEvidence.push(
      finding(
        "Website loads slowly",
        `The measured load time was ${findings.load_ms} ms, above the 3 second threshold.`,
        "website probe",
        at,
      ),
    );
  }
  if (findings?.has_viewport_meta === false) {
    siteIssueEvidence.push(
      finding(
        "Website is not mobile-ready",
        "No mobile viewport meta tag was found on the page.",
        "website probe",
        at,
      ),
    );
  }
  if (findings?.copyright_year != null) {
    const age = new Date(at).getFullYear() - findings.copyright_year;
    if (age >= 3) {
      siteIssueEvidence.push(
        finding(
          "Website content appears outdated",
          `The newest copyright year found on the site was ${findings.copyright_year}.`,
          "website probe",
          at,
        ),
      );
    }
  }
  if (findings?.reachable === true) {
    const hasContact =
      findings.has_contact_form === true ||
      findings.has_email_link === true ||
      findings.has_whatsapp_link === true;
    if (!hasContact) {
      siteIssueEvidence.push(
        finding(
          "No clear contact path on the website",
          "No contact form, email link or WhatsApp link was detected on the page.",
          "website probe",
          at,
        ),
      );
    }
  }

  const repairEvidence: SolutionEvidence[] = [];
  if (hasWebsite && (siteIssueEvidence.length > 0 || reportProblems.length > 0)) {
    repairEvidence.push(
      fact(
        "Existing website recorded",
        business.website ?? findings?.url ?? "A website URL is recorded for this business.",
        "business record",
        at,
      ),
      ...siteIssueEvidence,
      ...reportEvidence,
      ...opportunityEvidenceItems,
    );
  }

  if (repairEvidence.some((item) => item.kind !== "verified_fact")) {
    const evidenceCount = repairEvidence.filter(
      (item) => item.kind === "evidence_backed_finding",
    ).length;
    out.push(
      recommendation("website_repair", input, {
        summary:
          "Repair the existing website in place, fixing only the issues supported by the recorded evidence and preserving working content and URLs.",
        why: "The business already has a website, but the investigation recorded specific issues that can be repaired without replacing the whole site.",
        confidence: clamp(0.56 + evidenceCount * 0.07),
        hypothesis: evidenceCount === 1,
        evidence: repairEvidence,
      }),
    );
  }

  const category = `${business.category ?? ""} ${business.sector ?? ""} ${business.industry ?? ""}`;
  const bookingMissing =
    findings?.has_online_booking_or_shop === false && findings.reachable === true;
  if (bookingMissing && ORDERING_CATEGORIES.test(category)) {
    out.push(
      recommendation("ordering_ecommerce", input, {
        summary:
          "Add a confirmed product catalogue and a simple order request path, with payment and delivery rules confirmed by the owner first.",
        why: "The business category suggests it may sell products, and no online ordering or shop capability was detected on the existing website.",
        confidence: 0.52,
        hypothesis: true,
        evidence: [
          ...repairEvidence.filter((item) => item.kind !== "hypothesis"),
          hypothesis(
            "Online ordering may fit this business",
            "The category suggests product sales, but the owner has not confirmed demand, product data or fulfilment rules.",
            "solution_engine",
            at,
          ),
        ],
      }),
    );
  }

  if (bookingMissing && BOOKING_CATEGORIES.test(category)) {
    out.push(
      recommendation("booking_appointments", input, {
        summary:
          "Add a service request or appointment flow that records the customer, requested time and owner approval status.",
        why: "The business category suggests appointment-based work, and no booking capability was detected on the existing website.",
        confidence: 0.5,
        hypothesis: true,
        evidence: [
          ...repairEvidence.filter((item) => item.kind !== "hypothesis"),
          hypothesis(
            "Appointment booking may fit this business",
            "The category suggests appointments, but availability rules and owner capacity are not confirmed.",
            "solution_engine",
            at,
          ),
        ],
      }),
    );
  }

  const opportunityService = input.opportunity?.relevant_service ?? "";
  const opportunityGaps = input.opportunity?.gaps ?? [];
  const systemEvidence = [
    ...opportunityEvidenceItems,
    ...opportunityGaps
      .filter((gap) => gap.key === "no_contact_capture" || gap.key === "social_checkout_not_owned")
      .map((gap) =>
        finding(
          `Recorded operating gap: ${gap.label}`,
          gap.evidence,
          gap.source,
          gap.last_checked_at,
        ),
      ),
  ];
  if (
    systemEvidence.length > 0 &&
    /system|custom software|automation|dukalinka/i.test(opportunityService)
  ) {
    const confirmed =
      input.opportunity?.validation_status === "CONFIRMED" ||
      input.opportunity?.qualification_stage === "QUALIFIED" ||
      input.opportunity?.qualification_stage === "READY_TO_PROPOSE" ||
      input.opportunity?.qualification_stage === "WON";
    out.push(
      recommendation("custom_system", input, {
        summary:
          "Define a lightweight management workflow for the confirmed operational gap, starting with one real process and a measured before/after.",
        why: `The recorded opportunity points to ${opportunityService || "a systems solution"} and contains evidence about how the business currently handles the workflow.`,
        confidence: confirmed ? 0.72 : 0.55,
        hypothesis: !confirmed,
        evidence: systemEvidence,
        maintenanceRequired: true,
      }),
    );
  }

  if (hasWebsite && out.some((item) => item.solution_type === "website_repair")) {
    const repair = out.find((item) => item.solution_type === "website_repair")!;
    out.push(
      recommendation("maintenance", input, {
        summary:
          "Set up a real maintenance record for the existing site so the repaired issues stay fixed and future checks are documented.",
        why: "The site has recorded issues and no maintenance record exists in GARE. Ongoing checks are a recommendation, not evidence that the owner has accepted them.",
        confidence: clamp(repair.confidence - 0.08),
        hypothesis: true,
        evidence: [
          fact(
            "Existing website needs ongoing verification",
            "The investigation recorded website issues that can recur without a maintenance process.",
            "website probe",
            at,
          ),
          ...repair.evidence,
          hypothesis(
            "Owner may want ongoing maintenance",
            "The owner has not accepted a maintenance plan or agreed a cadence.",
            "solution_engine",
            at,
          ),
        ],
        maintenanceRequired: true,
      }),
    );
  }

  const seen = new Set<SolutionType>();
  return out.filter((item) => {
    if (seen.has(item.solution_type)) return false;
    seen.add(item.solution_type);
    return true;
  });
}

export type PromptQualityCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type PromptQuality = {
  score: number;
  pass: boolean;
  checks: PromptQualityCheck[];
};

const REQUIRED_SECTION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Objective", re: /^#{1,4}\s*objective\b/im },
  { label: "Business context", re: /^#{1,4}\s*business context\b/im },
  { label: "Verified facts", re: /^#{1,4}\s*(verified|known) facts\b/im },
  { label: "Problem and evidence", re: /^#{1,4}\s*problem (and|&) evidence\b/im },
  { label: "Users", re: /^#{1,4}\s*(users|audience)\b/im },
  { label: "Requirements", re: /^#{1,4}\s*requirements\b/im },
  { label: "Pages and components", re: /^#{1,4}\s*(pages|screens) (and|&) components\b/im },
  { label: "User journeys", re: /^#{1,4}\s*(user )?journeys?\b/im },
  { label: "Data and backend", re: /^#{1,4}\s*(data|database|backend).{0,30}$/im },
  { label: "Frontend", re: /^#{1,4}\s*(frontend|front-end|ui)\b/im },
  { label: "Integrations", re: /^#{1,4}\s*integrations?\b/im },
  { label: "Auth, security and privacy", re: /^#{1,4}\s*(auth|security|privacy).{0,50}$/im },
  { label: "Responsive design", re: /^#{1,4}\s*(responsive|mobile)\b/im },
  { label: "Error and empty states", re: /^#{1,4}\s*(error|empty).{0,50}$/im },
  { label: "Tests", re: /^#{1,4}\s*(tests?|testing|verification)\b/im },
  { label: "Acceptance criteria", re: /^#{1,4}\s*acceptance criteria\b/im },
  { label: "Deployment", re: /^#{1,4}\s*(deployment|handover|release)\b/im },
  { label: "Assumptions and unknowns", re: /^#{1,4}\s*(assumptions|unknowns|open questions)\b/im },
];

const WEBSITE_SECTION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "A. Build objective", re: /^#{1,4}\s*A\.\s*Build objective\b/im },
  { label: "B. Business context", re: /^#{1,4}\s*B\.\s*Business context\b/im },
  { label: "C. Verified information", re: /^#{1,4}\s*C\.\s*Verified information\b/im },
  {
    label: "D. Customer problem and website purpose",
    re: /^#{1,4}\s*D\.\s*Customer problem and website purpose\b/im,
  },
  { label: "E. Website structure", re: /^#{1,4}\s*E\.\s*Website structure\b/im },
  { label: "F. Functional requirements", re: /^#{1,4}\s*F\.\s*Functional requirements\b/im },
  { label: "G. Design requirements", re: /^#{1,4}\s*G\.\s*Design requirements\b/im },
  { label: "H. Administration", re: /^#{1,4}\s*H\.\s*Administration\b/im },
  { label: "I. Technical requirements", re: /^#{1,4}\s*I\.\s*Technical requirements\b/im },
  { label: "J. Missing information", re: /^#{1,4}\s*J\.\s*Missing information\b/im },
  {
    label: "K. Build execution instructions",
    re: /^#{1,4}\s*K\.\s*Build execution instructions\b/im,
  },
  { label: "L. Acceptance criteria", re: /^#{1,4}\s*L\.\s*Acceptance criteria\b/im },
];

function platformCheck(
  platform: PromptPlatform,
  prompt: string,
  website: boolean,
): PromptQualityCheck {
  const tests: Record<PromptPlatform, RegExp[]> = {
    opencode: [/opencode|repository|existing code/i, /inspect|read|search/i, /test|verify/i],
    lovable: [/lovable/i, /build|implement/i, /preview|publish|deploy/i],
    google_ai_studio: website
      ? [/google ai studio/i, /build|generate|implement/i, /preview|export|deploy|publish/i]
      : [
          /google ai studio|gemini/i,
          /model|api key|structured output|analysis|automation/i,
          /preview|export|deploy|publish/i,
        ],
    developer_spec: [/specification|implementation brief|developer/i, /acceptance|deliverable/i],
  };
  const missing = tests[platform].filter((re) => !re.test(prompt));
  return missing.length === 0
    ? {
        key: "platform",
        label: "Platform appropriateness",
        status: "pass",
        detail: `${PROMPT_PLATFORM_LABELS[platform]} instructions are present.`,
      }
    : {
        key: "platform",
        label: "Platform appropriateness",
        status: "fail",
        detail: `Missing ${PROMPT_PLATFORM_LABELS[platform]} instructions or workflow terms.`,
      };
}

export function validatePromptQuality(
  prompt: string,
  platform: PromptPlatform,
  recommendation: Pick<
    SolutionRecommendationDraft,
    | "solution_type"
    | "intent"
    | "requested_deliverable"
    | "evidence"
    | "requirements"
    | "hypothesis"
  >,
): PromptQuality {
  const checks: PromptQualityCheck[] = [];
  const trimmed = prompt.trim();
  const website = isWebsiteDeliverable(recommendation.requested_deliverable);
  const sectionPatterns = website ? WEBSITE_SECTION_PATTERNS : REQUIRED_SECTION_PATTERNS;

  const missingSections = sectionPatterns.filter((section) => !section.re.test(trimmed));
  checks.push(
    missingSections.length === 0
      ? {
          key: "sections",
          label: "Required brief sections",
          status: "pass",
          detail: "All required implementation sections are present.",
        }
      : {
          key: "sections",
          label: "Required brief sections",
          status: "fail",
          detail: `Missing: ${missingSections.map((section) => section.label).join(", ")}.`,
        },
  );

  const evidenceCount = recommendation.evidence.filter((item) => item.kind !== "hypothesis").length;
  const hypotheses = recommendation.evidence.filter((item) => item.kind === "hypothesis").length;
  checks.push(
    evidenceCount === 0
      ? {
          key: "evidence",
          label: "Evidence sufficiency",
          status: "fail",
          detail: "The recommendation has no factual or evidence-backed findings.",
        }
      : recommendation.hypothesis
        ? {
            key: "evidence",
            label: "Evidence sufficiency",
            status: "warn",
            detail: `The brief contains ${evidenceCount} supported finding(s) and ${hypotheses} hypothesis item(s); the hypothesis must remain labelled.`,
          }
        : {
            key: "evidence",
            label: "Evidence sufficiency",
            status: "pass",
            detail: `${evidenceCount} supported finding(s) are available for the brief.`,
          },
  );

  const requirementCount = recommendation.requirements.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const acceptanceCount = recommendation.requirements.reduce(
    (total, group) =>
      total + group.items.reduce((n, item) => n + item.acceptance_criteria.length, 0),
    0,
  );
  checks.push(
    requirementCount >= 4 && acceptanceCount >= 4
      ? {
          key: "requirements",
          label: "Requirement clarity",
          status: "pass",
          detail: `${requirementCount} requirements and ${acceptanceCount} acceptance criteria are defined.`,
        }
      : {
          key: "requirements",
          label: "Requirement clarity",
          status: "warn",
          detail:
            "The recommendation should define at least four requirements and four acceptance criteria.",
        },
  );

  const measurable =
    /(http 200|http status|seconds?|milliseconds?|ms\b|viewport|360px|1280px|given .* when .* then|at least \d+|no more than \d+)/i.test(
      trimmed,
    );
  checks.push(
    measurable
      ? {
          key: "measurable",
          label: "Measurable acceptance",
          status: "pass",
          detail: "At least one measurable acceptance signal is present.",
        }
      : {
          key: "measurable",
          label: "Measurable acceptance",
          status: "fail",
          detail: "Acceptance criteria must include a measurable pass condition.",
        },
  );

  const security =
    /(auth|authoris|authoriz|permission|role|rls|row level|secret|sanitiz|validat|privacy|csrf|xss|injection)/i.test(
      trimmed,
    );
  checks.push(
    security
      ? {
          key: "security",
          label: "Security and privacy",
          status: "pass",
          detail: "Security or privacy requirements are present.",
        }
      : {
          key: "security",
          label: "Security and privacy",
          status: "fail",
          detail:
            "The brief must include authentication, authorisation, validation or privacy requirements.",
        },
  );

  const expectedIntent = `Intent: ${recommendation.intent}`;
  const expectedDeliverable = `Requested deliverable: ${REQUESTED_DELIVERABLE_LABELS[recommendation.requested_deliverable]}`;
  const hasIntent = new RegExp(`^${expectedIntent}$`, "im").test(trimmed);
  const hasDeliverable = new RegExp(`^${expectedDeliverable}$`, "im").test(trimmed);
  checks.push(
    hasIntent && hasDeliverable
      ? {
          key: "scope",
          label: "Intent and deliverable alignment",
          status: "pass",
          detail: `The prompt states ${SOLUTION_INTENT_LABELS[recommendation.intent]} and ${REQUESTED_DELIVERABLE_LABELS[recommendation.requested_deliverable].toLowerCase()}.`,
        }
      : {
          key: "scope",
          label: "Intent and deliverable alignment",
          status: "fail",
          detail:
            "The prompt must state the classified intent and the exact requested deliverable near the top.",
        },
  );

  const drift =
    /(build|create|produce|develop|generate|implement)\s+an?\s+.{0,80}(audit(ing)? application|ai content audit|business intelligence dashboard|compliance checker|prompt generator|reporting tool|internal gare feature)/i.test(
      trimmed,
    );
  if (website) {
    const requestedWebsite =
      /(build|create|produce)\s+an?\s+(complete,\s*responsive,\s*customer-facing website|online catalogue and ordering website|service booking website)/i.test(
        trimmed,
      );
    const requestedRepair = /repair the existing website/i.test(trimmed);
    const requestedImprove =
      /(improve|upgrade|extend|add).{0,80}(existing website|website|online catalogue|booking)/i.test(
        trimmed,
      );
    const positiveRebuild =
      /(rebuild|start from scratch|delete the existing website|replace the (existing|entire|whole) (website|site))/i.test(
        trimmed,
      );
    const aligned =
      (recommendation.intent === "REPAIR"
        ? requestedRepair
        : recommendation.intent === "IMPROVE"
          ? requestedImprove
          : requestedWebsite) &&
      !drift &&
      !(recommendation.intent === "REPAIR" && positiveRebuild);
    checks.push(
      aligned
        ? {
            key: "deliverable",
            label: "Requested website deliverable",
            status: "pass",
            detail:
              "The prompt asks for the requested website or repair and does not redirect the build to an unrelated product.",
          }
        : {
            key: "deliverable",
            label: "Requested website deliverable",
            status: "fail",
            detail:
              "A website prompt must build or repair the requested website and must not drift into an audit, dashboard, compliance, prompt-generation, reporting or internal GARE product.",
          },
    );
  } else {
    const wrongWebsite =
      /(build|create|produce)\s+an?\s+(complete,\s*responsive,\s*customer-facing website|online catalogue and ordering website|service booking website)/i.test(
        trimmed,
      );
    checks.push(
      !wrongWebsite && !drift
        ? {
            key: "deliverable",
            label: "Requested deliverable alignment",
            status: "pass",
            detail: "The prompt stays within the classified non-website deliverable.",
          }
        : {
            key: "deliverable",
            label: "Requested deliverable alignment",
            status: "fail",
            detail:
              "The prompt must not replace the classified deliverable with a website or unrelated product.",
          },
    );
  }

  checks.push(platformCheck(platform, trimmed, website));

  const contradiction =
    recommendation.solution_type === "website_repair"
      ? /(rebuild|start from scratch|delete the existing website|replace the (existing|entire|whole) (website|site))/i.test(
          trimmed,
        )
      : recommendation.solution_type === "website_new"
        ? /(preserve the existing website|keep the current website)/i.test(trimmed)
        : false;
  checks.push(
    contradiction
      ? {
          key: "contradiction",
          label: "No scope contradiction",
          status: "fail",
          detail:
            recommendation.solution_type === "website_repair"
              ? "A repair prompt must preserve the existing site rather than rebuild it."
              : "A new-website prompt must not assume an existing website to preserve.",
        }
      : {
          key: "contradiction",
          label: "No scope contradiction",
          status: "pass",
          detail: "The brief does not contradict the recommended solution type.",
        },
  );

  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        checks.filter((check) => check.status === "fail").length * 18 -
        checks.filter((check) => check.status === "warn").length * 7,
    ),
  );
  return {
    score,
    pass: checks.every((check) => check.status !== "fail") && score >= 70,
    checks,
  };
}

export function latestPromptPerPlatform<T extends { platform: string; version: number }>(
  rows: T[],
): T[] {
  const byPlatform = new Map<string, T>();
  for (const row of rows) {
    const prior = byPlatform.get(row.platform);
    if (!prior || row.version > prior.version) byPlatform.set(row.platform, row);
  }
  return PROMPT_PLATFORMS.flatMap((platform) => {
    const row = byPlatform.get(platform);
    return row ? [row] : [];
  });
}
