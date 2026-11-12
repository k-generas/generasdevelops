import { OUTREACH_STAGES, type OutreachStage } from "./outreach-tracker";
import {
  PROFESSIONAL_AVAILABILITY_STATUSES,
  PROFESSIONAL_TYPES,
  type ProfessionalAvailabilityStatus,
  type ProfessionalType,
} from "./professional-intelligence";
import {
  PROSPECT_FILTER_LIMITS,
  normalizeProspectFilters,
  type ProspectEntityKind,
  type ProspectFilters,
} from "./prospect-lists";

export const PROSPECT_PROMPT_MAX = 500;

export type ProspectInterpretationSource = "rules" | "ai";

export type ProspectInterpretation = {
  prompt: string;
  entityKind: ProspectEntityKind;
  filters: ProspectFilters;
  source: ProspectInterpretationSource;
  warnings: string[];
  unsupported: string[];
  fallbackReason: string | null;
};

const BUSINESS_WORDS = new Set([
  "agency",
  "agencies",
  "business",
  "businesses",
  "clinic",
  "clinics",
  "company",
  "companies",
  "firm",
  "firms",
  "hotel",
  "hotels",
  "manufacturer",
  "manufacturers",
  "restaurant",
  "restaurants",
  "retailer",
  "retailers",
  "salon",
  "salons",
  "school",
  "schools",
  "shop",
  "shops",
  "startup",
  "startups",
  "studio",
  "studios",
  "supplier",
  "suppliers",
  "wholesaler",
  "wholesalers",
]);

const PROFESSIONAL_WORDS = new Set([
  "consultant",
  "consultants",
  "creator",
  "creators",
  "designer",
  "designers",
  "developer",
  "developers",
  "director",
  "directors",
  "engineer",
  "engineers",
  "executive",
  "executives",
  "founder",
  "founders",
  "freelancer",
  "freelancers",
  "investor",
  "investors",
  "manager",
  "managers",
  "marketer",
  "marketers",
  "partner",
  "partners",
  "people",
  "person",
  "professional",
  "professionals",
  "salespeople",
  "salesperson",
]);

const AUDIENCE_NOUNS = new Set([
  ...BUSINESS_WORDS,
  ...PROFESSIONAL_WORDS,
  "accountant",
  "accountants",
  "architect",
  "architects",
  "dentist",
  "dentists",
  "lawyer",
  "lawyers",
  "nurse",
  "nurses",
  "photographer",
  "photographers",
  "teacher",
  "teachers",
  "writer",
  "writers",
]);

const GENERIC_QUERY_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "any",
  "are",
  "business",
  "businesses",
  "available",
  "can",
  "companies",
  "company",
  "contacted",
  "discover",
  "find",
  "for",
  "from",
  "get",
  "give",
  "i",
  "identify",
  "in",
  "is",
  "leads",
  "limited",
  "list",
  "looking",
  "lost",
  "me",
  "messaged",
  "near",
  "negotiating",
  "not",
  "of",
  "open",
  "or",
  "people",
  "person",
  "please",
  "professional",
  "professionals",
  "prospect",
  "prospects",
  "replied",
  "search",
  "show",
  "some",
  "the",
  "to",
  "unavailable",
  "want",
  "who",
  "with",
  "won",
  "work",
  "working",
]);

const ADJECTIVE_WORDS = new Set([
  "b2b",
  "b2c",
  "best",
  "early",
  "early-stage",
  "established",
  "experienced",
  "global",
  "growing",
  "independent",
  "large",
  "leading",
  "local",
  "luxury",
  "medium",
  "modern",
  "new",
  "professional",
  "small",
  "top",
  "young",
]);

const LOCATION_BAD_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "it",
  "me",
  "need",
  "needs",
  "of",
  "the",
  "this",
  "that",
  "to",
  "with",
  "work",
]);

