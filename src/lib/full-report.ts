import type { ProspectVerification } from "@/lib/prospect-verification";
import {
  PROMPT_PLATFORM_LABELS,
  REQUESTED_DELIVERABLE_LABELS,
  SOLUTION_INTENT_LABELS,
  SOLUTION_TYPE_LABELS,
  latestPromptPerPlatform,
  type PromptQuality,
  type RequestedDeliverable,
  type SolutionEvidence,
  type SolutionIntent,
  type SolutionRequirementGroup,
  type SolutionType,
} from "@/lib/solution-builder";
import type { MatchExplanation } from "@/lib/service-match";
import { businessIndustry, companySize } from "@/lib/business-intel";
import { industryLabel } from "@/lib/rwanda";
import { OUTREACH_PACK_CHANNELS } from "@/lib/outreach-pack";
import { evidenceFrom, qualityFrom, requirementsFrom, stringList } from "@/lib/solution-data";

export const REPORT_SECTIONS = [
  {
    key: "profile",
    label: "Business profile",
    description: "Contact details, location, company size, hours and social presence.",
  },
  {
    key: "verification",
    label: "Prospect verification",
    description: "Website, presence, operating, location and evidence checks with priority.",
  },
  {
    key: "investigation",
    label: "Investigation report",
    description: "AI interpretation, evidence-backed problems, visibility and website evidence.",
  },
  {
    key: "recommendations",
    label: "Recommended services",
    description: "Matches between observed problems and your active offers.",
  },
  {
    key: "solutions",
    label: "Solution recommendations and prompts",
    description: "Solution packages, evidence, requirements and every latest platform prompt.",
  },
  {
    key: "outreach",
    label: "Outreach messages",
    description: "Email, WhatsApp and SMS messages, including their saved status.",
  },
] as const;

export type ReportSectionKey = (typeof REPORT_SECTIONS)[number]["key"];
export type ReportFormat = "html" | "markdown";

export const REPORT_SECTION_KEYS = REPORT_SECTIONS.map((section) => section.key);

export type ReportBusiness = {
  name: string;
  legal_name?: string | null;
  tin?: string | null;
  category?: string | null;
  sector?: string | null;
  industry?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  phone?: string | null;
  emails?: string[] | null;
  website?: string | null;
  maps_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  business_status?: string | null;
  open_now?: boolean | null;
  opening_hours?: { weekday_descriptions?: string[] | null } | null;
  employees_min?: number | null;
  employees_max?: number | null;
  founded_date?: string | null;
  website_check?: { confidence?: string | null; source?: string | null } | null;
};

export type ReportFindings = {
  url?: string | null;
  reachable?: boolean | null;
  status?: number | null;
  load_ms?: number | null;
  has_viewport_meta?: boolean | null;
  has_contact_form?: boolean | null;
  has_online_booking_or_shop?: boolean | null;
  copyright_year?: number | null;
  error?: string | null;
  socials?: Record<string, string> | null;
  visibility?: {
    score: number;
    breakdown: { label: string; points: number; max: number }[];
  } | null;
};

export type ReportAnalysis = {
  overview?: string | null;
  problems?: { problem: string; evidence: string; severity: string }[] | null;
  recommended_offer?: string | null;
  offer_reasoning?: string | null;
  confidence?: string | null;
  estimated_deal_value_usd?: number | null;
  conversion_probability?: string | null;
  delivery_effort?: string | null;
  next_action?: string | null;
};

export type ReportInvestigation = {
  created_at: string;
  findings: ReportFindings | null;
  report: ReportAnalysis | null;
};

export type ReportSolutionPrompt = {
  platform: string;
  version: number;
  prompt: string;
  provider: string | null;
  model: string | null;
  quality: PromptQuality | null;
  created_at: string | null;
};

export type ReportSolution = {
  title: string;
  summary: string;
  whyRecommended: string;
  intent: string;
  requestedDeliverable: string;
  solutionType: string;
  hypothesis: boolean;
  confidence: number;
  status: string;
  maintenanceRequired: boolean;
  evidence: SolutionEvidence[];
  requirements: SolutionRequirementGroup[];
  assumptions: string[];
  unknowns: string[];
  prompts: ReportSolutionPrompt[];
};

export type ReportOutreachMessage = {
  channel: string | null;
  title: string | null;
  body: string;
  status: string;
  created_at: string;
};

export type ReportSolutionRow = {
  id: string;
  title: string;
  summary: string;
  why_recommended: string;
  intent: string;
  requested_deliverable: string;
  solution_type: string;
  hypothesis: boolean;
  confidence: number;
  status: string;
  maintenance_required: boolean;
  evidence: unknown;
  requirements: unknown;
  assumptions: unknown;
  unknowns: unknown;
};

export type ReportPromptRow = {
  recommendation_id: string;
  platform: string;
  version: number;
  prompt: string;
  provider: string | null;
  model: string | null;
  quality: unknown;
  created_at: string;
};

