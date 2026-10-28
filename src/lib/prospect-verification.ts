// Evidence-based prospect verification and digital-gap classification.
//
// This module encodes the GARE verification standard:
//   - absence of evidence is not proof of absence;
//   - website status, online presence, operating status, identity confidence and
//     search coverage are separate fields;
//   - every classification must cite recorded checks and dates;
//   - checks that were never performed are labelled as such, never as failures;
//   - a digital gap is not proof that a business wants to buy anything.
//
// It is pure and deterministic: callers pass the stored business row, the
// website double-check result and (when available) the website probe findings.
import { deriveObservedProblems } from "@/lib/business-intel";
import { PROBLEM_KEYS } from "@/lib/service-match";
import { classifyIndustry, industryLabel, type IndustryKey } from "@/lib/rwanda";

export type WebsiteStatus =
  | "WEBSITE_VERIFIED"
  | "NO_WEBSITE_FOUND_HIGH_COVERAGE"
  | "POSSIBLE_HIDDEN_WEBSITE"
  | "WEBSITE_BROKEN_OR_INACTIVE"
  | "NOT_CHECKED";

export type PresenceStatus =
  | "MULTI_CHANNEL_PRESENCE"
  | "SOCIAL_OR_MARKETPLACE_ONLY"
  | "LIMITED_PRESENCE_FOUND"
  | "NO_CREDIBLE_PRESENCE_FOUND_HIGH_COVERAGE"
  | "PRESENCE_UNCERTAIN"
  | "NOT_CHECKED";

export type CommercialPriority = "A" | "B" | "C" | "MANUAL_REVIEW";

export type CoverageLevel = "high" | "medium" | "low" | "none";

export type CheckResult =
  | "performed_positive"
  | "performed_negative"
  | "partial"
  | "failed"
  | "not_performed"
  | "blocked"
  | "not_applicable";

export type ManufacturingStatus = "supported" | "not_supported" | "unknown";

export type OperatingStatus =
  | "operating_evidence"
  | "possibly_dormant"
  | "closed_permanently"
  | "closed_temporarily"
  | "unknown";

export type RwandaLocation = "rwanda" | "other" | "unknown";

export type VerificationBusiness = {
  name?: string | null;
  legal_name?: string | null;
  trading_names?: string[] | null;
  category?: string | null;
  description?: string | null;
  products_services?: string | null;
  sector?: string | null;
  industry?: string | null;
  industry_secondary?: string | null;
  business_model?: string | null;
  supply_chain_role?: string | null;
  parent_organization?: string | null;
  address?: string | null;
  district?: string | null;
  province?: string | null;
  phone?: string | null;
  emails?: string[] | null;
  website?: string | null;
  website_source?: string | null;
  website_checked_at?: string | null;
  activity_checked_at?: string | null;
  website_check?: unknown;
  socials?: unknown;
  maps_url?: string | null;
  place_id?: string | null;
  business_status?: string | null;
  open_now?: boolean | null;
  last_activity_at?: string | null;
  reviews_last_90d?: number | null;
  registration_id?: string | null;
  location_verified?: boolean | null;
  employees_min?: number | null;
  employees_max?: number | null;
};

export type VerificationFindings = {
  url?: string | null;
  reachable?: boolean | null;
  status?: number | null;
  error?: string | null;
  parked?: boolean | null;
  load_ms?: number | null;
  has_viewport_meta?: boolean | null;
  has_contact_form?: boolean | null;
  has_email_link?: boolean | null;
  has_whatsapp_link?: boolean | null;
  has_online_booking_or_shop?: boolean | null;
  copyright_year?: number | null;
  socials?: Record<string, string> | null;
};

export type StoredWebsiteCheckEntry = {
  id: string;
  status: "positive" | "negative" | "truncated" | "not_performed" | string;
  detail?: string | null;
};

export type StoredWebsiteCheck = {
  confidence?: string | null | undefined;
  source?: string | null | undefined;
  steps?: { step: string; result: string }[] | undefined;
  truncated?: boolean | undefined;
  candidates_tested?: number | undefined;
  checked_at?: string | undefined;
  checks?: StoredWebsiteCheckEntry[] | undefined;
};

export type PlatformSearch = {
  performed: boolean;
  found?: string[];
  error?: string | null;
};

export type ProspectVerificationInput = {
  business: VerificationBusiness;
  findings?: VerificationFindings | null;
  websiteCheck?: StoredWebsiteCheck | null;
  // Date the website probe / investigation was observed.
  observedAt?: string | null;
  now?: Date;
  // Only set these when an actual platform or directory search was run.
  socialSearch?: PlatformSearch;
  directorySearch?: PlatformSearch;
  marketplaceSearch?: PlatformSearch;
};

export type CoverageReport = {
  score_0_100: number;
  level: CoverageLevel;
  performed_weight: number;
  applicable_weight: number;
  note: string;
};

export type EvidenceLogEntry = {
  check_id: string;
  source: string;
  url: string | null;
  query_or_check: string;
  observation: string;
  checked_at: string;
  result: CheckResult;
  confidence_0_100: number;
};

export type DigitalGap = {
  key: string;
  label: string;
  evidence: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  observed_at: string;
  source: string;
};

export type ManufacturingEvidence = {
  status: ManufacturingStatus;
  basis: string;
  products_evidence: string | null;
  industry: IndustryKey | null;
};

export type OperatingEvidence = {
  status: OperatingStatus;
  evidence: string;
  last_observed_activity_at: string | null;
};

export type IdentityAssessment = {
  score_0_100: number;
  reasons: string[];
  aliases: string[];
};

export type ServiceOpportunity = {
  summary: string;
  basis: string;
  limitation: string;
};

export type ProspectVerification = {
  website_status: WebsiteStatus;
  website_status_reason: string;
  online_presence_status: PresenceStatus;
  online_presence_reason: string;
  operating_status: OperatingStatus;
  operating_evidence: string;
  last_observed_activity_at: string | null;
  manufacturing_evidence: ManufacturingEvidence;
  identity_confidence_0_100: number;
  identity_reasons: string[];
  rwanda_location: RwandaLocation;
  website_coverage: CoverageReport;
  presence_coverage: CoverageReport;
  checks_performed: string[];
  checks_failed: string[];
  checks_not_performed: string[];
  evidence_log: EvidenceLogEntry[];
  digital_gap: DigitalGap[];
  service_opportunity: ServiceOpportunity | null;
  commercial_priority: CommercialPriority;
  commercial_score_0_100: number;
  priority_reasons: string[];
  uncertainties: string[];
  contradictions: string[];
  next_verification_step: string;
  generated_at: string;
};

type CheckId =
  | "places_listing"
  | "place_details"
  | "domain_candidates"
  | "free_hosting"
  | "website_identity"
  | "website_probe"
  | "google_business"
  | "social_platforms"
  | "directories"
  | "marketplaces"
  | "registry"
  | "social_links_on_website"
  | "public_contact";

