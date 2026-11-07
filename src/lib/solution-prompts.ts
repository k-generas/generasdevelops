import {
  isWebsiteDeliverable,
  PROMPT_PLATFORM_LABELS,
  REQUESTED_DELIVERABLE_LABELS,
  SOLUTION_INTENT_LABELS,
  type PromptPlatform,
  type RequestedDeliverable,
  type SolutionBusiness,
  type SolutionIntent,
  type SolutionRecommendationDraft,
  type SolutionRequirementGroup,
} from "./solution-builder";

export type PromptPlan = {
  intent: SolutionIntent;
  requested_deliverable: RequestedDeliverable;
  website_mode: boolean;
};

export type PromptBuildArgs = {
  business: SolutionBusiness;
  recommendation: Pick<
    SolutionRecommendationDraft,
    | "intent"
    | "requested_deliverable"
    | "solution_type"
    | "title"
    | "summary"
    | "why_recommended"
    | "confidence"
    | "hypothesis"
    | "evidence"
    | "requirements"
    | "assumptions"
    | "unknowns"
  >;
};

export function promptPlanFor(
  recommendation: Pick<SolutionRecommendationDraft, "intent" | "requested_deliverable">,
): PromptPlan {
  return {
    intent: recommendation.intent,
    requested_deliverable: recommendation.requested_deliverable,
    website_mode: isWebsiteDeliverable(recommendation.requested_deliverable),
  };
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function locationFor(business: SolutionBusiness): string {
  return [clean(business.district), clean(business.province)].filter(Boolean).join(", ");
}

function factLines(business: SolutionBusiness): string[] {
  const lines: string[] = [];
  const location = locationFor(business);
  if (clean(business.name)) lines.push(`Business name: ${clean(business.name)}`);
  if (clean(business.category)) lines.push(`Category: ${clean(business.category)}`);
  if (location) lines.push(`Location: ${location}`);
  if (clean(business.address)) lines.push(`Address: ${clean(business.address)}`);
  if (clean(business.phone)) lines.push(`Phone: ${clean(business.phone)}`);
  const emails = (business.emails ?? []).map(clean).filter(Boolean);
  if (emails.length > 0) lines.push(`Public email: ${emails.join(", ")}`);
  if (clean(business.website)) lines.push(`Existing website: ${clean(business.website)}`);
  if (business.rating != null) {
    lines.push(
      `Recorded rating: ${business.rating}${business.review_count != null ? ` from ${business.review_count} review(s)` : ""}`,
    );
  }
  if (business.sector) lines.push(`Sector: ${clean(business.sector)}`);
  if (business.industry) lines.push(`Industry: ${clean(business.industry)}`);
  return lines;
}

function evidenceLines(recommendation: PromptBuildArgs["recommendation"]): string[] {
  return recommendation.evidence.map((item) => {
    const kind =
      item.kind === "verified_fact"
        ? "verified fact"
        : item.kind === "evidence_backed_finding"
          ? "evidence-backed finding"
          : "hypothesis (not a fact)";
    return `- [${kind}] ${item.label}: ${item.detail} (source: ${item.source})`;
  });
}

function audienceFor(business: SolutionBusiness): string {
  const category = `${business.category ?? ""} ${business.sector ?? ""}`;
  if (/(construction|building|material|hardware|supplier|trade)/i.test(category)) {
    return "local homeowners, contractors and trade buyers (the exact customer mix must be confirmed by the owner)";
  }
  if (/(restaurant|cafe|food|bakery|bar)/i.test(category)) {
    return "local customers looking for food, opening hours and contact details";
  }
  if (/(salon|spa|barber|beauty|clinic|dental|medical|fitness|gym)/i.test(category)) {
    return "local customers looking for services and appointment details";
  }
  return "local customers and the audience the owner confirms";
}

function actionFor(deliverable: RequestedDeliverable): string {
  if (deliverable === "online_ordering_website") {
    return "browse the confirmed product or service categories and start an enquiry or order request";
  }
  if (deliverable === "booking_website") {
    return "request an appointment without creating an account";
  }
  if (deliverable === "website_repair") {
    return "complete the existing enquiry and contact journey without errors";
  }
  return "understand what the business offers, verify its contact details and request a quote";
}

function pageLines(deliverable: RequestedDeliverable, business: SolutionBusiness): string[] {
  const category = `${business.category ?? ""}`;
  const lines = [
    "- Home: business identity, a short plain-language introduction, a primary call to action and verified contact details.",
    "- About / trust: only owner-confirmed history, credentials and service claims; do not invent certifications or experience.",
    "- Contact: verified phone, email, address and map link where supplied, plus a short enquiry form.",
  ];
  if (/(construction|building|material|hardware)/i.test(category)) {
    lines.splice(
      1,
      0,
      "- Products and materials: category groups and product cards populated only from owner-supplied content; missing prices, stock and specifications must be marked 'Owner content required'.",
      "- Request a quote: name, contact details, required products or quantities, delivery location and notes; show a clearly labelled demo state until a real form endpoint is configured.",
    );
  } else {
    lines.splice(
      1,
      0,
      "- Products or services: only owner-confirmed items and descriptions; no invented prices or availability.",
    );
  }
  if (deliverable === "online_ordering_website") {
    lines.push(
      "- Catalogue and order request: filters, item detail, quantity selection and a request/order summary. Do not claim live payment or stock unless the owner confirms an integration.",
    );
  }
  if (deliverable === "booking_website") {
    lines.push(
      "- Booking request: service selection, preferred date/time, customer details and confirmation state. Show a demo state unless a real booking backend is supplied.",
    );
  }
  if (deliverable === "website_repair") {
    lines.unshift(
      "- Existing page inventory: list the current pages before changing anything; repair only the pages and journeys supported by the evidence.",
    );
  }
  return lines;
}

function requirementLines(groups: SolutionRequirementGroup[]): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`### ${group.label}`);
    for (const item of group.items) {
      lines.push(`- [${item.priority}] ${item.requirement}`);
      if (item.acceptance_criteria.length > 0) {
        lines.push(`  - Acceptance: ${item.acceptance_criteria.join("; ")}`);
      }
    }
  }
  return lines;
}