export type FullReportInput = {
  business: ReportBusiness;
  verification: ProspectVerification;
  investigation: ReportInvestigation | null;
  recommendations: MatchExplanation[];
  solutions: ReportSolution[];
  outreach: ReportOutreachMessage[];
  generatedAt: string;
  sections: ReportSectionKey[];
};

export function normalizeReportSolutions(
  rows: ReportSolutionRow[],
  prompts: ReportPromptRow[],
): ReportSolution[] {
  const promptsByRecommendation = new Map<string, ReportSolutionPrompt[]>();
  for (const prompt of prompts) {
    const normalized: ReportSolutionPrompt = {
      platform: prompt.platform,
      version: prompt.version,
      prompt: prompt.prompt,
      provider: prompt.provider,
      model: prompt.model,
      quality: qualityFrom(prompt.quality),
      created_at: prompt.created_at,
    };
    const list = promptsByRecommendation.get(prompt.recommendation_id) ?? [];
    list.push(normalized);
    promptsByRecommendation.set(prompt.recommendation_id, list);
  }

  return rows.map((row) => ({
    title: row.title,
    summary: row.summary,
    whyRecommended: row.why_recommended,
    intent: row.intent,
    requestedDeliverable: row.requested_deliverable,
    solutionType: row.solution_type,
    hypothesis: row.hypothesis,
    confidence: row.confidence,
    status: row.status,
    maintenanceRequired: row.maintenance_required,
    evidence: evidenceFrom(row.evidence),
    requirements: requirementsFrom(row.requirements),
    assumptions: stringList(row.assumptions),
    unknowns: stringList(row.unknowns),
    prompts: latestPromptPerPlatform(promptsByRecommendation.get(row.id) ?? []),
  }));
}

function value(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "unknown";
  const text = String(v).trim();
  return text === "" ? "unknown" : text;
}

function words(v: string | null | undefined): string {
  return value(v).replace(/_/g, " ").toLowerCase();
}

function yesNo(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "unknown";
  return v ? "yes" : "no";
}

function dateText(v: string | null | undefined): string {
  if (!v) return "unknown";
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return v;
  return parsed.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function intentLabel(v: string): string {
  return SOLUTION_INTENT_LABELS[v as SolutionIntent] ?? v;
}

function deliverableLabel(v: string): string {
  return REQUESTED_DELIVERABLE_LABELS[v as RequestedDeliverable] ?? v;
}

function solutionTypeLabel(v: string): string {
  return SOLUTION_TYPE_LABELS[v as SolutionType] ?? v;
}

function promptPlatformLabel(v: string): string {
  return PROMPT_PLATFORM_LABELS[v as keyof typeof PROMPT_PLATFORM_LABELS] ?? v;
}

function priorityLabel(v: string): string {
  if (v === "A") return "A - strong fit, verify before outreach";
  if (v === "B") return "B - worth a closer look";
  if (v === "C") return "C - low priority";
  return "Manual review required";
}

function industryName(business: ReportBusiness): string | null {
  const key = businessIndustry(business);
  if (key) return industryLabel(key);
  return business.industry?.trim() || null;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "business"
  );
}

export function reportFilename(
  businessName: string,
  format: ReportFormat,
  generatedAt: string | Date = new Date(),
): string {
  const day =
    typeof generatedAt === "string"
      ? generatedAt.slice(0, 10)
      : generatedAt.toISOString().slice(0, 10);
  return `gare-${slug(businessName)}-${day}.${format === "html" ? "html" : "md"}`;
}

function selected(input: FullReportInput, key: ReportSectionKey): boolean {
  return input.sections.includes(key);
}

function markdownProfile(input: FullReportInput): string[] {
  const { business } = input;
  const industry = industryName(business);
  const size = companySize(business);
  const lines = [
    "## Business profile",
    "",
    `**${business.name}**`,
    "",
    `- **Legal name:** ${value(business.legal_name)}`,
    `- **TIN:** ${value(business.tin)}`,
    `- **Category:** ${value(business.category)}`,
    `- **Sector:** ${value(business.sector)}`,
    `- **Industry:** ${value(industry)}`,
    `- **Company size:** ${size === "unknown" ? "unknown" : size}`,
    `- **Employees:** ${
      business.employees_min == null && business.employees_max == null
        ? "unknown"
        : `${business.employees_min ?? "?"}-${business.employees_max ?? "?"}`
    }`,
    `- **Founded:** ${value(business.founded_date)}`,
    `- **Province:** ${value(business.province)}`,
    `- **District:** ${value(business.district)}`,
    `- **Address:** ${value(business.address)}`,
    `- **Google status:** ${value(business.business_status?.replace(/_/g, " "))}`,
    `- **Open now:** ${yesNo(business.open_now)}`,
    `- **Rating:** ${
      business.rating == null
        ? "unknown"
        : `${business.rating} (${business.review_count ?? 0} reviews)`
    }`,
    `- **Phone:** ${value(business.phone)}`,
    `- **Public email:** ${business.emails?.length ? business.emails.join(", ") : "unknown"}`,
    `- **Website:** ${value(business.website)}`,
    `- **Website check:** ${
      business.website_check?.confidence
        ? `${business.website_check.confidence}${business.website_check.source ? ` (${business.website_check.source})` : ""}`
        : "unknown"
    }`,
    `- **Google Maps:** ${value(business.maps_url)}`,
  ];

  const hours = business.opening_hours?.weekday_descriptions ?? [];
  if (hours.length > 0) {
    lines.push("", "**Hours**", "", ...hours.map((item) => `- ${item}`));
  }

  const socials = Object.entries(input.investigation?.findings?.socials ?? {});
  if (socials.length > 0) {
    lines.push("", "**Social presence**", "", ...socials.map(([key, url]) => `- ${key}: ${url}`));
  }

  return lines;
}

