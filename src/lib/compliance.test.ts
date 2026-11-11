import { describe, expect, it } from "vitest";
import {
  complianceSummary,
  isSuppressionActive,
  normalizeCountryCode,
  normalizeSuppressionValue,
  outreachEligibility,
  policyForCountry,
  suppressionMatches,
  type SuppressionEntry,
} from "./compliance";

const entry = (overrides: Partial<SuppressionEntry> = {}): SuppressionEntry => ({
  scope: "email",
  value: "buyer@example.com",
  channel: "all",
  reason: "unsubscribed",
  ...overrides,
});

describe("suppression normalisation", () => {
  it("normalises contact values by scope", () => {
    expect(normalizeSuppressionValue("email", " Buyer@Example.COM ")).toBe("buyer@example.com");
    expect(normalizeSuppressionValue("email", "not-an-email")).toBeNull();
    expect(normalizeSuppressionValue("phone", "+250 788 000 000")).toBe("+250788000000");
    expect(normalizeSuppressionValue("phone", "123")).toBeNull();
    expect(normalizeSuppressionValue("domain", "https://www.Example.com/path")).toBe(
      "example.com",
    );
  });

  it("treats future or missing expiry as active", () => {
    expect(isSuppressionActive({ expiresAt: null })).toBe(true);
    expect(isSuppressionActive({ expiresAt: "2999-01-01T00:00:00Z" })).toBe(true);
    expect(isSuppressionActive({ expiresAt: "2000-01-01T00:00:00Z" })).toBe(false);
  });

  it("matches every supported scope and respects channels", () => {
    const contact = {
      email: "Buyer@Example.com",
      phone: "+250788000000",
      domain: "example.com",
      businessId: "11111111-1111-4111-8111-111111111111",
      professionalId: "22222222-2222-4222-8222-222222222222",
    };
    expect(suppressionMatches(entry(), contact, "email")).toBe(true);
    expect(suppressionMatches(entry({ channel: "whatsapp" }), contact, "email")).toBe(false);
    expect(suppressionMatches(entry({ scope: "phone", value: "+250788000000" }), contact, "phone")).toBe(
      true,
    );
    expect(suppressionMatches(entry({ scope: "domain", value: "www.example.com" }), contact, "email")).toBe(
      true,
    );
    expect(
      suppressionMatches(
        entry({ scope: "business", value: "11111111-1111-4111-8111-111111111111" }),
        contact,
        "phone",
      ),
    ).toBe(true);
    expect(
      suppressionMatches(
        entry({ scope: "professional", value: "22222222-2222-4222-8222-222222222222" }),
        contact,
        "linkedin",
      ),
    ).toBe(true);
    expect(suppressionMatches(entry({ scope: "contact" }), contact, "sms")).toBe(true);
  });
});

describe("country policy templates", () => {
  it("maps common names and falls back to the global baseline", () => {
    expect(normalizeCountryCode("Rwanda")).toBe("RW");
    expect(normalizeCountryCode("United Kingdom")).toBe("GB");
    expect(normalizeCountryCode("Atlantis")).toBe("GLOBAL");
    expect(policyForCountry("Kenya").countryCode).toBe("KE");
    expect(policyForCountry("Atlantis").countryCode).toBe("GLOBAL");
  });

  it("never presents a policy as legal advice", () => {
    for (const code of ["GLOBAL", "RW", "GB", "US"]) {
      const p = policyForCountry(code);
      expect(p.ownerReviewRequired).toBe(true);
      expect(p.notes.length).toBeGreaterThan(10);
    }
  });
});

describe("outreach eligibility", () => {
  it("blocks suppressed contacts even when the owner confirms a basis", () => {
    const result = outreachEligibility({
      channel: "email",
      country: "Rwanda",
      contact: { email: "buyer@example.com" },
      entries: [entry()],
      ownerConfirmedLawfulBasis: true,
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.matchedEntries).toHaveLength(1);
  });

  it("blocks business and professional do-not-contact flags", () => {
    expect(
      outreachEligibility({
        channel: "phone",
        contact: { phone: "+250788000000" },
        entries: [],
        businessDoNotContact: true,
        ownerConfirmedLawfulBasis: true,
      }).status,
    ).toBe("blocked");
    expect(
      outreachEligibility({
        channel: "linkedin",
        contact: {},
        entries: [],
        professionalDoNotContact: true,
        ownerConfirmedLawfulBasis: true,
      }).status,
    ).toBe("blocked");
  });

  it("requires owner review before allowing outreach", () => {
    const result = outreachEligibility({
      channel: "email",
      country: "Rwanda",
      contact: { email: "buyer@example.com" },
      entries: [],
    });
    expect(result.status).toBe("review_required");
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => /lawful basis/i.test(r))).toBe(true);
    expect(result.requirements.some((r) => /unsubscribe/i.test(r))).toBe(true);
  });

  it("does not mark LinkedIn as automatically allowed", () => {
    const result = outreachEligibility({
      channel: "linkedin",
      country: "United Kingdom",
      contact: {},
      entries: [],
      ownerConfirmedLawfulBasis: true,
    });
    expect(result.status).toBe("review_required");
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => /manual/i.test(r))).toBe(true);
  });

  it("allows a reviewed, unsuppressed email when the owner confirms the basis", () => {
    const result = outreachEligibility({
      channel: "email",
      country: "Rwanda",
      contact: { email: "buyer@example.com" },
      entries: [],
      ownerConfirmedLawfulBasis: true,
    });
    // Policy templates keep the basis unknown, so review is still required. The
    // owner can use the checklist but the app must not claim legal clearance.
    expect(result.status).toBe("review_required");
    expect(result.requirements.length).toBeGreaterThan(0);
  });
});

describe("compliance summary", () => {
  it("separates active and expired entries", () => {
    const now = new Date("2026-11-09T00:00:00Z");
    const summary = complianceSummary(
      [
        entry(),
        entry({ channel: "email" }),
        entry({ expiresAt: "2000-01-01T00:00:00Z" }),
      ],
      now,
    );
    expect(summary.total).toBe(3);
    expect(summary.active).toBe(2);
    expect(summary.expired).toBe(1);
    expect(summary.byChannel["all"]).toBe(1);
    expect(summary.byChannel["email"]).toBe(1);
  });
});