function acceptanceLines(): string[] {
  return [
    "- The home page loads with HTTP 200 in preview or production.",
    "- Every navigation link resolves and the mobile menu works at 360px and 1280px viewport widths.",
    "- The primary enquiry or quote form validates required fields and shows explicit success, validation-error and demo-mode states.",
    "- No price, stock level, opening hour, delivery promise, review, certification or business claim appears unless the owner supplied it.",
    "- Every displayed business fact is traceable to the verified information or evidence section.",
    "- The site has no console errors, no exposed secret and no API key in client code.",
    "- Keyboard navigation, visible focus states, labelled form fields, image alt text and readable colour contrast are present.",
    "- The delivery does not substitute a different product such as an AI content auditing application, BI dashboard, compliance checker, prompt generator, reporting tool or internal GARE feature.",
  ];
}

function platformInstructions(platform: PromptPlatform, website: boolean): string[] {
  if (platform === "opencode") {
    return [
      "Work in the existing repository. Inspect the current app structure, conventions and scripts before editing.",
      "Implement only this business deliverable and keep the diff focused; do not rewrite unrelated files.",
      "Run the project tests, typecheck and build, then report exact results and every unverified business fact.",
      website
        ? "Do not replace the website with a dashboard, audit tool, prompt generator or internal GARE feature."
        : "Do not expand the requested deliverable into an unrelated website or dashboard.",
    ];
  }
  if (platform === "lovable") {
    return [
      "Build this deliverable in Lovable using the supplied verified content and explicit placeholders.",
      "Use the Lovable preview to check the mobile and desktop layouts, then publish only after the stated checks pass.",
      "Keep the delivered product aligned with the requested outcome; do not redirect the build into a different product.",
    ];
  }
  if (platform === "google_ai_studio") {
    return website
      ? [
          "In Google AI Studio, generate the complete website implementation from this brief (HTML/CSS/JS or a framework if the environment supports it).",
          "Use Google AI Studio/Gemini to help write the code, but the resulting public website must not depend on an AI model, API key, structured output, RAG or model evaluation unless the client separately requests that.",
          "Provide preview or export instructions and the exact files or project structure to deploy.",
          "The requested deliverable must not become an AI content auditing application, analytics dashboard, compliance checker, prompt generator, reporting tool or internal GARE feature instead of the website.",
        ]
      : [
          "Use Google AI Studio/Gemini only where the requested deliverable genuinely needs AI assistance.",
          "Keep business facts outside the model, document any model choice, API-key handling and structured output, and provide preview or export instructions.",
          "Do not substitute the requested deliverable with an unrelated website, audit app or dashboard.",
        ];
  }
  return [
    "Write this as an implementation specification for a human developer.",
    "Include interfaces, data contracts, deliverables, edge cases, test expectations and handover notes.",
    "List what is explicitly out of scope and do not add an unrelated product.",
  ];
}