type CheckDefinition = {
  id: CheckId;
  label: string;
  source: string;
  weight: number;
  applies: "always" | "website" | "no_website";
};

const WEBSITE_CHECK_DEFS: CheckDefinition[] = [
  {
    id: "places_listing",
    label: "Places listing",
    source: "Google Places / Geoapify listing",
    weight: 25,
    applies: "always",
  },
  {
    id: "place_details",
    label: "Fresh place-details lookup",
    source: "Places place details",
    weight: 20,
    applies: "no_website",
  },
  {
    id: "domain_candidates",
    label: "Likely domain checks",
    source: "Domain probe",
    weight: 30,
    applies: "no_website",
  },
  {
    id: "free_hosting",
    label: "Free-hosting / website-builder checks",
    source: "Hosted-site probe",
    weight: 25,
    applies: "no_website",
  },
  {
    id: "website_identity",
    label: "Website linked to this business",
    source: "Website identity check",
    weight: 15,
    applies: "website",
  },
  {
    id: "website_probe",
    label: "Website reachability probe",
    source: "Website probe",
    weight: 10,
    applies: "website",
  },
];

const PRESENCE_CHECK_DEFS: CheckDefinition[] = [
  {
    id: "google_business",
    label: "Google Business / Maps profile",
    source: "Google Maps",
    weight: 30,
    applies: "always",
  },
  {
    id: "website_identity",
    label: "Independent website",
    source: "Website",
    weight: 30,
    applies: "website",
  },
  {
    id: "social_platforms",
    label: "Social platform search",
    source: "Social platforms",
    weight: 20,
    applies: "always",
  },
  {
    id: "directories",
    label: "Business directory search",
    source: "Directories",
    weight: 10,
    applies: "always",
  },
  {
    id: "marketplaces",
    label: "Marketplace search",
    source: "Marketplaces",
    weight: 10,
    applies: "always",
  },
];

const EXTRA_CHECK_DEFS: CheckDefinition[] = [
  {
    id: "registry",
    label: "Registration / registry lookup",
    source: "Business registry",
    weight: 0,
    applies: "always",
  },
  {
    id: "social_links_on_website",
    label: "Social links found on the website",
    source: "Website content",
    weight: 0,
    applies: "always",
  },
  {
    id: "public_contact",
    label: "Public contact details",
    source: "Listing / website",
    weight: 0,
    applies: "always",
  },
];

const ALL_DEFS = [...WEBSITE_CHECK_DEFS, ...PRESENCE_CHECK_DEFS, ...EXTRA_CHECK_DEFS];

const PERFORMED = new Set<CheckResult>(["performed_positive", "performed_negative"]);

const RWANDA_HINT =
  /\brwanda\b|kigali|gasabo|kicukiro|nyarugenge|musanze|huye|rubavu|rusizi|nyagatare|rwamagana|muhanga|nyanza/i;
const FOREIGN_HINT =
  /\bkenya\b|\buganda\b|\btanzania\b|\bburundi\b|\bnigeria\b|south africa|nairobi|kampala|dar es salaam|mombasa|bujumbura|lubumbashi|goma|dubai|china|india|turkey|united states|usa\b|united kingdom/i;

const MANUFACTURING_HINT =
  /manufactur|factory|production|assembly|plant|foundry|fabricat|processing|mill|workshop|industrial/i;
const NON_MANUFACTURING_HINT =
  /retail|shop|store|supermarket|distributor|wholesale|importer|trader|dealer|boutique|restaurant|hotel|clinic|salon/i;

const SERVICE_BY_GAP: Record<string, string> = {
  [PROBLEM_KEYS.noWebsite]: "Website development with products, proof and a clear contact path",
  [PROBLEM_KEYS.slowSite]: "Website performance improvement",
  [PROBLEM_KEYS.notMobile]: "Mobile-first website redesign",
  [PROBLEM_KEYS.outdatedContent]: "Website redesign",
  [PROBLEM_KEYS.noContactChannel]: "Contact and lead-capture improvements",
  [PROBLEM_KEYS.noBooking]: "Online ordering, booking or payment automation",
  broken_website: "Website repair or redesign",
};

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function text(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ").trim();
}

function socialMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) out[k] = v;
  }
  return out;
}

function mergeSocials(a: unknown, b: Record<string, string> | null | undefined) {
  return { ...socialMap(a), ...(b ?? {}) };
}

export function readWebsiteCheck(value: unknown): StoredWebsiteCheck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (
    typeof o["confidence"] !== "string" &&
    !Array.isArray(o["steps"]) &&
    !Array.isArray(o["checks"])
  ) {
    return null;
  }
  return {
    confidence: typeof o["confidence"] === "string" ? o["confidence"] : null,
    source: typeof o["source"] === "string" ? o["source"] : null,
    steps: Array.isArray(o["steps"])
      ? (o["steps"] as { step: string; result: string }[]).filter(
          (s) => s && typeof s.step === "string" && typeof s.result === "string",
        )
      : undefined,
    truncated: typeof o["truncated"] === "boolean" ? o["truncated"] : undefined,
    candidates_tested:
      typeof o["candidates_tested"] === "number" ? o["candidates_tested"] : undefined,
    checked_at: typeof o["checked_at"] === "string" ? o["checked_at"] : undefined,
    checks: Array.isArray(o["checks"])
      ? (o["checks"] as StoredWebsiteCheckEntry[]).filter(
          (c) => c && typeof c.id === "string" && typeof c.status === "string",
        )
      : undefined,
  };
}

function structuredStatus(
  check: StoredWebsiteCheck | null,
  id: CheckId,
): "positive" | "negative" | "truncated" | "failed" | "not_performed" | null {
  const entry = check?.checks?.find((c) => c.id === id);
  if (!entry) return null;
  if (entry.status === "positive") return "positive";
  if (entry.status === "negative") return "negative";
  if (entry.status === "truncated") return "truncated";
  if (entry.status === "failed") return "failed";
  return "not_performed";
}

function findStep(check: StoredWebsiteCheck | null, pattern: RegExp) {
  return check?.steps?.find((s) => pattern.test(s.step))?.result ?? null;
}

