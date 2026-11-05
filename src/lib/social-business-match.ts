import { nameSimilarity, normalizeDomain, normalizePhone } from "./company-identity";
import type { VerificationStatus } from "./provenance";
import {
  extractPhone,
  isLinkHub,
  isWhatsAppLink,
  phoneFromWhatsAppLink,
  socialLeadPlatformLabel,
} from "./social-leads";

export type SocialAccountType =
  "confirmed_business" | "probable_business" | "individual_seller" | "unknown";

export const SOCIAL_ACCOUNT_TYPE_LABELS: Record<SocialAccountType, string> = {
  confirmed_business: "Confirmed business",
  probable_business: "Probable business",
  individual_seller: "Individual seller",
  unknown: "Unknown account type",
};

export function socialAccountTypeLabel(value: string): string {
  return SOCIAL_ACCOUNT_TYPE_LABELS[
    value === "confirmed_business" || value === "probable_business" || value === "individual_seller"
      ? value
      : "unknown"
  ];
}

export type SocialMatchStatus =
  "high_confidence" | "possible" | "conflicting" | "confirmed" | "rejected";

export type SocialMatchSignalKind = "phone" | "domain" | "name" | "location";

export type SocialMatchSignal = {
  kind: SocialMatchSignalKind;
  business_value: string | null;
  social_value: string | null;
  strength: number;
  note: string;
};

export type SocialMatchEvidence = {
  id: string;
  kind: "business" | "social_lead" | "website" | "account_type";
  label: string;
  value: string | null;
  url: string | null;
  observed_at: string | null;
};

export type SocialAccountClassification = {
  type: SocialAccountType;
  confidence: number;
  reasons: string[];
  evidence: SocialMatchEvidence[];
};

export type SocialOpportunityGap = {
  key: string;
  category: string;
  label: string;
  evidence: string;
  source: string;
  verification_status: VerificationStatus;
  confidence: number;
  last_checked_at: string;
};

export type SocialSolutionFit = {
  solution: "DukaLinka" | "GENERAS Digital" | "GENERAS Systems" | "Custom software";
  gap_keys: string[];
  why: string;
  confidence: number;
  hypothesis: boolean;
  uncertainties: string[];
};

export type SocialMatchBusiness = {
  id: string;
  name: string;
  legal_name?: string | null;
  trading_names?: string[] | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  place_id?: string | null;
  maps_url?: string | null;
  category?: string | null;
  description?: string | null;
  products_services?: string | null;
  website_check?: unknown;
  source?: string | null;
};

export type SocialMatchLead = {
  id: string;
  platform: string;
  handle: string;
  profile_url: string;
  display_name?: string | null;
  biography?: string | null;
  category?: string | null;
  district?: string | null;
  website?: string | null;
  website_status: string;
  store_status: string;
  contact_phone?: string | null;
  contact_whatsapp?: string | null;
  followers_count?: number | null;
  last_post_at?: string | null;
  last_checked_at?: string | null;
  updated_at?: string | null;
  source?: string | null;
  business_id?: string | null;
};

export type SocialMatchCandidate = {
  business_id: string;
  business_name: string;
  status: SocialMatchStatus;
  confidence: number;
  reason: string;
  signals: SocialMatchSignal[];
  evidence: SocialMatchEvidence[];
  opportunity_gaps: SocialOpportunityGap[];
  solution_fits: SocialSolutionFit[];
  matched_at: string;
};

export type SocialLeadMatchAnalysis = {
  social_lead_id: string;
  account: SocialAccountClassification;
  candidates: SocialMatchCandidate[];
  auto_link_business_id: string | null;
};

const BUSINESS_WORDS =
  /\b(shop|store|boutique|company|co\.?|ltd|limited|sarl|plc|official|brand|business|enterprise|enterprises|supplier|distributor|wholesale|retail|salon|spa|restaurant|cafe|bakery|hotel|lodge|clinic|pharmacy|academy|school|studio|agency|services|solutions|trading|imports?|exports?|farms?|manufactur\w*|tailors?|fashion house)\b/i;