const STAGE_PATTERNS: { pattern: RegExp; stage: OutreachStage }[] = [
  { pattern: /\bnot (?:yet )?contacted\b/i, stage: "not_contacted" },
  { pattern: /\b(?:messaged|contacted|reached out)\b/i, stage: "messaged" },
  { pattern: /\breplied\b/i, stage: "replied" },
  { pattern: /\bnegotiat(?:e|ed|ing|ion)\b/i, stage: "negotiating" },
  { pattern: /\bwon\b/i, stage: "won" },
  { pattern: /\blost\b/i, stage: "lost" },
];

const PROFESSIONAL_TYPE_PATTERNS = PROFESSIONAL_TYPES.filter((type) => type !== "other").map(
  (type) => ({
    type,
    pattern: new RegExp(`\\b${type}s?\\b`, "i"),
  }),
);

const UNSUPPORTED_PATTERNS = [
  /\bno websites?\b/i,
  /\bwithout (?:a )?websites?\b/i,
  /\bmissing websites?\b/i,
  /\bbroken (?:website|websites|site|sites)\b/i,
  /\bslow (?:website|websites|site|sites)\b/i,
  /\boutdated (?:website|websites|content|site|sites)\b/i,
  /\bpoor mobile (?:experiences?|sites?)\b/i,
  /\bweak (?:online|booking|social) (?:presence|experiences?)\b/i,
  /\bwebsite (?:issues?|problems?)\b/i,
  /\bhiring\b/i,
  /\bjob postings?\b/i,
  /\brecently raised\b/i,
  /\braised funding\b/i,
  /\bfunding rounds?\b/i,
  /\bnewly funded\b/i,
  /\b(?:buying )?intent\b/i,
  /\bready to buy\b/i,
  /\bdecision makers?\b/i,
  /\bwhite[- ]label\b/i,
  /\bsubcontract(?:ing)?\b/i,
];

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").slice(0, PROSPECT_PROMPT_MAX);
}

function words(prompt: string): string[] {
  return prompt.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) ?? [];
}