function markdownVerification(input: FullReportInput): string[] {
  const v = input.verification;
  return [
    "## Prospect verification",
    "",
    `- **Commercial priority:** ${priorityLabel(v.commercial_priority)}`,
    `- **Website:** ${words(v.website_status)}`,
    `- **Online presence:** ${words(v.online_presence_status)}`,
    `- **Operating:** ${words(v.operating_status)}`,
    `- **Rwanda location:** ${words(v.rwanda_location)}`,
    `- **Manufacturing:** ${words(v.manufacturing_evidence.status)}${
      v.manufacturing_evidence.industry
        ? ` (${industryLabel(v.manufacturing_evidence.industry)})`
        : ""
    }`,
    `- **Identity confidence:** ${v.identity_confidence_0_100}/100`,
    `- **Commercial score:** ${v.commercial_score_0_100}/100`,
    `- **Last observed activity:** ${dateText(v.last_observed_activity_at)}`,
    `- **Website search coverage:** ${v.website_coverage.score_0_100}/100 (${v.website_coverage.level}) - ${v.website_coverage.note}`,
    `- **Presence search coverage:** ${v.presence_coverage.score_0_100}/100 (${v.presence_coverage.level}) - ${v.presence_coverage.note}`,
    "",
    "**Why this priority**",
    "",
    ...v.priority_reasons.map((item) => `- ${item}`),
    "",
    "**Evidence**",
    "",
    `- ${v.website_status_reason}`,
    `- ${v.online_presence_reason}`,
    `- ${v.operating_evidence}`,
    `- ${v.manufacturing_evidence.basis}`,
  ];
}

function markdownInvestigation(input: FullReportInput): string[] {
  const investigation = input.investigation;
  if (!investigation) return ["## Investigation report", "", "No investigation is recorded."];

  const lines = ["## Investigation report", "", `Observed ${dateText(investigation.created_at)}.`];
  const report = investigation.report;
  if (report) {
    lines.push("", `**Overview:** ${value(report.overview)}`, "", "**Problems found**", "");
    if (!report.problems || report.problems.length === 0) {
      lines.push("- None supported by evidence.");
    } else {
      for (const problem of report.problems) {
        lines.push(
          `- **${problem.problem}** (${problem.severity})`,
          `  Evidence: ${problem.evidence}`,
        );
      }
    }
    lines.push(
      "",
      `**Recommended offer (AI):** ${value(report.recommended_offer)}`,
      "",
      `**Offer reasoning:** ${value(report.offer_reasoning)}`,
      "",
      `- **Confidence:** ${value(report.confidence)}`,
      `- **Deal value:** ${
        report.estimated_deal_value_usd == null ? "unknown" : `~$${report.estimated_deal_value_usd}`
      }`,
      `- **Conversion probability:** ${value(report.conversion_probability)}`,
      `- **Delivery effort:** ${value(report.delivery_effort)}`,
      `- **Next action:** ${value(report.next_action)}`,
    );
  } else {
    lines.push("", "No report was stored for this run.");
  }

  const findings = investigation.findings;
  if (findings) {
    lines.push("", "**Website evidence**", "");
    lines.push(`- **URL:** ${value(findings.url)}`);
    lines.push(`- **Reachable:** ${yesNo(findings.reachable)}`);
    lines.push(`- **HTTP status:** ${value(findings.status)}`);
    lines.push(
      `- **Load time:** ${findings.load_ms == null ? "unknown" : `${findings.load_ms} ms`}`,
    );
    lines.push(`- **Mobile viewport:** ${yesNo(findings.has_viewport_meta)}`);
    lines.push(`- **Contact form:** ${yesNo(findings.has_contact_form)}`);
    lines.push(`- **Booking / shop:** ${yesNo(findings.has_online_booking_or_shop)}`);
    lines.push(`- **Latest copyright year:** ${value(findings.copyright_year)}`);
    if (findings.error) lines.push(`- **Error:** ${findings.error}`);
    if (findings.visibility) {
      lines.push(
        "",
        `**Visibility score:** ${findings.visibility.score}/100`,
        "",
        ...findings.visibility.breakdown.map(
          (item) => `- ${item.label}: ${item.points}/${item.max}`,
        ),
      );
    }
  }

  return lines;
}