function repairObjective(business: SolutionBusiness): string {
  return `Repair the existing website for ${clean(business.name)} so that the supported journeys work reliably. Keep the existing site intact and make focused changes only where the evidence requires them.`;
}

function createObjective(business: SolutionBusiness, deliverable: RequestedDeliverable): string {
  const kind =
    deliverable === "online_ordering_website"
      ? "an online catalogue and ordering website"
      : deliverable === "booking_website"
        ? "a service booking website"
        : "a complete, responsive, customer-facing website";
  return `Build ${kind} for ${clean(business.name)} as the primary deliverable. The website must help visitors ${actionFor(deliverable)}.`;
}

function improveObjective(business: SolutionBusiness, deliverable: RequestedDeliverable): string {
  const addition =
    deliverable === "online_ordering_website"
      ? "add an online catalogue and ordering experience"
      : deliverable === "booking_website"
        ? "add a service booking experience"
        : "extend the website structure, content and contact journeys";
  return `Improve the existing website for ${clean(business.name)} by ${addition}. Preserve the verified content and the existing journeys that already work, and change only what the requested improvement requires.`;
}

export function buildPlatformPrompt(args: PromptBuildArgs, platform: PromptPlatform): string {
  const { business, recommendation } = args;
  const plan = promptPlanFor(recommendation);
  const intentLabel = SOLUTION_INTENT_LABELS[plan.intent];
  const deliverableLabel = REQUESTED_DELIVERABLE_LABELS[plan.requested_deliverable];
  const facts = factLines(business);
  const evidence = evidenceLines(recommendation);
  const audience = audienceFor(business);
  const location = locationFor(business);

  if (plan.website_mode) {
    const objective =
      plan.intent === "REPAIR"
        ? repairObjective(business)
        : plan.intent === "IMPROVE"
          ? improveObjective(business, plan.requested_deliverable)
          : createObjective(business, plan.requested_deliverable);
    return [
      `# ${clean(business.name)} - ${deliverableLabel}`,
      "",
      `Intent: ${plan.intent}`,
      `Requested deliverable: ${deliverableLabel}`,
      `Target platform: ${PROMPT_PLATFORM_LABELS[platform]}`,
      "",
      "## A. Build objective",
      objective,
      "The target deliverable is the website itself. It is not an AI content auditing application, business intelligence dashboard, compliance checker, prompt generator, reporting tool or internal GARE feature.",
      "",
      "## B. Business context",
      `${clean(business.name)} is a ${clean(business.category) || "local business"}${location ? ` in ${location}` : ""}. The website should serve ${audience}. Use only the verified facts below for public copy.`,
      "",
      "## C. Verified information",
      ...(facts.length > 0
        ? facts.map((line) => `- ${line}`)
        : ["- No business facts beyond the name were supplied."]),
      "",
      "### Evidence package",
      ...(evidence.length > 0 ? evidence : ["- No additional evidence was recorded."]),
      "",
      "## D. Customer problem and website purpose",
      `The recorded reason for this work is: ${(clean(recommendation.why_recommended) || clean(recommendation.summary)).replace(/\.$/, "")}.`,
      plan.intent === "REPAIR"
        ? "The purpose is to remove the supported usability, performance or contact-path problems without turning the repair into a redesign."
        : `The purpose is to help visitors ${actionFor(plan.requested_deliverable)}. The exact customer mix and commercial priorities are assumptions until the owner confirms them.`,
      "",
      "## E. Website structure",
      ...pageLines(plan.requested_deliverable, business),
      "- Do not add pages that imply unverified services, prices, stock, certifications or locations.",
      "",
      "## F. Functional requirements",
      "- Primary navigation, mobile menu, footer and clear calls to action.",
      "- Click-to-call, email and map links only when the matching verified detail exists.",
      "- Public visitors must not need an account.",
      "- Forms must include labels, required-field validation, an explicit demo state when no endpoint exists, and a retryable error state.",
      "- Any catalogue, filter, booking or ordering feature must use owner-supplied content and clearly marked placeholders.",
      "- No live payment, stock, delivery, booking or messaging integration may be claimed unless it is configured and verified.",
      "",
      "### Existing implementation requirements",
      ...requirementLines(recommendation.requirements),
      "",
      "## G. Design requirements",
      "- Mobile-first, responsive layout with a clear visual hierarchy and readable typography.",
      "- Professional styling appropriate to the business category without inventing brand assets.",
      "- Use owner-supplied logos and photography only; otherwise use clearly labelled placeholders or neutral patterns.",
      "- Accessible contrast, focus states, keyboard navigation, semantic headings and descriptive image alt text.",
      "- Avoid fake reviews, fake project photos, invented certifications and misleading stock imagery.",
      "",
      "## H. Administration",
      "- No admin dashboard is required for the first release unless the owner explicitly confirms a need to edit content or manage enquiries.",
      "- If owner editing is confirmed, add a protected owner area with server-side authentication and authorisation; do not expose private data publicly.",
      "- Do not present analytics, BI reporting or an AI audit console as part of this website.",
      "",
      "## I. Technical requirements",
      "- Build a responsive website using the stack available in the target environment; if none is available, produce self-contained HTML, CSS and JavaScript.",
      "- No API key, secret or private credential may appear in client code or the repository.",
      "- Keep verified business content in one clearly editable configuration or content layer.",
      "- Use semantic HTML, accessible forms and responsive images.",
      "- If a form backend is not supplied, keep the form in clearly labelled demo mode and do not claim a message was delivered.",
      "- Document any external dependency, environment variable and deployment step.",
      "",
      "## J. Missing information",
      ...(recommendation.unknowns.length > 0
        ? recommendation.unknowns.map((item) => `- ${item}`)
        : ["- Owner requirements, budget and timeline are not confirmed."]),
      "- Product or service names, descriptions, prices, stock levels and specifications are not supplied unless listed above.",
      "- Opening hours, delivery coverage, payment methods and business policies are not supplied unless listed above.",
      "- Logo, brand assets, photography, testimonials and review permissions are not supplied unless listed above.",
      "- The production domain, hosting preference and form destination are not confirmed.",
      "Where content is missing, render a clearly labelled placeholder or omit the section. Never fill gaps with invented facts.",
      "",
      "## K. Build execution instructions",
      ...platformInstructions(platform, true).map((line) => `- ${line}`),
      "",
      "## L. Acceptance criteria",
      ...acceptanceLines(),
      "",
      "## Assumptions and unknowns",
      ...(recommendation.assumptions.length > 0
        ? recommendation.assumptions.map((item) => `- ${item}`)
        : ["- The owner will confirm the final scope before publication."]),
      `- This prompt was classified as ${intentLabel} for a ${deliverableLabel.toLowerCase()}; if that is not the client's request, stop and ask for clarification.`,
      "",
    ].join("\n");
  }

  const objective =
    plan.intent === "ANALYZE"
      ? `Produce an analysis and scoping deliverable for ${clean(business.name)} from the recorded evidence. Do not build a website or application unless a later request explicitly changes the deliverable.`
      : plan.intent === "AUTOMATE"
        ? `Design and implement the confirmed ${deliverableLabel.toLowerCase()} for ${clean(business.name)}. Do not build a public website unless the requested deliverable explicitly includes one.`
        : plan.intent === "MAINTAIN"
          ? `Create an actionable ${deliverableLabel.toLowerCase()} for ${clean(business.name)}. This is a maintenance deliverable, not a new website build.`
          : `Deliver the confirmed ${deliverableLabel.toLowerCase()} for ${clean(business.name)}. Keep the work limited to the requested outcome.`;

  return [
    `# ${clean(business.name)} - ${deliverableLabel}`,
    "",
    `Intent: ${plan.intent}`,
    `Requested deliverable: ${deliverableLabel}`,
    `Target platform: ${PROMPT_PLATFORM_LABELS[platform]}`,
    "",
    "## Objective",
    objective,
    "",
    "## Business context",
    `${clean(business.name)} is a ${clean(business.category) || "local business"}${location ? ` in ${location}` : ""}. Use only the verified facts below for public copy.`,
    "",
    "## Verified facts",
    ...(facts.length > 0
      ? facts.map((line) => `- ${line}`)
      : ["- No business facts beyond the name were supplied."]),
    "",
    "### Evidence package",
    ...(evidence.length > 0 ? evidence : ["- No additional evidence was recorded."]),
    "",
    "## Problem and evidence",
    `${clean(recommendation.why_recommended) || clean(recommendation.summary)}`,
    "",
    "## Users",
    `- ${audience}.`,
    "- The business owner or staff member who will use or maintain the deliverable.",
    "",
    "## Requirements",
    ...requirementLines(recommendation.requirements),
    "",
    "## Pages and components",
    plan.intent === "ANALYZE"
      ? "- Findings summary, evidence table, prioritised recommendations and explicit open questions."
      : plan.intent === "AUTOMATE"
        ? "- Workflow definition, trigger and action configuration, owner controls, activity log and failure handling."
        : plan.intent === "MAINTAIN"
          ? "- Maintenance scope, cadence, checklist, owner, next due date, verification evidence and escalation path."
          : "- The smallest screens or components needed for the confirmed outcome.",
    "",
    "## User journeys",
    "- The primary user completes the requested outcome with clear success, failure and recovery states.",
    "- The owner can understand what happened without developer tools.",
    "",
    "## Data and backend",
    "- Model only the data required by the confirmed deliverable. Validate input server-side where a backend exists.",
    "- Do not invent business records, credentials, analytics or integrations.",
    "",
    "## Frontend",
    "- Build accessible, responsive interfaces with explicit loading, empty, success and error states.",
    "",
    "## Integrations",
    "- Use only confirmed integrations. If an integration is not configured, show a clearly labelled demo or unavailable state.",
    "",
    "## Auth, security and privacy",
    "- Validate all input, sanitise displayed content, protect secrets and enforce authentication and authorisation where private data is involved.",
    "- Never put an API key or private credential in client code.",
    "",
    "## Responsive design",
    "- The deliverable must work at 360px and 1280px viewport widths where it has a user interface.",
    "",
    "## Error and empty states",
    "- Every data-driven screen must have an empty state, a validation-error state and a retryable failure state.",
    "",
    "## Tests",
    "- Run the project tests, typecheck and build. Add tests for the primary success path, validation failures and missing-data states.",
    "",
    "## Acceptance criteria",
    "- The primary outcome is completed end to end and returns HTTP 200 where a web surface is delivered.",
    "- The UI works at 360px and 1280px where applicable.",
    "- Invalid input is rejected with a useful error.",
    "- Every displayed business fact is traceable to the evidence package.",
    "- No secret appears in client code and no unverified claim is presented as fact.",
    ...(plan.intent === "ANALYZE"
      ? ["- The deliverable is an analysis, not a website build."]
      : plan.intent === "AUTOMATE"
        ? ["- The deliverable is the automation workflow, not an unrelated website."]
        : plan.intent === "MAINTAIN"
          ? ["- The deliverable is a maintenance plan and record, not a new website build."]
          : []),
    "",
    "## Deployment",
    "- Document environment variables, deployment steps, rollback and handover.",
    "",
    "## Assumptions and unknowns",
    ...(recommendation.assumptions.length > 0
      ? recommendation.assumptions.map((item) => `- ${item}`)
      : ["- The owner will confirm the final scope before implementation."]),
    ...recommendation.unknowns.map((item) => `- ${item}`),
    "",
    "## Platform execution",
    ...platformInstructions(platform, false).map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export function buildSolutionPromptSet(args: PromptBuildArgs): {
  platform: PromptPlatform;
  prompt: string;
}[] {
  return (["opencode", "lovable", "google_ai_studio", "developer_spec"] as const).map(
    (platform) => ({
      platform,
      prompt: buildPlatformPrompt(args, platform),
    }),
  );
}