function stepResult(result: string | null): CheckResult {
  if (!result) return "not_performed";
  if (/timed out|truncated/i.test(result)) return "partial";
  if (/not checked|unavailable|skipped/i.test(result)) return "not_performed";
  if (/no website|none|not found|no match|no website listed/i.test(result)) {
    return "performed_negative";
  }
  if (/https?:\/\//i.test(result)) return "performed_positive";
  return "performed_negative";
}

function confidenceFor(result: CheckResult, base: number): number {
  if (result === "performed_positive") return clamp(base + 5);
  if (result === "performed_negative") return clamp(base);
  if (result === "partial") return clamp(base - 20);
  if (result === "failed") return clamp(base - 30);
  return 0;
}

function detectRwanda(b: VerificationBusiness): RwandaLocation {
  const hay = text(b.address, b.district, b.province).toLowerCase();
  const phone = (b.phone ?? "").replace(/[^\d]/g, "");
  if (phone.startsWith("250")) return "rwanda";
  if (RWANDA_HINT.test(hay)) return "rwanda";
  if (FOREIGN_HINT.test(hay)) return "other";
  const foreignCodes = ["254", "256", "255", "257", "234", "27", "971", "86", "91", "44", "1"];
  if (phone && foreignCodes.some((code) => phone.startsWith(code))) return "other";
  return "unknown";
}

function identityAssessment(
  b: VerificationBusiness,
  rwanda: RwandaLocation,
  website: string | null,
): IdentityAssessment {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`${reason} (+${points})`);
  };

  if (b.name?.trim()) add(10, "Business name recorded");
  if (b.place_id?.trim()) add(20, "Provider place identifier present");
  if (b.phone?.trim()) add(15, "Public phone number present");
  if (b.address?.trim()) add(10, "Public address present");
  if (website) add(b.website_source === "domain_match" ? 5 : 10, "Website linked to the record");
  if (b.maps_url?.trim()) add(10, "Maps profile link present");
  if (b.district?.trim() || b.province?.trim()) add(5, "District or province recorded");
  if ((b.emails ?? []).length > 0) add(5, "Public email present");
  if (b.legal_name?.trim()) add(10, "Legal name recorded");
  if (b.registration_id?.trim()) add(15, "Registration identifier recorded");
  if (b.location_verified === true) add(5, "Location previously verified");
  if (rwanda === "other") {
    score = Math.min(score, 35);
    reasons.push("Address or phone points outside Rwanda (-)");
  }

  const aliases = [
    ...new Set([b.legal_name, ...(b.trading_names ?? [])].filter(Boolean) as string[]),
  ];

  return {
    score_0_100: clamp(score, 0, b.registration_id ? 100 : 95),
    reasons,
    aliases,
  };
}

function manufacturingEvidence(b: VerificationBusiness): ManufacturingEvidence {
  const hay = text(
    b.industry,
    b.industry_secondary,
    b.sector,
    b.category,
    b.description,
    b.products_services,
    b.name,
  );
  const industry = (b.industry && classifyIndustry(b.industry)) || classifyIndustry(hay) || null;
  const productsEvidence = text(b.products_services, b.description, b.category) || null;

  if (MANUFACTURING_HINT.test(hay)) {
    const term = hay.match(MANUFACTURING_HINT)?.[0] ?? "manufacturing";
    return {
      status: "supported",
      basis: `Public profile text contains “${term}”; this supports manufacturing but is not a registry verification.`,
      products_evidence: productsEvidence,
      industry,
    };
  }

  if (industry === "manufacturing") {
    return {
      status: "supported",
      basis: `Classified as ${industryLabel("manufacturing")} from the recorded category/industry.`,
      products_evidence: productsEvidence,
      industry,
    };
  }

  const role = text(b.business_model, b.supply_chain_role).toLowerCase();
  if (
    NON_MANUFACTURING_HINT.test(role) ||
    industry === "wholesale_retail" ||
    industry === "trade"
  ) {
    return {
      status: "not_supported",
      basis: role
        ? `Recorded role “${role}” is retail/distribution/trading, not manufacturing.`
        : `Recorded industry is ${industry ? industryLabel(industry) : "retail/trading"}, not manufacturing.`,
      products_evidence: productsEvidence,
      industry,
    };
  }

  return {
    status: "unknown",
    basis:
      "No public evidence of manufacturing was found in the stored category, description or products fields.",
    products_evidence: productsEvidence,
    industry,
  };
}

function operatingEvidence(b: VerificationBusiness, now: Date): OperatingEvidence {
  const last = b.last_activity_at ?? null;
  const days = daysSince(last, now);
  if (b.business_status === "CLOSED_PERMANENTLY") {
    return {
      status: "closed_permanently",
      evidence: "Google lists the business as permanently closed.",
      last_observed_activity_at: last,
    };
  }
  if (b.business_status === "CLOSED_TEMPORARILY") {
    return {
      status: "closed_temporarily",
      evidence: "Google lists the business as temporarily closed.",
      last_observed_activity_at: last,
    };
  }
  if ((b.reviews_last_90d ?? 0) > 0) {
    return {
      status: "operating_evidence",
      evidence: `${b.reviews_last_90d} review(s) in the last 90 days.`,
      last_observed_activity_at: last,
    };
  }
  if (b.open_now === true) {
    return {
      status: "operating_evidence",
      evidence: "Listing reports the business open now.",
      last_observed_activity_at: last,
    };
  }
  if (days != null && days <= 180) {
    return {
      status: "operating_evidence",
      evidence: `Last public review activity ${days} day(s) ago.`,
      last_observed_activity_at: last,
    };
  }
  if (days != null && days > 365) {
    return {
      status: "possibly_dormant",
      evidence: `Last public review activity ${days} day(s) ago; no recent activity found.`,
      last_observed_activity_at: last,
    };
  }
  if (last) {
    return {
      status: "possibly_dormant",
      evidence: `Last public review activity ${days ?? "unknown"} day(s) ago.`,
      last_observed_activity_at: last,
    };
  }
  return {
    status: "unknown",
    evidence: "No recent activity evidence is stored.",
    last_observed_activity_at: null,
  };
}

function coverage(
  records: Map<CheckId, { result: CheckResult }>,
  defs: CheckDefinition[],
  hasWebsite: boolean,
): CoverageReport {
  let applicable = 0;
  let performed = 0;
  for (const def of defs) {
    const applies =
      def.applies === "always" ||
      (def.applies === "website" && hasWebsite) ||
      (def.applies === "no_website" && !hasWebsite);
    if (!applies) continue;
    applicable += def.weight;
    const result = records.get(def.id)?.result ?? "not_performed";
    if (PERFORMED.has(result)) performed += def.weight;
    else if (result === "partial") performed += def.weight * 0.5;
  }
  const score = applicable === 0 ? 0 : Math.round((performed / applicable) * 100);
  const level: CoverageLevel =
    score >= 85 ? "high" : score >= 55 ? "medium" : score > 0 ? "low" : "none";
  return {
    score_0_100: score,
    level,
    performed_weight: performed,
    applicable_weight: applicable,
    note:
      level === "high"
        ? "The available high-priority checks were completed."
        : level === "medium"
          ? "Some checks were incomplete or unavailable."
          : "Coverage is too limited to treat a negative result as proof of absence.",
  };
}