const INDIVIDUAL_WORDS =
  /\b(i sell|i make|my shop|my business|freelance|freelancer|personal|individual seller|student|influencer|model|artist|photographer|stylist|consultant)\b/i;

const SELLER_WORDS =
  /\b(sell|selling|order|orders|dm|whatsapp|delivery|deliver|available|price|prices|catalog|catalogue|shop|store|boutique|handmade|custom)\b/i;

const SHARED_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "linkedin.com",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "linkin.bio",
  "beacons.ai",
  "bio.link",
  "taplink.cc",
  "campsite.bio",
  "linkr.bio",
  "lnk.bio",
  "bit.ly",
  "t.co",
  "goo.gl",
  "maps.app.goo.gl",
]);

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function observedAt(lead: SocialMatchLead, now: Date): string {
  return lead.last_checked_at ?? lead.updated_at ?? lead.last_post_at ?? now.toISOString();
}

function usableDomain(value: string | null | undefined): string | null {
  if (!value || isLinkHub(value) || isWhatsAppLink(value)) return null;
  const domain = normalizeDomain(value);
  if (!domain || SHARED_DOMAINS.has(domain)) return null;
  return domain;
}

function socialNames(lead: SocialMatchLead): string[] {
  const handleName = lead.handle
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(
    new Set([lead.display_name?.trim(), handleName].filter((value): value is string => !!value)),
  );
}

function businessNames(business: SocialMatchBusiness): string[] {
  return Array.from(
    new Set(
      [business.name, business.legal_name, ...(business.trading_names ?? [])].filter(
        (value): value is string => !!value?.trim(),
      ),
    ),
  );
}

function strongestNameSimilarity(lead: SocialMatchLead, business: SocialMatchBusiness): number {
  let best = 0;
  for (const socialName of socialNames(lead)) {
    for (const businessName of businessNames(business)) {
      best = Math.max(best, nameSimilarity(socialName, businessName));
    }
  }
  return best;
}

function socialPhone(lead: SocialMatchLead): string | null {
  return (
    normalizePhone(lead.contact_phone) ??
    normalizePhone(phoneFromWhatsAppLink(lead.contact_whatsapp)) ??
    normalizePhone(lead.contact_whatsapp) ??
    normalizePhone(extractPhone(lead.biography))
  );
}

function locationRelation(
  lead: SocialMatchLead,
  business: SocialMatchBusiness,
): { compatible: boolean | null; value: string | null; note: string } {
  const leadDistrict = lead.district?.trim().toLowerCase() || null;
  const businessDistrict = business.district?.trim().toLowerCase() || null;
  if (leadDistrict && businessDistrict) {
    if (leadDistrict === businessDistrict) {
      return {
        compatible: true,
        value: lead.district ?? null,
        note: `Both records point to ${lead.district}.`,
      };
    }
    return {
      compatible: false,
      value: lead.district ?? null,
      note: "The social profile and business listing name different districts.",
    };
  }

  const leadProvince = lead.biography?.toLowerCase() ?? "";
  const businessProvince = business.province?.toLowerCase() ?? "";
  if (leadProvince && businessProvince && leadProvince.includes(businessProvince)) {
    return {
      compatible: true,
      value: business.province ?? null,
      note: "The social profile mentions the same province as the business listing.",
    };
  }

  return {
    compatible: null,
    value: lead.district ?? business.district ?? null,
    note: "Location could not be compared from the recorded fields.",
  };
}