function detectEntityKind(prompt: string): {
  entityKind: ProspectEntityKind;
  warning: string | null;
} {
  let business = 0;
  let professional = 0;
  for (const word of words(prompt)) {
    if (BUSINESS_WORDS.has(word)) business += 1;
    if (PROFESSIONAL_WORDS.has(word)) professional += 1;
  }
  if (professional > business) return { entityKind: "professional", warning: null };
  if (business > professional) return { entityKind: "business", warning: null };
  if (professional > 0) {
    return {
      entityKind: "professional",
      warning: "The audience was ambiguous; interpreted as professionals.",
    };
  }
  return {
    entityKind: "business",
    warning: business > 0 ? null : "No audience was stated; interpreted as businesses by default.",
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

type LocationMatch = {
  value: string;
};

function extractLocation(prompt: string): LocationMatch | null {
  const marker = /\b(?:in|near|across|within|based in|located in)\s+/gi;
  for (const match of prompt.matchAll(marker)) {
    const index = match.index ?? 0;
    const before = prompt.slice(Math.max(0, index - 28), index).toLowerCase();
    if (/\b(?:interested|experienced|speciali[sz]ed|expert|skilled)\s*$/.test(before)) continue;
    const rest = prompt.slice(index + match[0].length);
    const raw = rest.match(/^([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,5})/)?.[1] ?? "";
    const cut = raw.split(
      /\b(?:with|that|who|which|interested|looking|seeking|needing|need|needs|offering|available|open|recently|may|might|has|have|are|is|and|or|for|from|to)\b/i,
    )[0];
    const value = (cut ?? "").replace(/[,.;:!?]+$/g, "").trim();
    if (!value) continue;
    const tokens = value.split(/\s+/);
    if (tokens.length > 4) continue;
    if (tokens.some((token) => LOCATION_BAD_WORDS.has(token.toLowerCase()))) continue;
    return { value: titleCase(value) };
  }
  return null;
}

function singleKeyword(value: string, kind: ProspectEntityKind): string {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9'’ -]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let fallback = "";
  for (const token of tokens) {
    if (GENERIC_QUERY_WORDS.has(token)) continue;
    if (ADJECTIVE_WORDS.has(token)) continue;
    if (AUDIENCE_NOUNS.has(token)) {
      if (!fallback) fallback = token;
      continue;
    }
    if (kind === "professional" && PROFESSIONAL_TYPES.some((type) => token === type)) {
      if (!fallback) fallback = token;
      continue;
    }
    if (token.length < 2) continue;
    return token.slice(0, PROSPECT_FILTER_LIMITS.query);
  }
  if (!fallback) return "";
  if (fallback.endsWith("ies")) fallback = `${fallback.slice(0, -3)}y`;
  else if (fallback.endsWith("s") && fallback.length > 3) fallback = fallback.slice(0, -1);
  return fallback;
}

function keywordFromPrompt(prompt: string, location: LocationMatch | null): string {
  let core = prompt;
  if (location) {
    core = core.replace(
      new RegExp(
        `\\b(?:in|near|across|within|based in|located in)\\s+${escapeRegex(location.value)}`,
        "i",
      ),
      " ",
    );
  }
  core = core.replace(
    /\b(?:with|that|who|which|interested in|looking for|seeking|needing|need|needs|offering)\b[\s\S]*$/i,
    " ",
  );
  return core;
}

function detectStage(prompt: string): OutreachStage | null {
  for (const { pattern, stage } of STAGE_PATTERNS) {
    if (pattern.test(prompt)) return stage;
  }
  return null;
}

function detectProfessionalType(prompt: string): ProfessionalType | null {
  for (const { type, pattern } of PROFESSIONAL_TYPE_PATTERNS) {
    if (pattern.test(prompt)) return type;
  }
  return null;
}

function detectAvailability(prompt: string): ProfessionalAvailabilityStatus | null {
  if (/\b(?:not available|unavailable)\b/i.test(prompt)) return "unavailable";
  if (/\blimited (?:availability|capacity)\b/i.test(prompt)) return "limited";
  if (/\bunknown availability\b/i.test(prompt)) return "unknown";
  if (
    /\b(?:open to work|open to opportunities|available for work|available|open)\b/i.test(prompt)
  ) {
    return "open";
  }
  return null;
}

function detectUnsupported(prompt: string): string[] {
  const found = new Set<string>();
  for (const pattern of UNSUPPORTED_PATTERNS) {
    const match = prompt.match(pattern);
    if (match?.[0]) found.add(match[0].trim().toLowerCase());
  }
  return [...found].slice(0, 8);
}

function unique(values: string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function unsupportedWarning(): string {
  return "Unsupported conditions were not applied. Saved lists filter stored records only; they do not evaluate website quality, hiring, funding or buying intent.";
}

function allowedStage(value: string): OutreachStage | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return OUTREACH_STAGES.includes(normalized as OutreachStage)
    ? (normalized as OutreachStage)
    : null;
}

function allowedProfessionalType(value: string): ProfessionalType | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return PROFESSIONAL_TYPES.includes(normalized as ProfessionalType)
    ? (normalized as ProfessionalType)
    : null;
}

function allowedAvailability(value: string): ProfessionalAvailabilityStatus | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return PROFESSIONAL_AVAILABILITY_STATUSES.includes(normalized as ProfessionalAvailabilityStatus)
    ? (normalized as ProfessionalAvailabilityStatus)
    : null;
}

