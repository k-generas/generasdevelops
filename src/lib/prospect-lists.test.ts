import { describe, expect, it } from "vitest";
import {
  emptyProspectFilters,
  isProspectEntityKind,
  normalizeProspectFilters,
  previewFromRecord,
  prospectEntityLabel,
  prospectFilterChips,
  prospectFilterSummary,
  prospectFiltersAreEmpty,
  readProspectFilters,
  validateProspectList,
  type ProspectFilters,
} from "./prospect-lists";

function filters(overrides: Partial<ProspectFilters> = {}): ProspectFilters {
  return { ...emptyProspectFilters(), ...overrides };
}

describe("prospect list filters", () => {
  it("trims values and caps them at the server limits", () => {
    const normalized = normalizeProspectFilters(
      {
        query: `  ${"a".repeat(200)}  `,
        district: "  Kigali  ",
        sector: "  Dental  ",
      },
      "business",
    );
    expect(normalized.query).toHaveLength(160);
    expect(normalized.district).toBe("Kigali");
    expect(normalized.sector).toBe("Dental");
  });

  it("clears professional-only filters for business lists", () => {
    const normalized = normalizeProspectFilters(
      {
        country: "Kenya",
        professionalType: "developer",
        availability: "available",
      },
      "business",
    );
    expect(normalized.country).toBe("");
    expect(normalized.professionalType).toBe("");
    expect(normalized.availability).toBe("");
  });

  it("clears business-only filters for professional lists", () => {
    const normalized = normalizeProspectFilters(
      {
        district: "Kigali",
        sector: "Finance",
        stage: "contacted",
      },
      "professional",
    );
    expect(normalized.district).toBe("");
    expect(normalized.sector).toBe("");
    expect(normalized.stage).toBe("");
  });

  it("keeps shared keyword and location filters for both audiences", () => {
    expect(normalizeProspectFilters({ query: " hotel " }, "business").query).toBe("hotel");
    expect(normalizeProspectFilters({ query: " hotel " }, "professional").query).toBe("hotel");
    expect(normalizeProspectFilters({ location: " Cape Town " }, "business").location).toBe(
      "Cape Town",
    );
    expect(normalizeProspectFilters({ location: " Cape Town " }, "professional").location).toBe(
      "Cape Town",
    );
  });

  it("reads malformed stored filters as an empty set", () => {
    expect(readProspectFilters(null, "business")).toEqual(emptyProspectFilters());
    expect(readProspectFilters(["nope"], "business")).toEqual(emptyProspectFilters());
    expect(readProspectFilters({ query: 42 }, "business").query).toBe("");
  });

  it("builds readable chips and summaries", () => {
    const business = filters({
      query: "clinic",
      location: "Kigali",
      district: "Gasabo",
      sector: "Dental",
    });
    expect(prospectFilterChips("business", business)).toEqual([
      "Keyword: clinic",
      "Location: Kigali",
      "District: Gasabo",
      "Sector: Dental",
    ]);
    expect(prospectFilterSummary("business", business)).toContain("Sector: Dental");
    expect(prospectFilterChips("professional", filters())).toEqual(["All professionals"]);
    expect(prospectFilterChips("business", filters())).toEqual(["All businesses"]);
  });

  it("detects empty filters", () => {
    expect(prospectFiltersAreEmpty(emptyProspectFilters())).toBe(true);
    expect(prospectFiltersAreEmpty(filters({ query: "x" }))).toBe(false);
  });

  it("validates names, audiences and filter lengths", () => {
    expect(
      validateProspectList({
        name: "Dental clinics",
        entityKind: "business",
        filters: filters(),
      }).valid,
    ).toBe(true);
    expect(
      validateProspectList({
        name: " ",
        entityKind: "business",
        filters: filters(),
      }).errors,
    ).toContain("List name is required.");
    expect(
      validateProspectList({
        name: "x".repeat(161),
        entityKind: "professional",
        filters: filters(),
      }).errors,
    ).toContain("List name must be 160 characters or less.");
    expect(
      validateProspectList({
        name: "Too long",
        entityKind: "professional",
        filters: filters({ country: "x".repeat(81) }),
      }).errors,
    ).toContain("The country filter is too long.");
    expect(
      validateProspectList({
        name: "Too long",
        entityKind: "business",
        filters: filters({ location: "x".repeat(121) }),
      }).errors,
    ).toContain("The location filter is too long.");
  });

  it("maps business preview rows with safe contact fallbacks", () => {
    expect(
      previewFromRecord("business", {
        id: "b1",
        name: "Acme Dental",
        category: "Clinic",
        sector: "Dental",
        district: "Kigali",
        province: "Kigali City",
        website: "https://acme.example",
        do_not_contact: "yes",
      }),
    ).toEqual({
      id: "b1",
      name: "Acme Dental",
      detail: "Clinic · Dental · Kigali",
      contact: "https://acme.example",
      country: "Kigali City",
      doNotContact: true,
    });
  });

  it("maps professional preview rows and flags unavailable contacts", () => {
    expect(
      previewFromRecord("professional", {
        id: "p1",
        full_name: "Ada Lovelace",
        headline: "Engineer",
        professional_type: "developer",
        city: "Nairobi",
        country: "Kenya",
        public_email: "ada@example.com",
        do_not_contact: "no",
      }),
    ).toEqual({
      id: "p1",
      name: "Ada Lovelace",
      detail: "Engineer · developer · Nairobi",
      contact: "ada@example.com",
      country: "Kenya",
      doNotContact: false,
    });
  });

  it("labels audiences and validates entity kinds", () => {
    expect(prospectEntityLabel("business")).toBe("Businesses");
    expect(prospectEntityLabel("professional")).toBe("Professionals");
    expect(isProspectEntityKind("business")).toBe(true);
    expect(isProspectEntityKind("people")).toBe(false);
  });
});
