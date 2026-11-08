// Decides whether a discovered business is a real GARE opportunity.
//
// GARE sells website creation, repair, performance, redesign and maintenance.
// A business is in focus when it has no website, or when its existing site has
// an observable problem that one of those services fixes. A reachable, secure,
// mobile, current site with a contact path is healthy and stays out of the
// default view.
//
// Pure: classification uses only stored evidence, so the same rules apply in
// the pipeline, tests and future reports.

export type WebsiteProbe = {
  url: string | null;
  reachable: boolean | null;
  status: number | null;
  https: boolean | null;
  load_ms: number | null;
  has_viewport_meta: boolean | null;
  has_contact_form: boolean | null;
  has_email_link: boolean | null;
  has_whatsapp_link: boolean | null;
  has_online_booking_or_shop: boolean | null;
  copyright_year: number | null;
  title: string | null;
  error: string | null;
  checked_at: string;
};

export type WebsiteLeadState = "no_website" | "needs_work" | "healthy" | "unchecked";

export type WebsiteNeedKey =
  "no_website" | "site_unreachable" | "no_https" | "slow_site" | "not_mobile" | "outdated_site";

export type WebsiteNeed = {
  key: WebsiteNeedKey;
  label: string;
  evidence: string;
  service: string;
  severity: "high" | "medium" | "low";
};

export type WebsiteAssessment = {
  state: WebsiteLeadState;
  qualified: boolean;
  needs: WebsiteNeed[];
  headline: string;
};

export type WebsiteInput = {
  website?: string | null;
  websiteProbe?: WebsiteProbe | null;
  websiteCheck?: { confidence?: string | null } | null;
};

const SEVERITY_RANK: Record<WebsiteNeed["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function need(
  key: WebsiteNeedKey,
  label: string,
  evidence: string,
  service: string,
  severity: WebsiteNeed["severity"],
): WebsiteNeed {
  return { key, label, evidence, service, severity };
}

export function assessWebsite(input: WebsiteInput, now: Date = new Date()): WebsiteAssessment {
  const website = input.website?.trim();
  if (!website) {
    const doubleChecked = input.websiteCheck?.confidence === "none_found";
    return {
      state: "no_website",
      qualified: true,
      needs: [
        need(
          "no_website",
          "No website",
          doubleChecked
            ? "No website was found after the listing was double-checked."
            : "No website is listed on the business profile.",
          "Website Development",
          "high",
        ),
      ],
      headline: "No website",
    };
  }

  const probe = input.websiteProbe;
  if (!probe) {
    return {
      state: "unchecked",
      qualified: false,
      needs: [],
      headline: "Website not checked",
    };
  }

  if (probe.reachable === false || (probe.status != null && probe.status >= 400)) {
    if (probe.status === 401 || probe.status === 403) {
      return {
        state: "unchecked",
        qualified: false,
        needs: [],
        headline: "Website blocked the check",
      };
    }
    return {
      state: "needs_work",
      qualified: true,
      needs: [
        need(
          "site_unreachable",
          "Website does not load",
          `The website could not be reached${probe.status ? ` (status ${probe.status})` : ""}.`,
          "Website Repair",
          "high",
        ),
      ],
      headline: "Website does not load",
    };
  }

  if (probe.reachable !== true) {
    return {
      state: "unchecked",
      qualified: false,
      needs: [],
      headline: "Website not checked",
    };
  }

  const needs: WebsiteNeed[] = [];
  if (probe.https === false) {
    needs.push(
      need(
        "no_https",
        "Website is not secure",
        "The site is served over HTTP instead of HTTPS.",
        "Website Repair",
        "high",
      ),
    );
  }
  if (probe.load_ms != null && probe.load_ms > 3000) {
    needs.push(
      need(
        "slow_site",
        "Website loads slowly",
        `Measured load time was ${probe.load_ms} ms (over 3 seconds).`,
        "Website Performance Improvement",
        probe.load_ms > 6000 ? "high" : "medium",
      ),
    );
  }
  if (probe.has_viewport_meta === false) {
    needs.push(
      need(
        "not_mobile",
        "Website is not mobile-ready",
        "No mobile viewport meta tag was found on the page.",
        "Website Redesign",
        "high",
      ),
    );
  }
  if (probe.copyright_year != null && now.getFullYear() - probe.copyright_year >= 3) {
    needs.push(
      need(
        "outdated_site",
        "Website content is outdated",
        `The newest copyright year found on the site is ${probe.copyright_year}.`,
        "Website Maintenance",
        "medium",
      ),
    );
  }
  needs.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  if (needs.length === 0) {
    return {
      state: "healthy",
      qualified: false,
      needs: [],
      headline: "Website healthy",
    };
  }

  return {
    state: "needs_work",
    qualified: true,
    needs,
    headline: needs[0]!.label,
  };
}