function accountClassification(lead: SocialMatchLead, at: string): SocialAccountClassification {
  const text = [lead.display_name, lead.biography, lead.category].filter(Boolean).join(" ");
  const businessHits = text.match(new RegExp(BUSINESS_WORDS.source, "gi")) ?? [];
  const sellerHit = SELLER_WORDS.test(text);
  const individualHit = INDIVIDUAL_WORDS.test(text);
  const reasons: string[] = [];
  const evidence: SocialMatchEvidence[] = [
    {
      id: `social:${lead.id}`,
      kind: "social_lead",
      label: `${socialLeadPlatformLabel(lead.platform)} profile @${lead.handle}`,
      value: lead.profile_url,
      url: lead.profile_url,
      observed_at: at,
    },
  ];

  if (businessHits.length > 0)
    reasons.push(`Profile text uses business wording: ${businessHits[0]}.`);
  if (lead.category) reasons.push(`Recorded category: ${lead.category}.`);
  if (sellerHit) reasons.push("Profile text includes selling or ordering language.");
  if (individualHit) reasons.push("Profile text includes personal or individual-seller language.");

  let type: SocialAccountType = "unknown";
  if (businessHits.length >= 2 || (businessHits.length === 1 && lead.category)) {
    type = "probable_business";
  } else if (individualHit && !businessHits.length) {
    type = "individual_seller";
  } else if (sellerHit) {
    type = "individual_seller";
  }

  if (type === "unknown") {
    reasons.push("The profile does not contain enough recorded evidence to classify the account.");
  }

  return {
    type,
    confidence:
      type === "probable_business"
        ? clamp(0.55 + businessHits.length * 0.12 + (lead.category ? 0.1 : 0), 0, 0.85)
        : type === "individual_seller"
          ? 0.55
          : 0.25,
    reasons,
    evidence,
  };
}

function gapVerification(lead: SocialMatchLead): VerificationStatus {
  if (lead.source === "instagram_api") return "single_source";
  if (lead.source === "manual_import") return "unverified";
  return "unknown";
}

function gapConfidence(lead: SocialMatchLead): number {
  return lead.source === "instagram_api" ? 0.65 : 0.45;
}

export function findOpportunityGaps(
  lead: SocialMatchLead,
  business: SocialMatchBusiness,
  now: Date = new Date(),
): SocialOpportunityGap[] {
  const at = observedAt(lead, now);
  const status = gapVerification(lead);
  const confidence = gapConfidence(lead);
  const website = usableDomain(lead.website);
  const businessWebsite = usableDomain(business.website);
  const gaps: SocialOpportunityGap[] = [];
  const add = (
    key: string,
    category: string,
    label: string,
    evidence: string,
    source = "social_profile",
    gapStatus = status,
    gapConfidenceValue = confidence,
  ) => {
    gaps.push({
      key,
      category,
      label,
      evidence,
      source,
      verification_status: gapStatus,
      confidence: gapConfidenceValue,
      last_checked_at: at,
    });
  };

  switch (lead.website_status) {
    case "none":
      add(
        "no_website",
        "Digital presence",
        "No owned website found",
        "The social profile has no website link recorded.",
      );
      break;
    case "dead":
      add(
        "dead_website",
        "Digital presence",
        "Website listed but not working",
        "The social profile links to a website that was recorded as down.",
      );
      break;
    case "link_hub":
      add(
        "link_hub_only",
        "Digital presence",
        "Link hub instead of an owned website",
        "The profile uses a link-aggregation page rather than an owned site.",
      );
      break;
    case "whatsapp":
      add(
        "whatsapp_website_only",
        "Digital presence",
        "WhatsApp link instead of a website",
        "The profile uses a WhatsApp link rather than an owned website.",
      );
      break;
    default:
      break;
  }

  switch (lead.store_status) {
    case "none":
      add(
        "no_online_store",
        "Sales channel",
        "No online store found",
        "No owned online store was recorded for this social profile.",
      );
      break;
    case "link_hub":
      add(
        "store_link_hub",
        "Sales channel",
        "Orders rely on a link hub",
        "The recorded sales path is a link hub, not an owned product catalogue.",
      );
      break;
    case "whatsapp_only":
      add(
        "store_whatsapp_only",
        "Sales channel",
        "Orders happen in WhatsApp",
        "The recorded sales path is WhatsApp only, without a browsable catalogue.",
      );
      break;
    case "live_store":
      break;
    default:
      if (lead.website_status === "live" && website) {
        add(
          "store_not_confirmed",
          "Sales channel",
          "Online ordering not confirmed",
          "A website is recorded, but an online store or checkout was not confirmed.",
          "social_profile",
          "unknown" as VerificationStatus,
          0.3,
        );
      }
  }

  if (!lead.contact_phone && !lead.contact_whatsapp && !extractPhone(lead.biography)) {
    add(
      "no_contact_capture",
      "Contact capture",
      "No direct contact channel recorded",
      "No phone or WhatsApp number was found in the recorded public profile data.",
    );
  }

  if (
    website &&
    businessWebsite &&
    website !== businessWebsite &&
    (lead.store_status === "whatsapp_only" || lead.store_status === "link_hub")
  ) {
    add(
      "social_checkout_not_owned",
      "Sales channel",
      "Social orders are separate from the owned website",
      `The profile sells through ${lead.website}, while the business record lists ${business.website}.`,
      "cross_source",
      "single_source",
      0.55,
    );
  }

  return gaps;
}

