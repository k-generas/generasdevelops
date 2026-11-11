// Professional people intelligence. Pure helpers only: no external calls and no
// invented profile data. A professional record is stored independently from a
// business and must keep its source/evidence with it.

export const PROFESSIONAL_TYPES = [
  "founder",
  "owner",
  "executive",
  "director",
  "manager",
  "consultant",
  "freelancer",
  "creator",
  "engineer",
  "designer",
  "marketer",
  "salesperson",
  "investor",
  "partner",
  "other",
] as const;

export type ProfessionalType = (typeof PROFESSIONAL_TYPES)[number];

export const PROFESSIONAL_VERIFICATION_STATUSES = [
  "unverified",
  "observed",
  "corroborated",
  "owner_confirmed",
] as const;

export type ProfessionalVerificationStatus = (typeof PROFESSIONAL_VERIFICATION_STATUSES)[number];

export const PROFESSIONAL_AVAILABILITY_STATUSES = [
  "unknown",
  "open",
  "limited",
  "unavailable",
] as const;

export type ProfessionalAvailabilityStatus = (typeof PROFESSIONAL_AVAILABILITY_STATUSES)[number];

export const PROFESSIONAL_STAGES = [
  "not_contacted",
  "researching",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "won",
  "lost",
  "dormant",
  "do_not_contact",
] as const;

export type ProfessionalStage = (typeof PROFESSIONAL_STAGES)[number];

export const PROFESSIONAL_LINK_TYPES = [
  "works_at",
  "founder_of",
  "owner_of",
  "advisor_to",
  "partner_with",
  "client_of",
  "prospect_for",
  "other",
] as const;

export type ProfessionalLinkType = (typeof PROFESSIONAL_LINK_TYPES)[number];

export const PROFESSIONAL_EVIDENCE_KINDS = [
  "public_profile",
  "website",
  "registry",
  "owner",
  "other",
] as const;

export type ProfessionalEvidenceKind = (typeof PROFESSIONAL_EVIDENCE_KINDS)[number];

export type ProfessionalEvidence = {
  kind: ProfessionalEvidenceKind;
  label: string;
  url?: string | null;
  observedAt?: string | null;
  note?: string | null;
};

export type ProfessionalInput = {
  fullName: string;
  headline?: string | null;
  professionalType?: ProfessionalType;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  languages?: string[];
  expertise?: string[];
  skills?: string[];
  website?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  profileUrl?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  evidence?: ProfessionalEvidence[];
  confidence?: number;
  verificationStatus?: ProfessionalVerificationStatus;
  availabilityStatus?: ProfessionalAvailabilityStatus;
  relationshipStage?: ProfessionalStage;
  doNotContact?: boolean;
  notes?: string | null;
  lastVerifiedAt?: string | null;
};