function markdownRecommendations(input: FullReportInput): string[] {
  const lines = ["## Recommended services (from your offers)"];
  if (input.recommendations.length === 0) {
    return [...lines, "", "No observed problem maps to an active offer."];
  }

  for (const match of input.recommendations) {
    lines.push(
      "",
      `### ${match.offer}`,
      "",
      `- **Status:** ${match.hypothesis ? "hypothesis" : "supported"}`,
      `- **Confidence:** ${Math.round(match.confidence * 100)}%`,
      `- **Effort:** ${match.effort}`,
      `- **Recurring:** ${match.recurring ? "yes" : "no"}`,
      `- **Why relevant:** ${match.whyRelevant}`,
      `- **Observed problem:** ${match.observedProblem}`,
      `- **Likely buyer:** ${match.likelyBuyerRole}`,
      `- **Next action:** ${match.nextAction}`,
    );
    if (match.uncertainties.length > 0) {
      lines.push("", "**Uncertainties**", "", ...match.uncertainties.map((item) => `- ${item}`));
    }
  }

  return lines;
}

function markdownSolutions(input: FullReportInput): string[] {
  const lines = ["## Solution recommendations and prompts"];
  if (input.solutions.length === 0) {
    return [...lines, "", "No solution recommendations were generated."];
  }

  for (const solution of input.solutions) {
    lines.push(
      "",
      `### ${solution.title}`,
      "",
      `- **Intent:** ${intentLabel(solution.intent)}`,
      `- **Deliverable:** ${deliverableLabel(solution.requestedDeliverable)}`,
      `- **Solution type:** ${solutionTypeLabel(solution.solutionType)}`,
      `- **Basis:** ${solution.hypothesis ? "hypothesis" : "evidence-backed"}`,
      `- **Confidence:** ${Math.round(Number(solution.confidence) * 100)}%`,
      `- **Status:** ${solution.status}`,
      `- **Maintenance required:** ${solution.maintenanceRequired ? "yes" : "no"}`,
      "",
      `**Summary:** ${solution.summary}`,
      "",
      `**Why:** ${solution.whyRecommended}`,
      "",
      "**Verified facts and evidence**",
      "",
    );
    if (solution.evidence.length === 0) {
      lines.push("- None recorded.");
    } else {
      for (const item of solution.evidence) {
        lines.push(`- [${item.kind}] **${item.label}** (${item.source}): ${item.detail}`);
      }
    }

    lines.push("", "**Assumptions**", "");
    lines.push(
      ...(solution.assumptions.length
        ? solution.assumptions.map((item) => `- ${item}`)
        : ["- None recorded."]),
    );
    lines.push("", "**Missing information**", "");
    lines.push(
      ...(solution.unknowns.length
        ? solution.unknowns.map((item) => `- ${item}`)
        : ["- None recorded."]),
    );

    lines.push("", "**Implementation requirements**", "");
    if (solution.requirements.length === 0) {
      lines.push("- None recorded.");
    } else {
      for (const group of solution.requirements) {
        lines.push(`- **${group.label}**`);
        for (const item of group.items) {
          lines.push(`  - [${item.priority}] ${item.requirement}: ${item.rationale}`);
          for (const criterion of item.acceptance_criteria) {
            lines.push(`    - Acceptance: ${criterion}`);
          }
        }
      }
    }

    lines.push("", "**Copy-ready prompts**", "");
    if (solution.prompts.length === 0) {
      lines.push("- No validated prompts were generated.");
    } else {
      for (const prompt of solution.prompts) {
        lines.push(
          `#### ${promptPlatformLabel(prompt.platform)} (v${prompt.version})`,
          "",
          `- **Provider:** ${value(prompt.provider)}`,
          `- **Model:** ${value(prompt.model)}`,
          `- **Created:** ${dateText(prompt.created_at)}`,
        );
        if (prompt.quality) {
          lines.push(
            `- **Quality:** ${prompt.quality.score}/100 - ${prompt.quality.pass ? "passed" : "failed"}`,
          );
        }
        lines.push("", "~~~~text", prompt.prompt, "~~~~", "");
      }
    }
  }

  return lines;
}

function markdownOutreach(input: FullReportInput): string[] {
  const lines = ["## Outreach messages"];
  if (input.outreach.length === 0) {
    return [...lines, "", "No outreach messages are recorded."];
  }

  const known = new Set<string>(OUTREACH_PACK_CHANNELS);
  const groups = [
    ...OUTREACH_PACK_CHANNELS.map((channel) => ({
      channel,
      items: input.outreach.filter((message) => message.channel === channel),
    })),
    {
      channel: "Other",
      items: input.outreach.filter((message) => !known.has(message.channel ?? "")),
    },
  ].filter((group) => group.items.length > 0);

  for (const group of groups) {
    lines.push("", `### ${group.channel}`, "");
    for (const message of group.items) {
      lines.push(
        `#### ${value(message.title)}`,
        "",
        `- **Status:** ${value(message.status)}`,
        `- **Created:** ${dateText(message.created_at)}`,
        "",
        "~~~~text",
        message.body,
        "~~~~",
        "",
      );
    }
  }

  return lines;
}

