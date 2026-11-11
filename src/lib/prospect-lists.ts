export const PROSPECT_ENTITY_KINDS = ["business", "professional"] as const;

export type ProspectEntityKind = (typeof PROSPECT_ENTITY_KINDS)[number];

export type ProspectFilters = {
  query: string;
  district: string;
  sector: string;
  stage: string;
  country: string;
  professionalType: string;
  availability: string;
};

export type ProspectList = {
  id: string;
  name: string;
  description: string | null;
  entityKind: ProspectEntityKind;
  filters: ProspectFilters;
  filterVersion: number;
  createdAt: string;
  updatedAt: string;
};

export const PROSPECT_FILTER_LIMITS = {
  query: 160,
  district: 120,
  sector: 120,
  stage: 80,
  country: 80,
  professionalType: 40,
  availability: 40,
} as const;

export type ProspectListValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ProspectPreviewRow = {
  id: string;
  name: string;
  detail: string;
  contact: string;
  country: string;
  doNotContact: boolean;
};

export function previewFromRecord(
  kind: ProspectEntityKind,
  row: Record<string, string>,
): ProspectPreviewRow {
  if (kind === "business") {
    return {
      id: row["id"] ?? "",
      name: row["name"] ?? "Unnamed business",
      detail: [row["category"], row["sector"], row["district"]].filter(Boolean).join(" · "),
      contact: row["emails"] || row["phone"] || row["website"] || "",
      country: row["province"] || row["district"] || "",
      doNotContact: row["do_not_contact"] === "yes",
    };
  }
  return {
    id: row["id"] ?? "",
    name: row["full_name"] ?? "Unnamed professional",
    detail: [row["headline"], row["professional_type"], row["city"]].filter(Boolean).join(" · "),
    contact: row["public_email"] || row["public_phone"] || row["website"] || "",
    country: row["country"] ?? "",
    doNotContact: row["do_not_contact"] === "yes",
  };
}

export function isProspectEntityKind(value: unknown): value is ProspectEntityKind {
  return value === "business" || value === "professional";
}

export function prospectEntityLabel(kind: ProspectEntityKind): string {
  return kind === "business" ? "Businesses" : "Professionals";
}

export function emptyProspectFilters(): ProspectFilters {
  return {
    query: "",
    district: "",
    sector: "",
    stage: "",
    country: "",
    professionalType: "",
    availability: "",
  };
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeProspectFilters(
  input: Partial<ProspectFilters> | Record<string, unknown> | null | undefined,
  kind: ProspectEntityKind,
): ProspectFilters {
  const value = input ?? {};
  const normalized: ProspectFilters = {
    query: clean(value.query, PROSPECT_FILTER_LIMITS.query),
    district: clean(value.district, PROSPECT_FILTER_LIMITS.district),
    sector: clean(value.sector, PROSPECT_FILTER_LIMITS.sector),
    stage: clean(value.stage, PROSPECT_FILTER_LIMITS.stage),
    country: clean(value.country, PROSPECT_FILTER_LIMITS.country),
    professionalType: clean(value.professionalType, PROSPECT_FILTER_LIMITS.professionalType),
    availability: clean(value.availability, PROSPECT_FILTER_LIMITS.availability),
  };
  if (kind === "business") {
    normalized.country = "";
    normalized.professionalType = "";
    normalized.availability = "";
  } else {
    normalized.district = "";
    normalized.sector = "";
    normalized.stage = "";
  }
  return normalized;
}

export function readProspectFilters(value: unknown, kind: ProspectEntityKind): ProspectFilters {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return normalizeProspectFilters(source, kind);
}

export function prospectFiltersAreEmpty(filters: ProspectFilters): boolean {
  return Object.values(filters).every((value) => !value.trim());
}

export function prospectFilterChips(
  kind: ProspectEntityKind,
  filtersInput: ProspectFilters,
): string[] {
  const filters = normalizeProspectFilters(filtersInput, kind);
  const chips: string[] = [];
  if (filters.query) chips.push(`Keyword: ${filters.query}`);
  if (kind === "business") {
    if (filters.district) chips.push(`District: ${filters.district}`);
    if (filters.sector) chips.push(`Sector: ${filters.sector}`);
    if (filters.stage) chips.push(`Outreach stage: ${filters.stage}`);
  } else {
    if (filters.country) chips.push(`Country: ${filters.country}`);
    if (filters.professionalType) chips.push(`Type: ${filters.professionalType}`);
    if (filters.availability) chips.push(`Availability: ${filters.availability}`);
  }
  if (chips.length === 0) chips.push(`All ${prospectEntityLabel(kind).toLowerCase()}`);
  return chips;
}

export function prospectFilterSummary(kind: ProspectEntityKind, filters: ProspectFilters): string {
  return prospectFilterChips(kind, filters).join(" · ");
}

export function validateProspectList(input: {
  name: string;
  entityKind: ProspectEntityKind;
  filters: ProspectFilters;
}): ProspectListValidationResult {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("List name is required.");
  if (name.length > 160) errors.push("List name must be 160 characters or less.");
  if (!isProspectEntityKind(input.entityKind)) errors.push("Choose a valid list audience.");
  for (const [key, max] of Object.entries(PROSPECT_FILTER_LIMITS)) {
    const value = input.filters[key as keyof ProspectFilters];
    if (typeof value !== "string") errors.push(`Invalid ${key} filter.`);
    else if (value.length > max) errors.push(`The ${key} filter is too long.`);
  }
  return { valid: errors.length === 0, errors };
}