export function matchSolutions(gaps: SocialOpportunityGap[]): SocialSolutionFit[] {
  if (gaps.length === 0) return [];
  const byKey = new Map(gaps.map((gap) => [gap.key, gap]));
  const fits: SocialSolutionFit[] = [];
  const add = (
    solution: SocialSolutionFit["solution"],
    keys: string[],
    why: string,
    factor: number,
    uncertaintyExtra: string[] = [],
  ) => {
    const matched = keys
      .map((key) => byKey.get(key))
      .filter((gap): gap is SocialOpportunityGap => !!gap);
    if (matched.length === 0) return;
    const confidence = clamp(Math.max(...matched.map((gap) => gap.confidence)) * factor, 0, 0.9);
    fits.push({
      solution,
      gap_keys: matched.map((gap) => gap.key),
      why,
      confidence,
      hypothesis:
        confidence < 0.7 || matched.some((gap) => gap.verification_status !== "single_source"),
      uncertainties: [
        "Owner interest, budget and willingness to change are not verified.",
        ...uncertaintyExtra,
        ...(matched.some((gap) => gap.verification_status !== "single_source")
          ? ["At least one gap is unverified rather than measured."]
          : []),
      ],
    });
  };

  add(
    "DukaLinka",
    ["no_online_store", "store_link_hub", "store_whatsapp_only", "no_website", "dead_website"],
    "The recorded sales path has no owned online store or catalogue. DukaLinka is the closest product fit for product listings, orders and a repeatable checkout.",
    0.9,
  );
  add(
    "GENERAS Digital",
    ["no_website", "dead_website", "link_hub_only", "whatsapp_website_only", "store_not_confirmed"],
    "The recorded digital presence depends on social or link-hub pages. GENERAS Digital covers a controlled website and enquiry path.",
    0.82,
  );
  add(
    "GENERAS Systems",
    ["store_whatsapp_only", "store_link_hub", "social_checkout_not_owned", "no_online_store"],
    "Orders and catalogue data appear to live in messaging or links. GENERAS Systems covers order, catalogue or back-office workflow tooling.",
    0.72,
  );

  if (gaps.length >= 2) {
    add(
      "Custom software",
      gaps.map((gap) => gap.key),
      "More than one recorded gap spans presence, selling and contact handling. A custom workflow may fit, but it is only a hypothesis until the owner confirms the process.",
      0.55,
      ["Custom software is only relevant if the owner confirms a workflow problem."],
    );
  }

  return fits
    .filter((fit, index, all) => all.findIndex((item) => item.solution === fit.solution) === index)
    .sort((a, b) => b.confidence - a.confidence);
}

