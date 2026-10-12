// Business intelligence assembly: turn a business + its investigation findings
// into (a) observable problems and (b) service recommendations based on the
// owner's ACTIVE offers. Pure so the modal can render from stored data and the
// rules stay unit-tested.
import { INDUSTRIES, classifyIndustry, type IndustryKey } from "@/lib/rwanda";
import {
  buildServiceCatalog,
  matchServices,
  PROBLEM_KEYS,
  type CompanySize,
  type MatchExplanation,
  type ObservedProblem,
  type Severity,
} from "@/lib/service-match";
import type { VerificationStatus } from "@/lib/provenance";

export type IntelBusiness = {
  name?: string | null;
  category?: string | null;
  website?: string | null;
  industry?: string | null;
  employees_min?: number | null;
  employees_max?: number | null;
};

export type IntelFindings = {
  url?: string | null;
  reachable?: boolean | null;
  status?: number | null;
  load_ms?: number | null;
  has_viewport_meta?: boolean | null;
  has_contact_form?: boolean | null;
  has_email_link?: boolean | null;
  has_whatsapp_link?: boolean | null;
  has_online_booking_or_shop?: boolean | null;
  copyright_year?: number | null;
};

export type WebsiteCheck =
  { confidence?: string | null; source?: string | null } | null | undefined;

export type IntelInput = {
  business: IntelBusiness;
  findings: IntelFindings | null | undefined;
  websiteCheck?: WebsiteCheck;
  // When the investigation ran. Observed problems carry this as their date.
  observedAt: string;
};

export function companySize(biz: IntelBusiness): CompanySize {
  const max = biz.employees_max ?? biz.employees_min ?? null;
  if (max == null) return "unknown";
  if (max <= 9) return "micro";
  if (max <= 49) return "small";
  if (max <= 249) return "medium";
  return "large";
}

export function businessIndustry(biz: IntelBusiness): IndustryKey | null {
  const fromCategory = classifyIndustry(`${biz.category ?? ""} ${biz.name ?? ""}`);
  if (fromCategory) return fromCategory;
  const key = biz.industry?.trim();
  if (key && INDUSTRIES.some((i) => i.key === key)) return key as IndustryKey;
  return null;
}

export type SeverityHint = { key: string; label: string; evidence: string; severity: Severity };

// Observed problems derived strictly from the recorded website probe and the
// double-checked "no website" state. Nothing is inferred beyond the measurements.
export function deriveObservedProblems(input: IntelInput): ObservedProblem[] {
  const { business: biz, findings, websiteCheck } = input;
  const at = input.observedAt;
  const source = findings?.url ? "website" : "google";
  const status: VerificationStatus = "single_source";
  const out: ObservedProblem[] = [];
  const add = (
    key: string,
    label: string,
    evidence: string,
    confidence: number,
    severity: Severity,
  ) => out.push({ key, label, evidence, source, observed_at: at, confidence, severity, status });

  if (!biz.website && websiteCheck?.confidence === "none_found") {
    add(
      PROBLEM_KEYS.noWebsite,
      "No website found",
      "No website could be found for this business (double-checked).",
      0.8,
      "high",
    );
  }

  if (findings) {
    if (findings.reachable === true) {
      if (findings.load_ms != null && findings.load_ms > 3000) {
        add(
          PROBLEM_KEYS.slowSite,
          "Website loads slowly",
          `Measured load time ${findings.load_ms} ms (over 3 seconds).`,
          0.8,
          findings.load_ms > 6000 ? "high" : "medium",
        );
      }
      if (findings.has_viewport_meta === false) {
        add(
          PROBLEM_KEYS.notMobile,
          "Website not mobile-ready",
          "No mobile viewport meta tag was found on the page.",
          0.85,
          "high",
        );
      }
      const cy = findings.copyright_year;
      if (cy != null && new Date(at).getFullYear() - cy >= 3) {
        add(
          PROBLEM_KEYS.outdatedContent,
          "Outdated website content",
          `The newest copyright year on the site is ${cy}.`,
          0.65,
          "medium",
        );
      }
      const hasContact =
        findings.has_contact_form === true ||
        findings.has_email_link === true ||
        findings.has_whatsapp_link === true;
      if (!hasContact) {
        add(
          PROBLEM_KEYS.noContactChannel,
          "No clear contact channel",
          "No contact form, email link or WhatsApp link was found on the site.",
          0.65,
          "medium",
        );
      }
      if (findings.has_online_booking_or_shop === false) {
        add(
          PROBLEM_KEYS.noBooking,
          "No online booking or ordering",
          "No booking or shop capability was detected on the site.",
          0.55,
          "low",
        );
      }
    } else if (findings.reachable === false) {
      add(
        PROBLEM_KEYS.slowSite,
        "Website did not load",
        `The website could not be reached (status ${findings.status ?? "unknown"}).`,
        0.75,
        "high",
      );
    }
  }

  return out;
}

export type ServiceRecommendation = MatchExplanation;

// Recommended services = the owner's active offers that address at least one
// observed problem. Offers with no credible link are never suggested.
export function recommendServices(
  input: IntelInput,
  offerNames: string[],
  now: Date = new Date(),
): MatchExplanation[] {
  const problems = deriveObservedProblems(input);
  if (problems.length === 0) return [];
  const catalog = buildServiceCatalog(offerNames);
  const industry = businessIndustry(input.business);
  const size = companySize(input.business);
  return matchServices(problems, catalog, offerNames, { industry, size, now });
}
