// Outreach compliance foundation. This is a policy checklist and suppression
// engine, not legal advice. The owner must review the applicable rules and
// confirm the lawful basis before any outreach is recorded or sent.

export const CONTACT_CHANNELS = [
  "email",
  "whatsapp",
  "phone",
  "sms",
  "linkedin",
  "contact_form",
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const SUPPRESSION_SCOPES = [
  "contact",
  "email",
  "phone",
  "domain",
  "business",
  "professional",
] as const;

export type SuppressionScope = (typeof SUPPRESSION_SCOPES)[number];

export const SUPPRESSION_CHANNELS = ["all", ...CONTACT_CHANNELS] as const;

export type SuppressionChannel = (typeof SUPPRESSION_CHANNELS)[number];

export type ComplianceBasis = "legitimate_interest" | "consent" | "unknown" | "restricted";

export type CompliancePolicy = {
  countryCode: string;
  countryName: string;
  region: string;
  emailBasis: ComplianceBasis;
  messagingBasis: ComplianceBasis;
  requiresUnsubscribe: boolean;
  requiresSenderIdentity: boolean;
  requiresPriorConsentForAutomatedMessaging: boolean;
  retentionMonths: number | null;
  ownerReviewRequired: boolean;
  notes: string;
};

// Templates only. Every row is marked owner-review-required because laws and
// platform terms change and depend on the sender, recipient and message.
export const COMPLIANCE_POLICIES: CompliancePolicy[] = [
  {
    countryCode: "GLOBAL",
    countryName: "Global baseline",
    region: "Global",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes:
      "Baseline checklist only. Confirm the lawful basis, platform terms and retention before contacting anyone.",
  },
  {
    countryCode: "RW",
    countryName: "Rwanda",
    region: "Africa",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes:
      "Review Rwanda data-protection and electronic-communications rules, plus the terms of the channel you use.",
  },
  {
    countryCode: "KE",
    countryName: "Kenya",
    region: "Africa",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review Kenya data-protection and electronic-marketing rules before outreach.",
  },
  {
    countryCode: "NG",
    countryName: "Nigeria",
    region: "Africa",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review Nigeria data-protection and electronic-communications rules before outreach.",
  },
  {
    countryCode: "ZA",
    countryName: "South Africa",
    region: "Africa",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review South Africa data-protection and direct-marketing rules before outreach.",
  },
  {
    countryCode: "GB",
    countryName: "United Kingdom",
    region: "Europe",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review UK GDPR/PECR and channel terms. Corporate subscribers and sole traders differ.",
  },
  {
    countryCode: "EU",
    countryName: "European Union",
    region: "Europe",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review GDPR/ePrivacy and the destination country's implementation before outreach.",
  },
  {
    countryCode: "US",
    countryName: "United States",
    region: "North America",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review federal and state marketing/privacy rules; requirements vary by state.",
  },
  {
    countryCode: "CA",
    countryName: "Canada",
    region: "North America",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review CASL and provincial privacy rules before commercial electronic messages.",
  },
  {
    countryCode: "AU",
    countryName: "Australia",
    region: "Oceania",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review the Spam Act and Privacy Act before commercial electronic messages.",
  },
  {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    region: "Middle East",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review UAE data-protection and electronic-marketing rules before outreach.",
  },
  {
    countryCode: "SG",
    countryName: "Singapore",
    region: "Asia",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review PDPA and the Spam Control Act before commercial messages.",
  },
  {
    countryCode: "IN",
    countryName: "India",
    region: "Asia",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review India data-protection and telecom/electronic-marketing rules before outreach.",
  },
  {
    countryCode: "BR",
    countryName: "Brazil",
    region: "South America",
    emailBasis: "unknown",
    messagingBasis: "unknown",
    requiresUnsubscribe: true,
    requiresSenderIdentity: true,
    requiresPriorConsentForAutomatedMessaging: true,
    retentionMonths: 24,
    ownerReviewRequired: true,
    notes: "Review LGPD and consumer-protection rules before outreach.",
  },
];

const COUNTRY_ALIASES: Record<string, string> = {
  rwanda: "RW",
  kenya: "KE",
  nigeria: "NG",
  "south africa": "ZA",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  "united states": "US",
  usa: "US",
  "united states of america": "US",
  canada: "CA",
  australia: "AU",
  "united arab emirates": "AE",
  uae: "AE",
  singapore: "SG",
  india: "IN",
  brazil: "BR",
  "european union": "EU",
  eu: "EU",
};

export function normalizeCountryCode(country: string | null | undefined): string {
  const raw = (country ?? "").trim();
  if (!raw) return "GLOBAL";
  const lower = raw.toLowerCase();
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  if (raw.length === 2) return raw.toUpperCase();
  return "GLOBAL";
}

export function policyForCountry(country: string | null | undefined): CompliancePolicy {
  const code = normalizeCountryCode(country);
  return (
    COMPLIANCE_POLICIES.find((p) => p.countryCode === code) ??
    COMPLIANCE_POLICIES.find((p) => p.countryCode === "GLOBAL")!
  );
}

export function normalizeSuppressionValue(scope: SuppressionScope, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (scope === "email") {
    const email = raw.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  if (scope === "phone") {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return null;
    return raw.startsWith("+") ? `+${digits}` : digits;
  }
  if (scope === "domain") {
    try {
      return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
        .toLowerCase()
        .replace(/^www\./, "");
    } catch {
      return raw.toLowerCase().replace(/^www\./, "") || null;
    }
  }
  if (scope === "business" || scope === "professional") return raw.toLowerCase();
  return raw.toLowerCase();
}

export type SuppressionEntry = {
  id?: string;
  scope: SuppressionScope;
  value: string;
  channel: SuppressionChannel;
  reason: string;
  source?: string | null;
  country?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
};

export type ContactIdentity = {
  email?: string | null;
  phone?: string | null;
  domain?: string | null;
  businessId?: string | null;
  professionalId?: string | null;
};

export function isSuppressionActive(
  entry: Pick<SuppressionEntry, "expiresAt">,
  now: Date = new Date(),
): boolean {
  if (!entry.expiresAt) return true;
  const t = Date.parse(entry.expiresAt);
  return Number.isFinite(t) ? t > now.getTime() : true;
}

export function suppressionMatches(
  entry: SuppressionEntry,
  contact: ContactIdentity,
  channel: ContactChannel,
  now: Date = new Date(),
): boolean {
  if (!isSuppressionActive(entry, now)) return false;
  if (entry.channel !== "all" && entry.channel !== channel) return false;
  const value = normalizeSuppressionValue(entry.scope, entry.value);
  if (!value) return false;
  if (entry.scope === "contact") return true;
  if (entry.scope === "email") {
    return !!contact.email && normalizeSuppressionValue("email", contact.email) === value;
  }
  if (entry.scope === "phone") {
    return !!contact.phone && normalizeSuppressionValue("phone", contact.phone) === value;
  }
  if (entry.scope === "domain") {
    return !!contact.domain && normalizeSuppressionValue("domain", contact.domain) === value;
  }
  if (entry.scope === "business") {
    return !!contact.businessId && contact.businessId.toLowerCase() === value;
  }
  if (entry.scope === "professional") {
    return !!contact.professionalId && contact.professionalId.toLowerCase() === value;
  }
  return false;
}

export type OutreachEligibilityInput = {
  channel: ContactChannel;
  country?: string | null;
  contact: ContactIdentity;
  entries: SuppressionEntry[];
  businessDoNotContact?: boolean;
  professionalDoNotContact?: boolean;
  ownerConfirmedLawfulBasis?: boolean;
  now?: Date;
};

export type OutreachEligibility = {
  status: "allowed" | "review_required" | "blocked";
  allowed: boolean;
  reasons: string[];
  requirements: string[];
  policy: CompliancePolicy;
  matchedEntries: SuppressionEntry[];
};

export function outreachEligibility(input: OutreachEligibilityInput): OutreachEligibility {
  const policy = policyForCountry(input.country);
  const reasons: string[] = [];
  const requirements: string[] = [];
  const now = input.now ?? new Date();

  const matchedEntries = input.entries.filter((entry) =>
    suppressionMatches(entry, input.contact, input.channel, now),
  );
  if (matchedEntries.length > 0) reasons.push("This contact matches an active suppression entry.");
  if (input.businessDoNotContact) reasons.push("The business is marked do-not-contact.");
  if (input.professionalDoNotContact) reasons.push("The professional is marked do-not-contact.");

  const basis =
    input.channel === "email" || input.channel === "contact_form"
      ? policy.emailBasis
      : policy.messagingBasis;

  if (basis === "restricted")
    reasons.push("The selected channel is restricted by the current policy.");
  if (basis === "unknown" || basis === "consent") {
    reasons.push("The lawful basis for this channel is not confirmed.");
  }
  if (input.channel === "linkedin") {
    reasons.push("LinkedIn outreach must be manual and must respect the platform's terms.");
  }
  if (policy.ownerReviewRequired)
    reasons.push("Owner compliance review is required before outreach.");
  if (!input.ownerConfirmedLawfulBasis) {
    reasons.push("The owner has not confirmed the lawful basis for this specific contact.");
  }

  if (matchedEntries.length > 0 || input.businessDoNotContact || input.professionalDoNotContact) {
    return { status: "blocked", allowed: false, reasons, requirements, policy, matchedEntries };
  }

  if (policy.requiresUnsubscribe) requirements.push("Include a clear opt-out/unsubscribe route.");
  if (policy.requiresSenderIdentity)
    requirements.push("Identify the sender and the business clearly.");
  if (policy.requiresPriorConsentForAutomatedMessaging) {
    requirements.push("Do not automate this channel unless prior consent is recorded.");
  }
  if (policy.retentionMonths !== null) {
    requirements.push(`Review or delete the contact data within ${policy.retentionMonths} months.`);
  }
  requirements.push("Check the destination country rules and the channel's current terms.");

  const blockedByPolicy = basis === "restricted";
  const allowed =
    !blockedByPolicy &&
    !!input.ownerConfirmedLawfulBasis &&
    basis !== "unknown" &&
    basis !== "consent" &&
    input.channel !== "linkedin";

  return {
    status: allowed ? "allowed" : "review_required",
    allowed,
    reasons,
    requirements,
    policy,
    matchedEntries,
  };
}

export type ComplianceSummary = {
  total: number;
  active: number;
  expired: number;
  byChannel: Record<string, number>;
};

export function complianceSummary(
  entries: SuppressionEntry[],
  now: Date = new Date(),
): ComplianceSummary {
  const byChannel: Record<string, number> = {};
  let active = 0;
  let expired = 0;
  for (const entry of entries) {
    if (isSuppressionActive(entry, now)) {
      active++;
      byChannel[entry.channel] = (byChannel[entry.channel] ?? 0) + 1;
    } else {
      expired++;
    }
  }
  return { total: entries.length, active, expired, byChannel };
}

export function contactChannelLabel(channel: ContactChannel): string {
  return channel
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