function buildRecords(args: {
  business: VerificationBusiness;
  website: string | null;
  check: StoredWebsiteCheck | null;
  findings: VerificationFindings | null;
  socials: Record<string, string>;
  socialSearch: PlatformSearch | undefined;
  directorySearch: PlatformSearch | undefined;
  marketplaceSearch: PlatformSearch | undefined;
  observedAt: string;
  now: Date;
}): Map<CheckId, { result: CheckResult; detail: string; entry: EvidenceLogEntry }> {
  const { business: b, website, check, findings, socials, observedAt } = args;
  const records = new Map<
    CheckId,
    { result: CheckResult; detail: string; entry: EvidenceLogEntry }
  >();
  const put = (
    id: CheckId,
    result: CheckResult,
    detail: string,
    opts: {
      url?: string | null;
      query?: string;
      checked_at?: string;
      confidence?: number;
      source?: string;
    } = {},
  ) => {
    const def = ALL_DEFS.find((d) => d.id === id)!;
    const checkedAt = opts.checked_at ?? observedAt;
    records.set(id, {
      result,
      detail,
      entry: {
        check_id: id,
        source: opts.source ?? def.source,
        url: opts.url ?? (website || b.maps_url || null),
        query_or_check: opts.query ?? def.label,
        observation: detail,
        checked_at: checkedAt,
        result,
        confidence_0_100: confidenceFor(result, opts.confidence ?? 75),
      },
    });
  };

  const listingFields = text(
    b.name ? `name“${b.name}”` : null,
    b.address ? "address" : null,
    b.phone ? "phone" : null,
  );
  put(
    "places_listing",
    listingFields ? "performed_positive" : "performed_negative",
    listingFields
      ? `Provider listing supplied ${listingFields}.`
      : "Provider listing was opened but contained no usable identity fields.",
    {
      url: b.maps_url ?? null,
      query: "Google Places / Geoapify listing record",
      confidence: listingFields ? 90 : 40,
      checked_at: b.activity_checked_at ?? observedAt,
    },
  );

  // Fresh place-details lookup.
  if (website) {
    put(
      "place_details",
      "not_applicable",
      "A website is already linked, so no fresh lookup was needed.",
    );
  } else {
    const structured = structuredStatus(check, "place_details");
    const step = findStep(check, /place.details/i);
    if (structured) {
      put(
        "place_details",
        structured === "positive"
          ? "performed_positive"
          : structured === "negative"
            ? "performed_negative"
            : "failed",
        structured === "positive"
          ? "Fresh place-details lookup returned a website."
          : structured === "negative"
            ? "Fresh place-details lookup returned no website."
            : "Fresh place-details lookup did not complete.",
        { query: "Fresh place-details lookup", confidence: 80 },
      );
    } else if (step) {
      const result = stepResult(step);
      put(
        "place_details",
        result,
        result === "performed_positive"
          ? `Fresh place-details lookup returned ${step}.`
          : `Fresh place-details lookup: ${step}.`,
        { query: "Fresh place-details lookup", confidence: 80 },
      );
    } else {
      put("place_details", "not_performed", "Fresh place-details lookup was not recorded.");
    }
  }

  // Domain candidates.
  if (website) {
    put("domain_candidates", "not_applicable", "A website is already linked.");
  } else {
    const structured = structuredStatus(check, "domain_candidates");
    const step = findStep(check, /likely domains|domain candidates/i);
    if (structured) {
      const result: CheckResult =
        structured === "positive"
          ? "performed_positive"
          : structured === "negative"
            ? "performed_negative"
            : structured === "truncated"
              ? "partial"
              : "not_performed";
      put(
        "domain_candidates",
        result,
        result === "partial"
          ? "Domain checks stopped before all candidates were tested."
          : result === "performed_negative"
            ? "Likely domains were tested and none matched this business."
            : "Domain check result was recorded.",
        {
          query: "Likely domain variants",
          confidence: 80,
          checked_at: check?.checked_at ?? b.website_checked_at ?? observedAt,
        },
      );
    } else if (step) {
      const result = stepResult(step);
      put(
        "domain_candidates",
        result,
        result === "partial" ? `Domain checks were truncated: ${step}.` : `Domain checks: ${step}.`,
        {
          query: "Likely domain variants",
          confidence: 75,
          checked_at: check?.checked_at ?? b.website_checked_at ?? observedAt,
        },
      );
    } else if (check?.confidence === "none_found") {
      put(
        "domain_candidates",
        "performed_negative",
        "A previous double-check reported no website, but the tested candidate list was not stored.",
        {
          query: "Legacy website double-check",
          confidence: 55,
          checked_at: check.checked_at ?? b.website_checked_at ?? observedAt,
        },
      );
    } else {
      put("domain_candidates", "not_performed", "Likely domain variants were not checked.");
    }
  }

  // Free hosting / site builders.
  if (website) {
    put("free_hosting", "not_applicable", "A website is already linked.");
  } else {
    const structured = structuredStatus(check, "free_hosting");
    const step = findStep(check, /free.host|website builder|vercel|netlify|wix|shopify/i);
    if (structured) {
      const result: CheckResult =
        structured === "positive"
          ? "performed_positive"
          : structured === "negative"
            ? "performed_negative"
            : structured === "truncated"
              ? "partial"
              : "not_performed";
      put(
        "free_hosting",
        result,
        result === "performed_negative"
          ? "Free-hosting and website-builder candidates were tested and none matched."
          : result === "partial"
            ? "Free-hosting checks did not finish."
            : "Free-hosting check result was recorded.",
        { query: "Free-hosting / website-builder candidates", confidence: 75 },
      );
    } else if (step) {
      const result = stepResult(step);
      put("free_hosting", result, `Free-hosting checks: ${step}.`, {
        query: "Free-hosting / website-builder candidates",
        confidence: 70,
      });
    } else {
      put(
        "free_hosting",
        "not_performed",
        "Free-hosting and website-builder platforms were not checked.",
      );
    }
  }

  // Website identity + probe.
  if (website) {
    const sourceLabel = b.website_source ?? check?.source ?? "unknown source";
    const guessedSource = sourceLabel === "domain_match" || sourceLabel === "free_hosting";
    put(
      "website_identity",
      "performed_positive",
      guessedSource
        ? `Website ${website} was matched by a name/domain guess (${sourceLabel}); confirm ownership.`
        : `Website ${website} is linked to the record via ${sourceLabel}.`,
      {
        url: website,
        query: "Website identity",
        confidence: guessedSource ? 65 : 90,
      },
    );
    if (findings) {
      if (findings.parked === true) {
        put("website_probe", "performed_positive", "The website appears parked or for sale.", {
          url: findings.url ?? website,
          query: "Website reachability probe",
          confidence: 85,
        });
      } else if (findings.reachable === true) {
        put(
          "website_probe",
          "performed_positive",
          `Website responded${findings.status ? ` with HTTP ${findings.status}` : ""} in ${
            typeof (findings as { load_ms?: number }).load_ms === "number"
              ? `${(findings as { load_ms?: number }).load_ms} ms`
              : "an unrecorded time"
          }.`,
          { url: findings.url ?? website, query: "Website reachability probe", confidence: 95 },
        );
      } else if (findings.reachable === false) {
        put(
          "website_probe",
          "performed_negative",
          `Website did not load${findings.status ? ` (HTTP ${findings.status})` : ""}${
            findings.error ? `: ${findings.error}` : ""
          }.`,
          { url: findings.url ?? website, query: "Website reachability probe", confidence: 85 },
        );
      } else {
        put(
          "website_probe",
          findings.error ? "failed" : "not_performed",
          findings.error ?? "Website probe did not return a reachable/unreachable result.",
          { url: findings.url ?? website, query: "Website reachability probe", confidence: 50 },
        );
      }
    } else {
      put(
        "website_probe",
        "not_performed",
        "A website is recorded but it has not been probed for availability.",
      );
    }
  } else {
    put("website_identity", "not_applicable", "No website is linked.");
    put("website_probe", "not_applicable", "No website is linked.");
  }

  // Google Business profile.
  if (b.maps_url || b.place_id) {
    put(
      "google_business",
      "performed_positive",
      b.maps_url
        ? "A Google Maps profile link is recorded."
        : "A provider place identifier is recorded.",
      { url: b.maps_url ?? null, query: "Google Business profile", confidence: 85 },
    );
  } else {
    put("google_business", "not_performed", "No Google Business profile link was recorded.");
  }

  // Social platform search (never assumed).
  const social = args.socialSearch;
  if (social?.error) {
    put("social_platforms", "failed", `Social platform search failed: ${social.error}`, {
      query: "Facebook / Instagram / LinkedIn / TikTok search",
      confidence: 50,
    });
  } else if (social?.performed) {
    const found = social.found ?? [];
    put(
      "social_platforms",
      found.length ? "performed_positive" : "performed_negative",
      found.length
        ? `Profiles found on social platforms: ${found.join(", ")}.`
        : "Social platform searches returned no profiles.",
      { query: "Facebook / Instagram / LinkedIn / TikTok search", confidence: 75 },
    );
  } else {
    put(
      "social_platforms",
      "not_performed",
      "Social platforms were not searched; profiles are only recorded when linked from a website.",
    );
  }

  // Social links found on the site (evidence, not a platform search).
  if (Object.keys(socials).length > 0) {
    put(
      "social_links_on_website",
      "performed_positive",
      `Social links found: ${Object.entries(socials)
        .map(([k, v]) => `${k} (${v})`)
        .join(", ")}.`,
      { query: "Social links on the business website", confidence: 85 },
    );
  } else {
    put(
      "social_links_on_website",
      "performed_negative",
      website
        ? "No social profile links were found on the recorded website."
        : "There was no website to inspect for social links.",
      { query: "Social links on the business website", confidence: 60 },
    );
  }

  // Directory / marketplace searches.
  const directory = args.directorySearch;
  if (directory?.error) {
    put("directories", "failed", `Directory search failed: ${directory.error}`, {
      query: "Rwandan business directories",
      confidence: 50,
    });
  } else if (directory?.performed) {
    const found = directory.found ?? [];
    put(
      "directories",
      found.length ? "performed_positive" : "performed_negative",
      found.length
        ? `Directory listings found: ${found.join(", ")}.`
        : "Directory searches returned no listings.",
      { query: "Rwandan business directories", confidence: 65 },
    );
  } else {
    put("directories", "not_performed", "Business directories were not searched.");
  }

  const marketplace = args.marketplaceSearch;
  if (marketplace?.error) {
    put("marketplaces", "failed", `Marketplace search failed: ${marketplace.error}`, {
      query: "Marketplaces / hosted stores",
      confidence: 50,
    });
  } else if (marketplace?.performed) {
    const found = marketplace.found ?? [];
    put(
      "marketplaces",
      found.length ? "performed_positive" : "performed_negative",
      found.length
        ? `Marketplace or hosted-store profiles found: ${found.join(", ")}.`
        : "Marketplace searches returned no profiles.",
      { query: "Marketplaces / hosted stores", confidence: 65 },
    );
  } else {
    put("marketplaces", "not_performed", "Marketplaces and hosted stores were not searched.");
  }

  // Registry lookup is restricted unless an identifier already exists.
  if (b.registration_id) {
    put(
      "registry",
      "performed_positive",
      `A registration identifier is recorded (${b.registration_id}).`,
      { query: "Registration / registry lookup", confidence: 90 },
    );
  } else {
    put(
      "registry",
      "blocked",
      "Registration records are not available through an authorized integration.",
      { query: "Registration / registry lookup", confidence: 0 },
    );
  }

  // Public contact evidence.
  const emails = (b.emails ?? []).filter(Boolean);
  if (b.phone || emails.length) {
    put(
      "public_contact",
      "performed_positive",
      [b.phone ? `phone ${b.phone}` : null, emails.length ? `email ${emails.join(", ")}` : null]
        .filter(Boolean)
        .join("; "),
      { query: "Public contact details", confidence: 90 },
    );
  } else {
    put("public_contact", "performed_negative", "No public phone number or email was recorded.", {
      query: "Public contact details",
      confidence: 60,
    });
  }

  return records;
}