function reasonFor(
  status: SocialMatchStatus,
  signals: SocialMatchSignal[],
  business: SocialMatchBusiness,
  lead: SocialMatchLead,
): string {
  const parts: string[] = [];
  const phone = signals.find((signal) => signal.kind === "phone");
  const domain = signals.find((signal) => signal.kind === "domain");
  const name = signals.find((signal) => signal.kind === "name");
  const location = signals.find((signal) => signal.kind === "location");

  if (phone) parts.push("the recorded phone number matches");
  if (domain)
    parts.push(`the website domain ${domain.business_value ?? domain.social_value} matches`);
  if (name && name.strength >= 0.78) parts.push("the names are strongly similar");
  else if (name) parts.push("the names are only partly similar");
  if (location?.business_value) parts.push(location.note);

  if (status === "conflicting") {
    return `Conflicting evidence: ${parts.join(", ") || "identity signals disagree"}. Review before linking ${lead.display_name || `@${lead.handle}`} to ${business.name}.`;
  }
  if (parts.length === 0) {
    return `No independent identity signal links @${lead.handle} to ${business.name}.`;
  }
  return `${parts.join(", ")}. ${status === "high_confidence" ? "Several independent identifiers support this link." : "This remains a candidate until the owner confirms it."}`;
}

function signalsFor(
  phoneMatch: boolean,
  domainMatch: boolean,
  nameSimilarityValue: number,
  location: ReturnType<typeof locationRelation>,
  business: SocialMatchBusiness,
  lead: SocialMatchLead,
): SocialMatchSignal[] {
  const signals: SocialMatchSignal[] = [];
  if (phoneMatch) {
    signals.push({
      kind: "phone",
      business_value: business.phone ?? null,
      social_value: lead.contact_phone ?? lead.contact_whatsapp ?? extractPhone(lead.biography),
      strength: 1,
      note: "The normalized phone numbers are identical.",
    });
  }
  if (domainMatch) {
    signals.push({
      kind: "domain",
      business_value: usableDomain(business.website),
      social_value: usableDomain(lead.website),
      strength: 1,
      note: "The recorded website domains are identical.",
    });
  }
  if (nameSimilarityValue > 0) {
    signals.push({
      kind: "name",
      business_value: business.name,
      social_value: lead.display_name ?? lead.handle,
      strength: nameSimilarityValue,
      note: `Name similarity is ${Math.round(nameSimilarityValue * 100)}%.`,
    });
  }
  if (location.compatible !== null) {
    signals.push({
      kind: "location",
      business_value: business.district ?? business.province ?? null,
      social_value: lead.district ?? null,
      strength: location.compatible ? 0.5 : 0,
      note: location.note,
    });
  }
  return signals;
}