export function interpretProspectPromptRules(promptInput: string): ProspectInterpretation {
  const prompt = normalizePrompt(promptInput);
  if (!prompt) throw new Error("Describe the audience you want to find.");

  const warnings: string[] = [];
  const detected = detectEntityKind(prompt);
  if (detected.warning) warnings.push(detected.warning);
  const entityKind = detected.entityKind;
  const location = extractLocation(prompt);
  const keyword = singleKeyword(keywordFromPrompt(prompt, location), entityKind);
  const stage = detectStage(prompt);
  const professionalType = detectProfessionalType(prompt);
  const availability = detectAvailability(prompt);

  if (stage && entityKind === "professional") {
    warnings.push("Professional relationship stages are not a saved-list filter yet.");
  }
  if (entityKind === "professional" && /\bdevelopers?\b/i.test(prompt) && !professionalType) {
    warnings.push(
      "Developer is not a professional type in GARE yet; the keyword filter is used instead.",
    );
  }
  if (availability && entityKind === "business") {
    warnings.push("Availability is only a professional filter.");
  }
  if (!keyword && !location && !stage && !professionalType && !availability) {
    warnings.push("No filter could be inferred. Add a keyword, place or audience trait.");
  }

  const unsupported = detectUnsupported(prompt);
  if (unsupported.length > 0) warnings.push(unsupportedWarning());

  return {
    prompt,
    entityKind,
    filters: normalizeProspectFilters(
      {
        query: keyword,
        location: location?.value ?? "",
        stage: entityKind === "business" ? (stage ?? "") : "",
        professionalType: entityKind === "professional" ? (professionalType ?? "") : "",
        availability: entityKind === "professional" ? (availability ?? "") : "",
      },
      entityKind,
    ),
    source: "rules",
    warnings: unique(warnings, 6),
    unsupported,
    fallbackReason: null,
  };
}

export function validateAiProspectInterpretation(
  input: unknown,
  promptInput: string,
): ProspectInterpretation {
  const prompt = normalizePrompt(promptInput);
  if (!prompt) throw new Error("Describe the audience you want to find.");
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const warnings: string[] = [];
  const entityKind: ProspectEntityKind =
    raw["entityKind"] === "professional"
      ? "professional"
      : raw["entityKind"] === "business"
        ? "business"
        : "business";
  if (raw["entityKind"] !== "business" && raw["entityKind"] !== "professional") {
    warnings.push("The AI returned an unknown audience; interpreted as businesses by default.");
  }

  const rawFilters =
    raw["filters"] && typeof raw["filters"] === "object" && !Array.isArray(raw["filters"])
      ? (raw["filters"] as Record<string, unknown>)
      : {};
  const filters = normalizeProspectFilters(rawFilters, entityKind);
  if (
    entityKind === "professional" &&
    typeof rawFilters["stage"] === "string" &&
    rawFilters["stage"].trim()
  ) {
    warnings.push(
      "Professional lists do not use the business outreach stage filter; it was ignored.",
    );
  }

  if (filters.stage) {
    const stage = allowedStage(filters.stage);
    if (!stage) {
      warnings.push(`Ignored unsupported outreach stage "${filters.stage}".`);
      filters.stage = "";
    } else {
      filters.stage = stage;
    }
  }
  if (filters.professionalType) {
    const type = allowedProfessionalType(filters.professionalType);
    if (!type) {
      warnings.push(`Ignored unsupported professional type "${filters.professionalType}".`);
      filters.professionalType = "";
    } else {
      filters.professionalType = type;
    }
  }
  if (filters.availability) {
    const availability = allowedAvailability(filters.availability);
    if (!availability) {
      warnings.push(`Ignored unsupported availability "${filters.availability}".`);
      filters.availability = "";
    } else {
      filters.availability = availability;
    }
  }
  filters.query = singleKeyword(filters.query, entityKind);
  filters.location = filters.location.slice(0, PROSPECT_FILTER_LIMITS.location);

  const aiUnsupported = Array.isArray(raw["unsupported"])
    ? raw["unsupported"].filter((value): value is string => typeof value === "string")
    : [];
  const unsupported = unique([...aiUnsupported, ...detectUnsupported(prompt)], 8);
  if (unsupported.length > 0) warnings.push(unsupportedWarning());

  return {
    prompt,
    entityKind,
    filters,
    source: "ai",
    warnings: unique(warnings, 6),
    unsupported,
    fallbackReason: null,
  };
}