export function buildFullReportMarkdown(input: FullReportInput): string {
  const sections: string[] = [
    `# ${input.business.name} - business intelligence report`,
    "",
    `Generated ${dateText(input.generatedAt)}.`,
    "",
    "> Private report generated by GARE. It contains recorded evidence and generated content only; it does not add facts.",
  ];

  if (selected(input, "profile")) sections.push("", ...markdownProfile(input));
  if (selected(input, "verification")) sections.push("", ...markdownVerification(input));
  if (selected(input, "investigation")) sections.push("", ...markdownInvestigation(input));
  if (selected(input, "recommendations")) sections.push("", ...markdownRecommendations(input));
  if (selected(input, "solutions")) sections.push("", ...markdownSolutions(input));
  if (selected(input, "outreach")) sections.push("", ...markdownOutreach(input));

  return sections.join("\n").trimEnd() + "\n";
}

function escapeHtml(valueToEscape: string): string {
  return valueToEscape
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlValue(v: string | number | null | undefined): string {
  return escapeHtml(value(v));
}

function htmlBlock(lines: string[]): string {
  return lines.join("\n");
}

function htmlSection(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function htmlList(items: string[], fallback: string): string {
  if (items.length === 0) return `<p class="muted">${escapeHtml(fallback)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function htmlProfile(input: FullReportInput): string {
  const { business } = input;
  const industry = industryName(business);
  const size = companySize(business);
  const rows: [string, string][] = [
    ["Legal name", htmlValue(business.legal_name)],
    ["TIN", htmlValue(business.tin)],
    ["Category", htmlValue(business.category)],
    ["Sector", htmlValue(business.sector)],
    ["Industry", htmlValue(industry)],
    ["Company size", size === "unknown" ? "unknown" : escapeHtml(size)],
    [
      "Employees",
      business.employees_min == null && business.employees_max == null
        ? "unknown"
        : `${business.employees_min ?? "?"}-${business.employees_max ?? "?"}`,
    ],
    ["Founded", htmlValue(business.founded_date)],
    ["Province", htmlValue(business.province)],
    ["District", htmlValue(business.district)],
    ["Address", htmlValue(business.address)],
    ["Google status", escapeHtml(words(business.business_status))],
    ["Open now", yesNo(business.open_now)],
    [
      "Rating",
      business.rating == null
        ? "unknown"
        : `${business.rating} (${business.review_count ?? 0} reviews)`,
    ],
    ["Phone", htmlValue(business.phone)],
    ["Public email", business.emails?.length ? escapeHtml(business.emails.join(", ")) : "unknown"],
    ["Website", htmlValue(business.website)],
    [
      "Website check",
      business.website_check?.confidence
        ? escapeHtml(
            `${business.website_check.confidence}${business.website_check.source ? ` (${business.website_check.source})` : ""}`,
          )
        : "unknown",
    ],
    ["Google Maps", htmlValue(business.maps_url)],
  ];

  const hours = business.opening_hours?.weekday_descriptions ?? [];
  const socials = Object.entries(input.investigation?.findings?.socials ?? {});
  const body = [
    `<p class="lede">${escapeHtml(business.name)}</p>`,
    `<div class="facts">${rows
      .map(
        ([label, item]) =>
          `<div class="fact"><span>${escapeHtml(label)}</span><strong>${item}</strong></div>`,
      )
      .join("")}</div>`,
    hours.length > 0 ? `<h3>Hours</h3>${htmlList(hours, "None recorded.")}` : "",
    socials.length > 0
      ? `<h3>Social presence</h3>${htmlList(
          socials.map(([key, url]) => `${key}: ${url}`),
          "None recorded.",
        )}`
      : "",
  ];

  return htmlSection("Business profile", htmlBlock(body));
}

function htmlVerification(input: FullReportInput): string {
  const v = input.verification;
  const rows: [string, string][] = [
    ["Commercial priority", priorityLabel(v.commercial_priority)],
    ["Website", words(v.website_status)],
    ["Online presence", words(v.online_presence_status)],
    ["Operating", words(v.operating_status)],
    ["Rwanda location", words(v.rwanda_location)],
    [
      "Manufacturing",
      `${words(v.manufacturing_evidence.status)}${
        v.manufacturing_evidence.industry
          ? ` (${industryLabel(v.manufacturing_evidence.industry)})`
          : ""
      }`,
    ],
    ["Identity confidence", `${v.identity_confidence_0_100}/100`],
    ["Commercial score", `${v.commercial_score_0_100}/100`],
    ["Last observed activity", dateText(v.last_observed_activity_at)],
    [
      "Website search coverage",
      `${v.website_coverage.score_0_100}/100 (${v.website_coverage.level}) - ${v.website_coverage.note}`,
    ],
    [
      "Presence search coverage",
      `${v.presence_coverage.score_0_100}/100 (${v.presence_coverage.level}) - ${v.presence_coverage.note}`,
    ],
  ];

  const body = [
    `<div class="facts">${rows
      .map(
        ([label, item]) =>
          `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></div>`,
      )
      .join("")}</div>`,
    `<h3>Why this priority</h3>${htmlList(v.priority_reasons, "None recorded.")}`,
    `<h3>Evidence</h3>${htmlList(
      [
        v.website_status_reason,
        v.online_presence_reason,
        v.operating_evidence,
        v.manufacturing_evidence.basis,
      ],
      "None recorded.",
    )}`,
    v.digital_gap.length > 0
      ? `<h3>Measured digital gaps</h3>${v.digital_gap
          .map(
            (gap) =>
              `<div class="card"><strong>${escapeHtml(gap.label)}</strong><span class="badge">${escapeHtml(gap.severity)}</span><p>${escapeHtml(gap.evidence)}</p></div>`,
          )
          .join("")}`
      : "",
    v.service_opportunity
      ? `<div class="callout"><h3>Service opportunity</h3><p><strong>${escapeHtml(v.service_opportunity.summary)}</strong></p><p>${escapeHtml(v.service_opportunity.basis)}</p><p class="muted">${escapeHtml(v.service_opportunity.limitation)}</p></div>`
      : "",
    `<h3>Next verification step</h3><p>${escapeHtml(v.next_verification_step)}</p>`,
    v.contradictions.length > 0
      ? `<h3>Contradictions</h3>${htmlList(v.contradictions, "None recorded.")}`
      : "",
    v.uncertainties.length > 0
      ? `<h3>Uncertainties</h3>${htmlList(v.uncertainties, "None recorded.")}`
      : "",
    `<h3>Evidence log</h3>${v.evidence_log
      .map(
        (entry) =>
          `<div class="card"><div><span class="badge">${escapeHtml(words(entry.result))}</span> <strong>${escapeHtml(entry.query_or_check)}</strong></div><p class="muted">${escapeHtml(dateText(entry.checked_at))} | ${escapeHtml(entry.source)}</p><p>${escapeHtml(entry.observation)}</p></div>`,
      )
      .join("")}`,
  ];

  return htmlSection("Prospect verification", htmlBlock(body));
}

function htmlInvestigation(input: FullReportInput): string {
  const investigation = input.investigation;
  if (!investigation) {
    return htmlSection(
      "Investigation report",
      `<p class="muted">No investigation is recorded.</p>`,
    );
  }

  const report = investigation.report;
  const findings = investigation.findings;
  const body = [`<p class="muted">Observed ${escapeHtml(dateText(investigation.created_at))}.</p>`];

  if (report) {
    body.push(
      `<p>${escapeHtml(value(report.overview))}</p>`,
      `<h3>Problems found</h3>`,
      report.problems && report.problems.length > 0
        ? report.problems
            .map(
              (problem) =>
                `<div class="card"><div><span class="badge">${escapeHtml(problem.severity)}</span> <strong>${escapeHtml(problem.problem)}</strong></div><p class="muted">Evidence: ${escapeHtml(problem.evidence)}</p></div>`,
            )
            .join("")
        : `<p class="muted">None supported by evidence.</p>`,
      `<div class="callout"><h3>Recommended offer (AI)</h3><p><strong>${escapeHtml(value(report.recommended_offer))}</strong></p><p>${escapeHtml(value(report.offer_reasoning))}</p></div>`,
      `<div class="facts">
        <div class="fact"><span>Confidence</span><strong>${escapeHtml(value(report.confidence))}</strong></div>
        <div class="fact"><span>Deal value</span><strong>${report.estimated_deal_value_usd == null ? "unknown" : `~$${report.estimated_deal_value_usd}`}</strong></div>
        <div class="fact"><span>Conversion probability</span><strong>${escapeHtml(value(report.conversion_probability))}</strong></div>
        <div class="fact"><span>Delivery effort</span><strong>${escapeHtml(value(report.delivery_effort))}</strong></div>
      </div>`,
      `<h3>Next action</h3><p>${escapeHtml(value(report.next_action))}</p>`,
    );
  } else {
    body.push(`<p class="muted">No report was stored for this run.</p>`);
  }

  if (findings) {
    body.push(
      `<h3>Website evidence</h3><div class="facts">
        <div class="fact"><span>URL</span><strong>${htmlValue(findings.url)}</strong></div>
        <div class="fact"><span>Reachable</span><strong>${yesNo(findings.reachable)}</strong></div>
        <div class="fact"><span>HTTP status</span><strong>${htmlValue(findings.status)}</strong></div>
        <div class="fact"><span>Load time</span><strong>${findings.load_ms == null ? "unknown" : `${findings.load_ms} ms`}</strong></div>
        <div class="fact"><span>Mobile viewport</span><strong>${yesNo(findings.has_viewport_meta)}</strong></div>
        <div class="fact"><span>Contact form</span><strong>${yesNo(findings.has_contact_form)}</strong></div>
        <div class="fact"><span>Booking / shop</span><strong>${yesNo(findings.has_online_booking_or_shop)}</strong></div>
        <div class="fact"><span>Latest copyright year</span><strong>${htmlValue(findings.copyright_year)}</strong></div>
      </div>`,
    );
    if (findings.error) body.push(`<p class="danger">${escapeHtml(findings.error)}</p>`);
    if (findings.visibility) {
      body.push(
        `<h3>Visibility score</h3><p class="lede">${findings.visibility.score}/100</p>`,
        htmlList(
          findings.visibility.breakdown.map((item) => `${item.label}: ${item.points}/${item.max}`),
          "No breakdown recorded.",
        ),
      );
    }
  }

  return htmlSection("Investigation report", htmlBlock(body));
}

function htmlRecommendations(input: FullReportInput): string {
  if (input.recommendations.length === 0) {
    return htmlSection(
      "Recommended services (from your offers)",
      `<p class="muted">No observed problem maps to an active offer.</p>`,
    );
  }

  const body = input.recommendations
    .map(
      (match) => `<article class="item">
        <h3>${escapeHtml(match.offer)}</h3>
        <p><span class="badge">${match.hypothesis ? "hypothesis" : "supported"}</span> <span class="badge">confidence ${Math.round(match.confidence * 100)}%</span> <span class="badge">${escapeHtml(match.effort)} effort</span>${match.recurring ? ' <span class="badge">recurring</span>' : ""}</p>
        <p>${escapeHtml(match.whyRelevant)}</p>
        <div class="facts">
          <div class="fact"><span>Observed problem</span><strong>${escapeHtml(match.observedProblem)}</strong></div>
          <div class="fact"><span>Likely buyer</span><strong>${escapeHtml(match.likelyBuyerRole)}</strong></div>
          <div class="fact"><span>Next action</span><strong>${escapeHtml(match.nextAction)}</strong></div>
        </div>
        ${match.uncertainties.length > 0 ? `<h4>Uncertainties</h4>${htmlList(match.uncertainties, "None recorded.")}` : ""}
      </article>`,
    )
    .join("");

  return htmlSection("Recommended services (from your offers)", body);
}

function htmlSolutions(input: FullReportInput): string {
  if (input.solutions.length === 0) {
    return htmlSection(
      "Solution recommendations and prompts",
      `<p class="muted">No solution recommendations were generated.</p>`,
    );
  }

  const body = input.solutions
    .map((solution) => {
      const evidence =
        solution.evidence.length > 0
          ? solution.evidence
              .map(
                (item) =>
                  `<li><span class="badge">${escapeHtml(item.kind)}</span> <strong>${escapeHtml(item.label)}</strong> <span class="muted">(${escapeHtml(item.source)})</span><p>${escapeHtml(item.detail)}</p></li>`,
              )
              .join("")
          : `<li class="muted">None recorded.</li>`;

      const requirements =
        solution.requirements.length > 0
          ? solution.requirements
              .map(
                (group) =>
                  `<div class="card"><strong>${escapeHtml(group.label)}</strong>${group.items
                    .map(
                      (item) =>
                        `<div class="requirement"><span class="badge">${escapeHtml(item.priority)}</span> ${escapeHtml(item.requirement)}<p class="muted">${escapeHtml(item.rationale)}</p>${
                          item.acceptance_criteria.length
                            ? htmlList(item.acceptance_criteria, "None recorded.")
                            : ""
                        }</div>`,
                    )
                    .join("")}</div>`,
              )
              .join("")
          : `<p class="muted">None recorded.</p>`;

      const prompts =
        solution.prompts.length > 0
          ? solution.prompts
              .map(
                (
                  prompt,
                ) => `<div class="prompt"><h4>${escapeHtml(promptPlatformLabel(prompt.platform))} (v${prompt.version})</h4>
                  <p class="muted">Provider: ${htmlValue(prompt.provider)} | Model: ${htmlValue(prompt.model)} | Created: ${escapeHtml(dateText(prompt.created_at))}${
                    prompt.quality
                      ? ` | Quality: ${prompt.quality.score}/100 ${prompt.quality.pass ? "passed" : "failed"}`
                      : ""
                  }</p>
                  <pre>${escapeHtml(prompt.prompt)}</pre>
                </div>`,
              )
              .join("")
          : `<p class="muted">No validated prompts were generated.</p>`;

      return `<article class="item">
        <h3>${escapeHtml(solution.title)}</h3>
        <p><span class="badge">${escapeHtml(intentLabel(solution.intent))}</span> <span class="badge">${escapeHtml(deliverableLabel(solution.requestedDeliverable))}</span> <span class="badge">${escapeHtml(solutionTypeLabel(solution.solutionType))}</span> <span class="badge">${solution.hypothesis ? "hypothesis" : "evidence-backed"}</span> <span class="badge">confidence ${Math.round(Number(solution.confidence) * 100)}%</span> <span class="badge">${escapeHtml(solution.status)}</span>${solution.maintenanceRequired ? ' <span class="badge">maintenance required</span>' : ""}</p>
        <p>${escapeHtml(solution.summary)}</p>
        <p class="muted">${escapeHtml(solution.whyRecommended)}</p>
        <h4>Verified facts and evidence</h4><ul>${evidence}</ul>
        <h4>Assumptions</h4>${htmlList(solution.assumptions, "None recorded.")}
        <h4>Missing information</h4>${htmlList(solution.unknowns, "None recorded.")}
        <h4>Implementation requirements</h4>${requirements}
        <h4>Copy-ready prompts</h4>${prompts}
      </article>`;
    })
    .join("");

  return htmlSection("Solution recommendations and prompts", body);
}

function htmlOutreach(input: FullReportInput): string {
  if (input.outreach.length === 0) {
    return htmlSection(
      "Outreach messages",
      `<p class="muted">No outreach messages are recorded.</p>`,
    );
  }

  const known = new Set<string>(OUTREACH_PACK_CHANNELS);
  const groups = [
    ...OUTREACH_PACK_CHANNELS.map((channel) => ({
      channel,
      items: input.outreach.filter((message) => message.channel === channel),
    })),
    {
      channel: "Other",
      items: input.outreach.filter((message) => !known.has(message.channel ?? "")),
    },
  ].filter((group) => group.items.length > 0);

  const body = groups
    .map(
      (group) =>
        `<div><h3>${escapeHtml(group.channel)}</h3>${group.items
          .map(
            (message) =>
              `<article class="card"><h4>${escapeHtml(value(message.title))}</h4><p><span class="badge">${escapeHtml(message.status)}</span> <span class="muted">${escapeHtml(dateText(message.created_at))}</span></p><pre>${escapeHtml(message.body)}</pre></article>`,
          )
          .join("")}</div>`,
    )
    .join("");

  return htmlSection("Outreach messages", body);
}

export function buildFullReportHtml(input: FullReportInput): string {
  const sections: string[] = [];
  if (selected(input, "profile")) sections.push(htmlProfile(input));
  if (selected(input, "verification")) sections.push(htmlVerification(input));
  if (selected(input, "investigation")) sections.push(htmlInvestigation(input));
  if (selected(input, "recommendations")) sections.push(htmlRecommendations(input));
  if (selected(input, "solutions")) sections.push(htmlSolutions(input));
  if (selected(input, "outreach")) sections.push(htmlOutreach(input));

  const title = `${input.business.name} - business intelligence report`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 36px; color: #17202a; background: #fff; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 940px; margin: 0 auto; }
  header { border-bottom: 2px solid #17202a; padding-bottom: 18px; margin-bottom: 28px; }
  h1 { margin: 0 0 6px; font-size: 32px; line-height: 1.15; }
  h2 { margin: 34px 0 14px; padding-top: 18px; border-top: 1px solid #d8dee4; font-size: 22px; }
  h3 { margin: 24px 0 10px; font-size: 17px; }
  h4 { margin: 18px 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; }
  p { margin: 8px 0; }
  ul { margin: 8px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  .lede { font-size: 20px; font-weight: 700; }
  .muted { color: #5b6773; }
  .danger { color: #b42318; }
  .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 22px; margin: 12px 0; }
  .fact { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eef1f3; padding: 6px 0; }
  .fact span { color: #5b6773; }
  .fact strong { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  .card, .item, .prompt { border: 1px solid #d8dee4; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .item { page-break-inside: avoid; }
  .callout { border: 1px solid #2f6fed; background: #f5f8ff; border-radius: 8px; padding: 14px; margin: 14px 0; }
  .badge { display: inline-block; border: 1px solid #c8d0d8; border-radius: 999px; padding: 1px 8px; margin-right: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f8fa; border: 1px solid #e1e6eb; border-radius: 6px; padding: 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .requirement { margin: 10px 0; }
  footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #d8dee4; color: #5b6773; font-size: 12px; }
  @media print {
    body { padding: 0; }
    .item, .card, .prompt { break-inside: avoid; }
    h2 { break-after: avoid; }
  }
</style>
</head>
<body>
<main>
<header><h1>${escapeHtml(input.business.name)}</h1><p class="muted">Business intelligence report | Generated ${escapeHtml(dateText(input.generatedAt))}</p><p class="muted">Private report generated by GARE. It contains recorded evidence and generated content only; it does not add facts.</p></header>
${sections.join("\n")}
<footer>Generated by GARE on ${escapeHtml(dateText(input.generatedAt))}. Print this page to PDF if needed.</footer>
</main>
</body>
</html>
`;
}

export function downloadReportFile(content: string, filename: string, format: ReportFormat): void {
  const blob = new Blob([content], {
    type: format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
