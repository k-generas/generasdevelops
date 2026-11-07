import { describe, expect, it } from "vitest";
import { buildProspectVerification } from "@/lib/prospect-verification";
import {
  buildFullReportHtml,
  buildFullReportMarkdown,
  normalizeReportSolutions,
  reportFilename,
  type FullReportInput,
  type ReportPromptRow,
  type ReportSolutionRow,
} from "@/lib/full-report";

const business = {
  name: "Acme <Materials>",
  legal_name: "Acme Materials Ltd",
  category: "Construction materials supplier",
  address: "Kigali",
  phone: "+250 788 000 000",
  emails: ["sales@acme.rw"],
  website: "https://acme.rw",
  maps_url: "https://maps.google.com/?q=acme",
  business_status: "OPERATIONAL",
  open_now: true,
  employees_min: 10,
  employees_max: 20,
  website_check: { confidence: "positive", source: "google" },
};

const findings = {
  url: "https://acme.rw",
  reachable: true,
  status: 200,
  load_ms: 4200,
  has_viewport_meta: false,
  has_contact_form: false,
  has_online_booking_or_shop: false,
  copyright_year: 2020,
  socials: { facebook: "https://facebook.com/acme" },
  visibility: {
    score: 42,
    breakdown: [{ label: "Website", points: 20, max: 40 }],
  },
};

const verification = buildProspectVerification({
  business,
  findings,
  observedAt: "2026-11-07T08:00:00.000Z",
  now: new Date("2026-11-07T09:00:00.000Z"),
});

const solutionRows: ReportSolutionRow[] = [
  {
    id: "rec-1",
    title: "Customer-facing website",
    summary: "A website that explains products and captures enquiries.",
    why_recommended: "No website was found.",
    intent: "CREATE",
    requested_deliverable: "business_website",
    solution_type: "website_new",
    hypothesis: false,
    confidence: 0.84,
    status: "recommended",
    maintenance_required: true,
    evidence: [
      {
        kind: "verified_fact",
        label: "No website",
        detail: "No website could be found.",
        source: "google",
        observed_at: "2026-11-07T08:00:00.000Z",
        ref: null,
      },
    ],
    requirements: [
      {
        key: "pages",
        label: "Pages",
        items: [
          {
            requirement: "Home, products and contact pages",
            rationale: "Buyers need a clear next step.",
            priority: "must",
            acceptance_criteria: ["Each page is reachable from the menu."],
          },
        ],
      },
    ],
    assumptions: ["The owner can supply product photos."],
    unknowns: ["Whether online ordering is needed."],
  },
];

const promptRows: ReportPromptRow[] = [
  {
    recommendation_id: "rec-1",
    platform: "opencode",
    version: 1,
    prompt: "OLD OPENCODE PROMPT",
    provider: "GARE",
    model: null,
    quality: null,
    created_at: "2026-11-07T08:01:00.000Z",
  },
  {
    recommendation_id: "rec-1",
    platform: "opencode",
    version: 2,
    prompt: "NEW OPENCODE PROMPT",
    provider: "GARE",
    model: null,
    quality: { score: 95, pass: true, checks: [] },
    created_at: "2026-11-07T08:02:00.000Z",
  },
  {
    recommendation_id: "rec-1",
    platform: "lovable",
    version: 1,
    prompt: "LOVABLE PROMPT",
    provider: "GARE",
    model: null,
    quality: null,
    created_at: "2026-11-07T08:02:00.000Z",
  },
  {
    recommendation_id: "rec-1",
    platform: "google_ai_studio",
    version: 1,
    prompt: "GOOGLE AI STUDIO PROMPT",
    provider: "GARE",
    model: null,
    quality: null,
    created_at: "2026-11-07T08:02:00.000Z",
  },
  {
    recommendation_id: "rec-1",
    platform: "developer_spec",
    version: 1,
    prompt: "DEVELOPER SPEC PROMPT",
    provider: "GARE",
    model: null,
    quality: null,
    created_at: "2026-11-07T08:02:00.000Z",
  },
];

const solutions = normalizeReportSolutions(solutionRows, promptRows);