export function analyzeSocialLeadAgainstBusinesses(
  lead: SocialMatchLead,
  businesses: SocialMatchBusiness[],
  now: Date = new Date(),
): SocialLeadMatchAnalysis {
  const at = now.toISOString();
  const account = accountClassification(lead, observedAt(lead, now));
  const leadPhone = socialPhone(lead);
  const leadDomain = usableDomain(lead.website);
  const candidates: SocialMatchCandidate[] = [];

  for (const business of businesses) {
    if (business.id === lead.business_id) {
      continue;
    }
    const businessPhone = normalizePhone(business.phone);
    const businessDomain = usableDomain(business.website);
    const phoneMatch = Boolean(leadPhone && businessPhone && leadPhone === businessPhone);
    const domainMatch = Boolean(leadDomain && businessDomain && leadDomain === businessDomain);
    const nameScore = strongestNameSimilarity(lead, business);
    const location = locationRelation(lead, business);
    const contactMatched = phoneMatch || domainMatch;
    const strongName = nameScore >= 0.78;
    const contradictory = contactMatched && (nameScore < 0.35 || location.compatible === false);
    const conflicting = contradictory;

    let status: SocialMatchStatus | null = null;
    if (conflicting) {
      status = "conflicting";
    } else if (
      (phoneMatch && domainMatch) ||
      (phoneMatch && (strongName || location.compatible === true)) ||
      (domainMatch && strongName && location.compatible !== false) ||
      (phoneMatch && nameScore >= 0.5 && location.compatible === true)
    ) {
      status = "high_confidence";
    } else if (contactMatched || (strongName && location.compatible === true)) {
      status = "possible";
    }

    if (!status) continue;

    const signals = signalsFor(phoneMatch, domainMatch, nameScore, location, business, lead);
    let confidence = 0;
    if (phoneMatch) confidence += 0.5;
    if (domainMatch) confidence += 0.45;
    confidence += nameScore * 0.2;
    if (location.compatible === true) confidence += 0.05;
    confidence = clamp(confidence);
    if (status === "high_confidence") confidence = Math.max(confidence, 0.76);
    if (status === "possible") confidence = clamp(confidence, 0.3, 0.72);
    if (status === "conflicting") confidence = clamp(confidence, 0.25, 0.7);

    const gaps = findOpportunityGaps(lead, business, now);
    const evidence: SocialMatchEvidence[] = [
      {
        id: `business:${business.id}`,
        kind: "business",
        label: "Existing business record",
        value: business.place_id ?? business.id,
        url: business.maps_url ?? null,
        observed_at: null,
      },
      {
        id: `social:${lead.id}`,
        kind: "social_lead",
        label: `${socialLeadPlatformLabel(lead.platform)} profile @${lead.handle}`,
        value: lead.profile_url,
        url: lead.profile_url,
        observed_at: observedAt(lead, now),
      },
    ];
    if (lead.website) {
      evidence.push({
        id: `social-website:${lead.id}`,
        kind: "website",
        label: "Website recorded on the social profile",
        value: lead.website,
        url: lead.website,
        observed_at: observedAt(lead, now),
      });
    }

    candidates.push({
      business_id: business.id,
      business_name: business.name,
      status,
      confidence,
      reason: reasonFor(status, signals, business, lead),
      signals,
      evidence,
      opportunity_gaps: gaps,
      solution_fits: matchSolutions(gaps),
      matched_at: at,
    });
  }

  const ordered = candidates.sort((a, b) => {
    const rank: Record<SocialMatchStatus, number> = {
      high_confidence: 0,
      possible: 1,
      conflicting: 2,
      confirmed: 3,
      rejected: 4,
    };
    return rank[a.status] - rank[b.status] || b.confidence - a.confidence;
  });

  const high = ordered.filter((candidate) => candidate.status === "high_confidence");
  const conflicting = ordered.some((candidate) => candidate.status === "conflicting");
  const autoLink =
    !lead.business_id && high.length === 1 && !conflicting ? high[0]!.business_id : null;

  if (autoLink) {
    account.type = "confirmed_business";
    account.confidence = Math.max(account.confidence, 0.8);
    account.reasons = [
      ...account.reasons,
      "Multiple independent identifiers match an existing Google Places business record.",
    ];
    account.evidence = [
      ...account.evidence,
      {
        id: `business-match:${autoLink}`,
        kind: "account_type",
        label: "Matched to an existing business record",
        value: high[0]!.business_name,
        url: null,
        observed_at: at,
      },
    ];
  }

  return {
    social_lead_id: lead.id,
    account,
    candidates: ordered.slice(0, 5),
    auto_link_business_id: autoLink,
  };
}

export function classifySocialAccount(
  lead: SocialMatchLead,
  now: Date = new Date(),
): SocialAccountClassification {
  return accountClassification(lead, observedAt(lead, now));
}

export function matchStatusLabel(status: SocialMatchStatus): string {
  switch (status) {
    case "high_confidence":
      return "High-confidence match";
    case "possible":
      return "Possible match";
    case "conflicting":
      return "Conflicting evidence";
    case "confirmed":
      return "Confirmed by owner";
    case "rejected":
      return "Rejected";
  }
}

export function matchStatusVariant(
  status: SocialMatchStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed" || status === "high_confidence") return "default";
  if (status === "conflicting" || status === "rejected") return "destructive";
  return "secondary";
}