function websiteStatusFor(args: {
  website: string | null;
  check: StoredWebsiteCheck | null;
  findings: VerificationFindings | null;
  records: Map<CheckId, { result: CheckResult }>;
  coverage: CoverageReport;
  checkedAt: string | null;
}): { status: WebsiteStatus; reason: string } {
  const { website, check, findings, records, coverage, checkedAt } = args;
  if (website) {
    if (findings?.parked === true) {
      return {
        status: "WEBSITE_BROKEN_OR_INACTIVE",
        reason: "The linked URL appears parked or for sale.",
      };
    }
    if (findings?.reachable === false) {
      return {
        status: "WEBSITE_BROKEN_OR_INACTIVE",
        reason: "The linked website did not respond when probed.",
      };
    }
    if (findings?.reachable === true) {
      return {
        status: "WEBSITE_VERIFIED",
        reason: "The linked website responded to a real probe.",
      };
    }
    if (check?.confidence === "none_found") {
      return {
        status: "POSSIBLE_HIDDEN_WEBSITE",
        reason:
          "A website URL is stored, but an earlier check reported none; the evidence conflicts.",
      };
    }
    return {
      status: "WEBSITE_VERIFIED",
      reason: "A website URL is linked to the business, but availability has not been probed yet.",
    };
  }

  if (!check && !checkedAt) {
    return {
      status: "NOT_CHECKED",
      reason: "No website check has been recorded for this business.",
    };
  }
  if (check?.truncated || records.get("domain_candidates")?.result === "partial") {
    return {
      status: "POSSIBLE_HIDDEN_WEBSITE",
      reason: "Website checks stopped before every candidate could be tested.",
    };
  }
  if (check?.confidence === "none_found" && coverage.level === "high") {
    return {
      status: "NO_WEBSITE_FOUND_HIGH_COVERAGE",
      reason: "No website was found after the available high-priority website checks completed.",
    };
  }
  if (check) {
    return {
      status: "POSSIBLE_HIDDEN_WEBSITE",
      reason:
        "A check was attempted, but coverage is incomplete, so a hidden website cannot be ruled out.",
    };
  }
  return {
    status: "NOT_CHECKED",
    reason: "There is a check timestamp but no recorded website-check result.",
  };
}