const input: FullReportInput = {
  business,
  verification,
  investigation: {
    created_at: "2026-11-07T08:00:00.000Z",
    findings,
    report: {
      overview: "The business has a measurable website gap.",
      problems: [
        { problem: "No website found", evidence: "Double-checked search.", severity: "high" },
      ],
      recommended_offer: "Website design",
      offer_reasoning: "The gap matches the offer.",
      confidence: "high",
      estimated_deal_value_usd: 1200,
      conversion_probability: "medium",
      delivery_effort: "medium",
      next_action: "Call the owner.",
    },
  },
  recommendations: [
    {
      offer: "Website design",
      whatCompanyDoes: "Supplies construction materials.",
      observedProblem: "No website found",
      evidence: [],
      whyRelevant: "Buyers cannot find a website.",
      likelyBuyerRole: "Owner",
      nextAction: "Send an evidence-based message.",
      confidence: 0.8,
      uncertainties: ["Online ordering needs verification."],
      effort: "medium",
      recurring: false,
      hypothesis: false,
    },
  ],
  solutions,
  outreach: [
    {
      channel: "Email",
      title: "Email draft",
      body: "EMAIL BODY WITH <script>alert(1)</script>",
      status: "draft",
      created_at: "2026-11-07T08:03:00.000Z",
    },
    {
      channel: "WhatsApp",
      title: "WhatsApp draft",
      body: "WHATSAPP BODY",
      status: "draft",
      created_at: "2026-11-07T08:03:00.000Z",
    },
    {
      channel: "SMS",
      title: "SMS draft",
      body: "SMS BODY",
      status: "sent",
      created_at: "2026-11-07T08:03:00.000Z",
    },
  ],
  generatedAt: "2026-11-07T09:00:00.000Z",
  sections: [
    "profile",
    "verification",
    "investigation",
    "recommendations",
    "solutions",
    "outreach",
  ],
};

describe("full report", () => {
  it("keeps the latest prompt for each platform and parses structured evidence", () => {
    expect(solutions).toHaveLength(1);
    expect(solutions[0]!.prompts.map((prompt) => prompt.platform)).toEqual([
      "opencode",
      "lovable",
      "google_ai_studio",
      "developer_spec",
    ]);
    expect(solutions[0]!.prompts[0]!.prompt).toBe("NEW OPENCODE PROMPT");
    expect(solutions[0]!.evidence[0]!.label).toBe("No website");
    expect(solutions[0]!.requirements[0]!.items[0]!.priority).toBe("must");
  });

  it("builds a markdown report with every selected section", () => {
    const report = buildFullReportMarkdown(input);
    expect(report).toContain("# Acme <Materials> - business intelligence report");
    expect(report).toContain("## Business profile");
    expect(report).toContain("## Prospect verification");
    expect(report).toContain("## Investigation report");
    expect(report).toContain("## Recommended services");
    expect(report).toContain("## Solution recommendations and prompts");
    expect(report).toContain("## Outreach messages");
    expect(report).toContain("NEW OPENCODE PROMPT");
    expect(report).toContain("LOVABLE PROMPT");
    expect(report).toContain("GOOGLE AI STUDIO PROMPT");
    expect(report).toContain("DEVELOPER SPEC PROMPT");
    expect(report).not.toContain("OLD OPENCODE PROMPT");
    expect(report).toContain("EMAIL BODY");
    expect(report).toContain("WHATSAPP BODY");
    expect(report).toContain("SMS BODY");
  });

  it("includes only the chosen sections", () => {
    const report = buildFullReportMarkdown({
      ...input,
      sections: ["profile", "outreach"],
    });
    expect(report).toContain("## Business profile");
    expect(report).toContain("## Outreach messages");
    expect(report).not.toContain("## Investigation report");
    expect(report).not.toContain("## Solution recommendations and prompts");
    expect(report).not.toContain("NEW OPENCODE PROMPT");
  });

  it("builds printable HTML and escapes untrusted content", () => {
    const report = buildFullReportHtml(input);
    expect(report).toContain("<!doctype html>");
    expect(report).toContain("Acme &lt;Materials&gt;");
    expect(report).not.toContain("<script>alert(1)</script>");
    expect(report).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(report).toContain("WHATSAPP BODY");
    expect(report).toContain("SMS BODY");
    expect(report).toContain("NEW OPENCODE PROMPT");
  });

  it("names the downloaded file predictably", () => {
    expect(reportFilename("Acme <Materials>", "html", "2026-11-07T09:00:00.000Z")).toBe(
      "gare-acme-materials-2026-11-07.html",
    );
    expect(reportFilename("Acme <Materials>", "markdown", "2026-11-07T09:00:00.000Z")).toBe(
      "gare-acme-materials-2026-11-07.md",
    );
  });
});