export type Professional = ProfessionalInput & {
  id?: string;
  dedupeKey: string;
  createdAt?: string;
  updatedAt?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function normalizePhone(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

export function normalizeUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function normalizeDomain(value: string | null | undefined): string | null {
  const url = normalizeUrl(value);
  if (!url) return null;
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeCountry(value: string | null | undefined): string | null {
  const c = (value ?? "").trim();
  return c ? c.slice(0, 80) : null;
}

export function normalizeList(values: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Strong identifiers first. A profile URL is the most stable public identifier,
// then a verified public email/phone. Weak name-only matches include the country
// so two people with the same name in different markets are not collapsed.
export function professionalDedupeKey(input: ProfessionalInput): string {
  const profile = normalizeUrl(input.profileUrl);
  if (profile) return `profile:${profile.toLowerCase()}`;
  const email = normalizeEmail(input.publicEmail);
  if (email) return `email:${email}`;
  const phone = normalizePhone(input.publicPhone);
  if (phone) return `phone:${phone}`;
  const name = slug(normalizeName(input.fullName));
  const country = slug(normalizeCountry(input.country) ?? "unknown");
  return `name:${name || "unnamed"}|country:${country}`;
}

export function isValidEmail(value: string | null | undefined): boolean {
  return normalizeEmail(value) !== null;
}

export function isValidPhone(value: string | null | undefined): boolean {
  return normalizePhone(value) !== null;
}

export type ProfessionalCompleteness = {
  score: number;
  missing: string[];
};

export function professionalCompleteness(input: ProfessionalInput): ProfessionalCompleteness {
  const checks: Array<[string, boolean, number]> = [
    ["full name", normalizeName(input.fullName).length > 0, 20],
    ["professional type", !!input.professionalType && input.professionalType !== "other", 5],
    ["country", !!normalizeCountry(input.country), 5],
    ["headline or role", !!input.headline?.trim(), 5],
    ["public email", !!normalizeEmail(input.publicEmail), 15],
    ["public phone", !!normalizePhone(input.publicPhone), 10],
    [
      "website or profile URL",
      !!(normalizeUrl(input.website) || normalizeUrl(input.profileUrl)),
      15,
    ],
    ["expertise or skills", (input.expertise?.length ?? 0) + (input.skills?.length ?? 0) > 0, 10],
    ["source URL", !!normalizeUrl(input.sourceUrl), 10],
    ["evidence", (input.evidence?.length ?? 0) > 0, 5],
  ];
  let score = 0;
  const missing: string[] = [];
  for (const [label, present, weight] of checks) {
    if (present) score += weight;
    else missing.push(label);
  }
  return { score: Math.min(100, score), missing };
}

export function suggestConfidence(input: ProfessionalInput): number {
  if (input.verificationStatus === "owner_confirmed") return 0.95;
  const kinds = new Set((input.evidence ?? []).map((e) => e.kind));
  let confidence = 0.25;
  confidence += Math.min(0.45, kinds.size * 0.15);
  if (normalizeUrl(input.sourceUrl)) confidence += 0.1;
  if (normalizeUrl(input.profileUrl)) confidence += 0.1;
  if (input.verificationStatus === "corroborated") confidence += 0.1;
  if (input.verificationStatus === "observed") confidence += 0.05;
  return Math.round(Math.min(0.9, Math.max(0.05, confidence)) * 100) / 100;
}

export type ProfessionalValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateProfessional(input: ProfessionalInput): ProfessionalValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!normalizeName(input.fullName)) errors.push("Full name is required.");
  if (input.publicEmail && !normalizeEmail(input.publicEmail)) {
    errors.push("Public email is not a valid email address.");
  }
  if (input.publicPhone && !normalizePhone(input.publicPhone)) {
    errors.push("Public phone is not a valid international phone number.");
  }
  if (input.website && !normalizeUrl(input.website)) {
    errors.push("Website is not a valid http(s) URL.");
  }
  if (input.profileUrl && !normalizeUrl(input.profileUrl)) {
    errors.push("Profile URL is not a valid http(s) URL.");
  }
  if (input.sourceUrl && !normalizeUrl(input.sourceUrl)) {
    warnings.push("Source URL is not a valid http(s) URL and will not be stored.");
  }
  if (input.doNotContact && input.relationshipStage !== "do_not_contact") {
    warnings.push("Do-not-contact is enabled; the stage will be set to do_not_contact.");
  }
  if (!input.sourceUrl && !input.sourceName) {
    warnings.push("No source recorded. Add where this public profile was observed.");
  }
  if ((input.evidence?.length ?? 0) === 0) {
    warnings.push("No evidence recorded. Confidence must stay low until observed.");
  }
  const confidence = input.confidence ?? suggestConfidence(input);
  if (
    confidence > 0.6 &&
    !["corroborated", "owner_confirmed"].includes(input.verificationStatus ?? "unverified")
  ) {
    warnings.push("High confidence requires corroborated or owner-confirmed evidence.");
  }
  if (input.relationshipStage === "do_not_contact" && !input.doNotContact) {
    warnings.push("Stage is do_not_contact but the do-not-contact flag is off.");
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function normalizeProfessional(input: ProfessionalInput): ProfessionalInput {
  const doNotContact = !!input.doNotContact || input.relationshipStage === "do_not_contact";
  return {
    ...input,
    fullName: normalizeName(input.fullName),
    headline: input.headline?.trim() || null,
    professionalType: input.professionalType ?? "other",
    country: normalizeCountry(input.country),
    region: input.region?.trim() || null,
    city: input.city?.trim() || null,
    languages: normalizeList(input.languages),
    expertise: normalizeList(input.expertise),
    skills: normalizeList(input.skills),
    website: normalizeUrl(input.website),
    publicEmail: normalizeEmail(input.publicEmail),
    publicPhone: normalizePhone(input.publicPhone),
    profileUrl: normalizeUrl(input.profileUrl),
    sourceName: input.sourceName?.trim() || null,
    sourceUrl: normalizeUrl(input.sourceUrl),
    evidence: input.evidence ?? [],
    confidence: Math.min(1, Math.max(0, input.confidence ?? suggestConfidence(input))),
    verificationStatus: input.verificationStatus ?? "unverified",
    availabilityStatus: input.availabilityStatus ?? "unknown",
    relationshipStage: doNotContact ? "do_not_contact" : (input.relationshipStage ?? "researching"),
    doNotContact,
    notes: input.notes?.trim() || null,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
  };
}

export function professionalTypeLabel(type: ProfessionalType): string {
  const labels: Record<ProfessionalType, string> = {
    founder: "Founder",
    owner: "Owner",
    executive: "Executive",
    director: "Director",
    manager: "Manager",
    consultant: "Consultant",
    freelancer: "Freelancer",
    creator: "Creator",
    engineer: "Engineer",
    designer: "Designer",
    marketer: "Marketer",
    salesperson: "Salesperson",
    investor: "Investor",
    partner: "Partner",
    other: "Other",
  };
  return labels[type];
}

export function professionalStageLabel(stage: ProfessionalStage): string {
  return stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function professionalLinkLabel(link: ProfessionalLinkType): string {
  return link.replace(/_/g, " ");
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type ProfessionalCoverage = {
  total: number;
  verified: number;
  ownerConfirmed: number;
  openToWork: number;
  doNotContact: number;
  withEmail: number;
  withPhone: number;
  withProfile: number;
};

export function professionalCoverage(rows: ProfessionalInput[]): ProfessionalCoverage {
  const coverage: ProfessionalCoverage = {
    total: rows.length,
    verified: 0,
    ownerConfirmed: 0,
    openToWork: 0,
    doNotContact: 0,
    withEmail: 0,
    withPhone: 0,
    withProfile: 0,
  };
  for (const row of rows) {
    if (row.verificationStatus === "corroborated" || row.verificationStatus === "owner_confirmed") {
      coverage.verified++;
    }
    if (row.verificationStatus === "owner_confirmed") coverage.ownerConfirmed++;
    if (row.availabilityStatus === "open") coverage.openToWork++;
    if (row.doNotContact || row.relationshipStage === "do_not_contact") coverage.doNotContact++;
    if (normalizeEmail(row.publicEmail)) coverage.withEmail++;
    if (normalizePhone(row.publicPhone)) coverage.withPhone++;
    if (normalizeUrl(row.profileUrl)) coverage.withProfile++;
  }
  return coverage;
}