function presenceStatusFor(args: {
  website: string | null;
  websiteStatus: WebsiteStatus;
  socials: Record<string, string>;
  business: VerificationBusiness;
  coverage: CoverageReport;
  identity: IdentityAssessment;
  hasAnyCheck: boolean;
}): { status: PresenceStatus; reason: string } {
  const { website, websiteStatus, socials, business, coverage, identity, hasAnyCheck } = args;
  const socialCount = Object.keys(socials).length;
  const directContact = !!business.phone || (business.emails ?? []).length > 0;
  const hasMaps = !!business.maps_url || !!business.place_id;
  const usableWebsite = !!website && websiteStatus === "WEBSITE_VERIFIED";
  const hasAnything =
    !!website || socialCount > 0 || hasMaps || directContact || !!business.address;

  if (usableWebsite && socialCount > 0) {
    return {
      status: "MULTI_CHANNEL_PRESENCE",
      reason: "A verified website and at least one social profile are recorded.",
    };
  }
  if (usableWebsite) {
    return {
      status: "MULTI_CHANNEL_PRESENCE",
      reason: "A website is verified for the business.",
    };
  }
  if (socialCount > 0) {
    return {
      status: "SOCIAL_OR_MARKETPLACE_ONLY",
      reason: "Social profiles were found, but no independent website was verified.",
    };
  }
  if (identity.score_0_100 < 50 && hasAnything) {
    return {
      status: "PRESENCE_UNCERTAIN",
      reason: "Identity matching is too weak to attribute any online presence confidently.",
    };
  }
  if (!hasAnything) {
    if (!hasAnyCheck) {
      return { status: "NOT_CHECKED", reason: "No online-presence checks have been recorded." };
    }
    if (coverage.level === "high") {
      return {
        status: "NO_CREDIBLE_PRESENCE_FOUND_HIGH_COVERAGE",
        reason:
          "No website, social, directory or contact presence was found after documented checks.",
      };
    }
    return {
      status: "PRESENCE_UNCERTAIN",
      reason: "No presence was found, but search coverage is too limited to treat that as proof.",
    };
  }
  return {
    status: "LIMITED_PRESENCE_FOUND",
    reason: hasMaps
      ? "Only a map/directory listing and limited contact details were found; social and directory searches were not completed."
      : "Only limited contact details were found; social and directory searches were not completed.",
  };
}

function digitalGapsFor(args: {
  business: VerificationBusiness;
  findings: VerificationFindings | null;
  websiteCheck: StoredWebsiteCheck | null;
  websiteStatus: WebsiteStatus;
  observedAt: string;
  records: Map<CheckId, { detail: string; entry: EvidenceLogEntry }>;
  coverage: CoverageReport;
}): DigitalGap[] {
  const { business: b, findings, websiteCheck, websiteStatus, observedAt, records } = args;
  const derived =
    websiteStatus === "WEBSITE_VERIFIED" && findings
      ? deriveObservedProblems({
          business: {
            name: b.name ?? null,
            category: b.category ?? null,
            website: b.website ?? null,
            industry: b.industry ?? null,
            employees_min: b.employees_min ?? null,
            employees_max: b.employees_max ?? null,
          },
          findings: findings as never,
          websiteCheck: websiteCheck as never,
          observedAt,
        })
      : [];

  const gaps: DigitalGap[] = derived
    .filter((p) => p.key !== PROBLEM_KEYS.noWebsite)
    .map((p) => ({
      key: p.key,
      label: p.label,
      evidence: p.evidence,
      severity: p.severity,
      confidence: p.confidence,
      observed_at: p.observed_at,
      source: p.source,
    }));

  if (websiteStatus === "NO_WEBSITE_FOUND_HIGH_COVERAGE") {
    gaps.push({
      key: PROBLEM_KEYS.noWebsite,
      label: "No website found",
      evidence:
        "No independent website was found after the available high-priority website checks completed.",
      severity: "high",
      confidence: 0.8,
      observed_at: observedAt,
      source: "website double-check",
    });
  }

  if (websiteStatus === "WEBSITE_BROKEN_OR_INACTIVE") {
    const detail =
      records.get("website_probe")?.detail ??
      (findings?.parked
        ? "The linked website appears parked or for sale."
        : "The linked website did not load.");
    gaps.push({
      key: "broken_website",
      label: "Website broken or inactive",
      evidence: detail,
      severity: "high",
      confidence: 0.85,
      observed_at: observedAt,
      source: "website probe",
    });
  }

  const seen = new Set<string>();
  return gaps.filter((g) => {
    if (seen.has(g.key)) return false;
    seen.add(g.key);
    return true;
  });
}

function severityRank(severity: DigitalGap["severity"]): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function serviceOpportunityFor(
  gaps: DigitalGap[],
  websiteStatus: WebsiteStatus,
): ServiceOpportunity | null {
  if (gaps.length === 0) return null;
  const top = [...gaps].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || b.confidence - a.confidence,
  )[0]!;
  const summary =
    SERVICE_BY_GAP[top.key] ??
    (websiteStatus === "NO_WEBSITE_FOUND_HIGH_COVERAGE"
      ? SERVICE_BY_GAP[PROBLEM_KEYS.noWebsite]
      : null) ??
    "Digital presence improvement";
  return {
    summary,
    basis: `Based only on the observed evidence: ${top.evidence}`,
    limitation:
      "A digital gap is not evidence that the business wants to buy. It is a reason to start a conversation, not a proven willingness to pay.",
  };
}

function commercialAssessment(args: {
  identity: IdentityAssessment;
  manufacturing: ManufacturingEvidence;
  operating: OperatingEvidence;
  websiteStatus: WebsiteStatus;
  websiteCoverage: CoverageReport;
  gaps: DigitalGap[];
  business: VerificationBusiness;
  socials: Record<string, string>;
  rwanda: RwandaLocation;
  contradictions: string[];
}): { priority: CommercialPriority; score: number; reasons: string[] } {
  const {
    identity,
    manufacturing,
    operating,
    websiteStatus,
    websiteCoverage,
    gaps,
    business,
    socials,
    rwanda,
    contradictions,
  } = args;
  const reasons: string[] = [];
  const directContact = !!business.phone || (business.emails ?? []).length > 0;
  const indirectContact =
    !!business.website ||
    !!business.maps_url ||
    Object.keys(socials).length > 0 ||
    !!business.address;
  const contactable = directContact || indirectContact;
  const topSeverity = gaps.reduce<DigitalGap["severity"] | null>(
    (best, g) => (!best || severityRank(g.severity) > severityRank(best) ? g.severity : best),
    null,
  );

  const gapPoints =
    topSeverity === "high" ? 50 : topSeverity === "medium" ? 35 : topSeverity ? 20 : 0;
  const identityPoints = Math.round(identity.score_0_100 * 0.2);
  const operatingPoints =
    operating.status === "operating_evidence" ? 15 : operating.status === "unknown" ? 5 : 0;
  const contactPoints = directContact ? 15 : indirectContact ? 5 : 0;
  const manufacturingPoints = manufacturing.status === "supported" ? 10 : 0;
  const coveragePoints = Math.round(websiteCoverage.score_0_100 * 0.05);
  const score = clamp(
    gapPoints +
      identityPoints +
      operatingPoints +
      contactPoints +
      manufacturingPoints +
      coveragePoints,
  );

  if (rwanda === "other") {
    reasons.push("Address or phone appears to be outside Rwanda.");
    return { priority: "C", score, reasons };
  }
  if (identity.score_0_100 < 50) {
    reasons.push("Identity confidence is too low to act on.");
    return { priority: "MANUAL_REVIEW", score, reasons };
  }
  if (contradictions.some((c) => /website/i.test(c))) {
    reasons.push("Website evidence conflicts and must be resolved manually.");
    return { priority: "MANUAL_REVIEW", score, reasons };
  }
  if (operating.status === "closed_permanently") {
    reasons.push("The business is reported permanently closed.");
    return { priority: "C", score, reasons };
  }
  if (manufacturing.status === "not_supported") {
    reasons.push("Recorded evidence points to retail/distribution/trading, not manufacturing.");
    return { priority: "C", score, reasons };
  }
  if (!contactable) {
    reasons.push("No public contact path was found.");
    return { priority: "C", score, reasons };
  }

  if (websiteStatus === "NOT_CHECKED") {
    reasons.push("Website status has not been checked.");
    return { priority: identity.score_0_100 >= 60 ? "B" : "MANUAL_REVIEW", score, reasons };
  }

  if (websiteStatus === "POSSIBLE_HIDDEN_WEBSITE") {
    if (websiteCoverage.level === "low" || websiteCoverage.level === "none") {
      reasons.push("Website coverage is too limited to classify it confidently.");
      return { priority: "MANUAL_REVIEW", score, reasons };
    }
    reasons.push("Website evidence is incomplete; a hidden website is still possible.");
    return { priority: "B", score, reasons };
  }

  if (websiteStatus === "WEBSITE_VERIFIED") {
    if (business.parent_organization) {
      reasons.push(
        "The website may belong to a parent organisation; the local factory's own digital gap is unclear.",
      );
      return { priority: "B", score, reasons };
    }
    if (business.website_source === "domain_match" || business.website_source === "free_hosting") {
      reasons.push(
        "The website was inferred by a name/domain guess; confirm it belongs to this business before treating gaps as verified.",
      );
      return { priority: "B", score, reasons };
    }
    if (gaps.length === 0) {
      if (websiteCoverage.level !== "high") {
        reasons.push(
          "A website is linked, but it has not been fully probed, so no gap can be confirmed.",
        );
        return { priority: "B", score, reasons };
      }
      reasons.push("A website is verified and no measured digital gap was found.");
      return { priority: "C", score, reasons };
    }
    if (
      topSeverity === "high" &&
      identity.score_0_100 >= 70 &&
      directContact &&
      operating.status === "operating_evidence" &&
      manufacturing.status === "supported"
    ) {
      reasons.push("Verified operating manufacturer with a measured high-severity website gap.");
      return { priority: "A", score, reasons };
    }
    reasons.push("A website exists but the measured gap or fit needs further verification.");
    return { priority: "B", score, reasons };
  }

  if (websiteStatus === "WEBSITE_BROKEN_OR_INACTIVE") {
    if (
      identity.score_0_100 >= 70 &&
      directContact &&
      manufacturing.status === "supported" &&
      operating.status === "operating_evidence"
    ) {
      reasons.push("Verified operating manufacturer with a broken or inactive website.");
      return { priority: "A", score, reasons };
    }
    reasons.push(
      "The website is broken, but identity, contact or manufacturing evidence is incomplete.",
    );
    return { priority: "B", score, reasons };
  }

  if (websiteStatus === "NO_WEBSITE_FOUND_HIGH_COVERAGE") {
    if (
      identity.score_0_100 >= 65 &&
      directContact &&
      manufacturing.status === "supported" &&
      operating.status === "operating_evidence"
    ) {
      reasons.push(
        "Manufacturing activity, contact details and recent operation are supported; no website was found after documented checks.",
      );
      return { priority: "A", score, reasons };
    }
    reasons.push(
      "No website was found, but manufacturing evidence, identity, contactability or operating status still needs verification.",
    );
    return { priority: "B", score, reasons };
  }

  reasons.push("Needs further verification.");
  return { priority: "B", score, reasons };
}

function nextStepFor(args: {
  rwanda: RwandaLocation;
  websiteStatus: WebsiteStatus;
  websiteCoverage: CoverageReport;
  identity: IdentityAssessment;
  manufacturing: ManufacturingEvidence;
  operating: OperatingEvidence;
  records: Map<CheckId, { result: CheckResult }>;
}): string {
  const { rwanda, websiteStatus, websiteCoverage, identity, manufacturing, operating, records } =
    args;
  if (rwanda === "other") {
    return "Confirm the business is actually in Rwanda; if not, exclude it as a same-name foreign company.";
  }
  if (websiteStatus === "POSSIBLE_HIDDEN_WEBSITE") {
    return "Run a longer website double-check that covers more domain variants, free-hosting platforms and social links.";
  }
  if (
    websiteStatus === "WEBSITE_VERIFIED" &&
    records.get("website_probe")?.result === "not_performed"
  ) {
    return "Run the website probe to confirm the site is reachable and measure its usability.";
  }
  if (records.get("social_platforms")?.result === "not_performed") {
    return "Search Facebook, Instagram, LinkedIn and relevant Rwandan directories manually or through an authorized source before treating the business as website-less.";
  }
  if (identity.score_0_100 < 70) {
    return "Confirm the legal/trading name and registration details from an authorized source before outreach.";
  }
  if (manufacturing.status === "unknown") {
    return "Confirm manufacturing activity from product pages, factory evidence or a direct call.";
  }
  if (operating.status !== "operating_evidence") {
    return "Confirm the business is currently operating (recent reviews, posts or a phone call).";
  }
  if (records.get("website_probe")?.result === "not_performed") {
    return "Run the website probe to confirm the site is reachable and measure its usability.";
  }
  return "Re-check evidence in 90 days or after the next discovery run.";
}

export function buildProspectVerification(input: ProspectVerificationInput): ProspectVerification {
  const now = input.now ?? new Date();
  const b = input.business;
  const website = b.website?.trim() || null;
  const check = readWebsiteCheck(input.websiteCheck ?? b.website_check);
  const findings = input.findings ?? null;
  const observedAt =
    input.observedAt ??
    check?.checked_at ??
    b.website_checked_at ??
    b.activity_checked_at ??
    now.toISOString();
  const socials = mergeSocials(b.socials, findings?.socials ?? null);
  const rwanda = detectRwanda(b);
  const identity = identityAssessment(b, rwanda, website);
  const manufacturing = manufacturingEvidence(b);
  const operating = operatingEvidence(b, now);

  const records = buildRecords({
    business: b,
    website,
    check,
    findings,
    socials,
    socialSearch: input.socialSearch,
    directorySearch: input.directorySearch,
    marketplaceSearch: input.marketplaceSearch,
    observedAt,
    now,
  });

  const websiteCoverage = coverage(records, WEBSITE_CHECK_DEFS, !!website);
  const presenceCoverage = coverage(records, PRESENCE_CHECK_DEFS, !!website);

  const websiteStatus = websiteStatusFor({
    website,
    check,
    findings,
    records,
    coverage: websiteCoverage,
    checkedAt: b.website_checked_at ?? check?.checked_at ?? null,
  });

  const presenceStatus = presenceStatusFor({
    website,
    websiteStatus: websiteStatus.status,
    socials,
    business: b,
    coverage: presenceCoverage,
    identity,
    hasAnyCheck: !!(check || b.website_checked_at || findings),
  });

  const contradictions: string[] = [];
  if (website && check?.confidence === "none_found") {
    contradictions.push("A website URL is stored but the last double-check reported no website.");
  }
  if (b.business_status === "CLOSED_PERMANENTLY" && (b.reviews_last_90d ?? 0) > 0) {
    contradictions.push("Google marks the business permanently closed, but recent reviews exist.");
  }
  if (rwanda === "other") {
    contradictions.push("The address or phone number points outside Rwanda.");
  }

  const gaps = digitalGapsFor({
    business: b,
    findings,
    websiteCheck: check,
    websiteStatus: websiteStatus.status,
    observedAt,
    records,
    coverage: websiteCoverage,
  });

  const opportunity = serviceOpportunityFor(gaps, websiteStatus.status);
  const commercial = commercialAssessment({
    identity,
    manufacturing,
    operating,
    websiteStatus: websiteStatus.status,
    websiteCoverage,
    gaps,
    business: b,
    socials,
    rwanda,
    contradictions,
  });

  const uncertainties: string[] = [];
  if (website && websiteStatus.status === "WEBSITE_VERIFIED" && !findings) {
    uncertainties.push("The linked website has not been probed for availability or usability.");
  }
  if (
    website &&
    (b.website_source === "domain_match" ||
      b.website_source === "free_hosting" ||
      check?.source === "domain_match" ||
      check?.source === "free_hosting")
  ) {
    uncertainties.push(
      "Website ownership was inferred from a name/domain guess; confirm it belongs to this business.",
    );
  }
  if (check?.truncated) {
    uncertainties.push("Website checks stopped early, so a hidden website could not be ruled out.");
  } else if (websiteCoverage.level !== "high" && websiteStatus.status !== "WEBSITE_VERIFIED") {
    uncertainties.push(
      "Website search coverage is incomplete, so a hidden website cannot be ruled out.",
    );
  }
  if (records.get("social_platforms")?.result === "not_performed") {
    uncertainties.push("Social platforms were not searched; social-only presence may be missed.");
  }
  if (records.get("directories")?.result === "not_performed") {
    uncertainties.push("Business directories and marketplaces were not searched.");
  }
  if (records.get("registry")?.result === "blocked") {
    uncertainties.push("Registration records were not available through an authorized source.");
  }
  if (manufacturing.status === "unknown") {
    uncertainties.push("Manufacturing activity is not yet supported by public evidence.");
  }
  if (identity.score_0_100 < 70) {
    uncertainties.push("Identity confidence is below the threshold for outreach.");
  }
  if (b.parent_organization) {
    uncertainties.push(
      `Parent organisation recorded (${b.parent_organization}); a linked website may not represent this local business.`,
    );
  }
  if (operating.status === "unknown" || operating.status === "possibly_dormant") {
    uncertainties.push("Current operating status is not firmly established.");
  }
  if (rwanda === "unknown") {
    uncertainties.push("Rwanda location was not confirmed from the address or phone number.");
  }

  const checksPerformed: string[] = [];
  const checksFailed: string[] = [];
  const checksNotPerformed: string[] = [];
  const evidenceLog: EvidenceLogEntry[] = [];
  for (const [id, rec] of records) {
    const def = ALL_DEFS.find((d) => d.id === id);
    const label = def?.label ?? id;
    if (rec.result === "performed_positive" || rec.result === "performed_negative") {
      checksPerformed.push(`${label}: ${rec.detail}`);
      evidenceLog.push(rec.entry);
    } else if (rec.result === "partial" || rec.result === "failed") {
      checksFailed.push(`${label}: ${rec.detail}`);
      evidenceLog.push(rec.entry);
    } else if (rec.result === "blocked" || rec.result === "not_performed") {
      checksNotPerformed.push(`${label}: ${rec.detail}`);
      if (rec.result === "blocked") evidenceLog.push(rec.entry);
    }
  }

  return {
    website_status: websiteStatus.status,
    website_status_reason: websiteStatus.reason,
    online_presence_status: presenceStatus.status,
    online_presence_reason: presenceStatus.reason,
    operating_status: operating.status,
    operating_evidence: operating.evidence,
    last_observed_activity_at: operating.last_observed_activity_at,
    manufacturing_evidence: manufacturing,
    identity_confidence_0_100: identity.score_0_100,
    identity_reasons: identity.reasons,
    rwanda_location: rwanda,
    website_coverage: websiteCoverage,
    presence_coverage: presenceCoverage,
    checks_performed: checksPerformed,
    checks_failed: checksFailed,
    checks_not_performed: checksNotPerformed,
    evidence_log: evidenceLog,
    digital_gap: gaps,
    service_opportunity: opportunity,
    commercial_priority: commercial.priority,
    commercial_score_0_100: commercial.score,
    priority_reasons: commercial.reasons,
    uncertainties,
    contradictions,
    next_verification_step: nextStepFor({
      rwanda,
      websiteStatus: websiteStatus.status,
      websiteCoverage,
      identity,
      manufacturing,
      operating,
      records,
    }),
    generated_at: now.toISOString(),
  };
}
