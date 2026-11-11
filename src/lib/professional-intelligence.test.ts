import { describe, expect, it } from "vitest";
import {
  PROFESSIONAL_STAGES,
  PROFESSIONAL_TYPES,
  normalizeEmail,
  normalizePhone,
  normalizeProfessional,
  normalizeUrl,
  professionalCompleteness,
  professionalCoverage,
  professionalDedupeKey,
  suggestConfidence,
  validateProfessional,
} from "./professional-intelligence";

describe("professional identity normalisation", () => {
  it("normalises emails, phones and URLs conservatively", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizePhone("+250 788 123 456")).toBe("+250788123456");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizeUrl("example.com/team")).toBe("https://example.com/team");
    expect(normalizeUrl("ftp://example.com")).toBeNull();
  });

  it("uses strong identifiers before name-only matching", () => {
    const base = {
      fullName: "Ada Lovelace",
      country: "Rwanda",
      profileUrl: "https://www.linkedin.com/in/ada-lovelace",
      publicEmail: "ada@example.com",
      publicPhone: "+250788123456",
    };
    expect(professionalDedupeKey(base)).toBe("profile:https://www.linkedin.com/in/ada-lovelace");
    expect(professionalDedupeKey({ ...base, profileUrl: null })).toBe("email:ada@example.com");
    expect(professionalDedupeKey({ ...base, profileUrl: null, publicEmail: null })).toBe(
      "phone:+250788123456",
    );
    expect(
      professionalDedupeKey({
        fullName: "Ada Lovelace",
        country: "Rwanda",
        profileUrl: null,
        publicEmail: null,
        publicPhone: null,
      }),
    ).toBe("name:ada-lovelace|country:rwanda");
  });

  it("keeps the same name in different countries separate", () => {
    const a = professionalDedupeKey({ fullName: "John Smith", country: "Kenya" });
    const b = professionalDedupeKey({ fullName: "John Smith", country: "United Kingdom" });
    expect(a).not.toBe(b);
  });
});

describe("professional completeness and confidence", () => {
  it("reports missing fields and a bounded score", () => {
    const result = professionalCompleteness({
      fullName: "Ada Lovelace",
      professionalType: "founder",
      country: "Rwanda",
      publicEmail: "ada@example.com",
      evidence: [{ kind: "public_profile", label: "Public profile" }],
    });
    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThan(100);
    expect(result.missing).toContain("public phone");
  });

  it("raises confidence with independent evidence and owner confirmation", () => {
    const low = suggestConfidence({ fullName: "Ada Lovelace" });
    const observed = suggestConfidence({
      fullName: "Ada Lovelace",
      sourceUrl: "https://example.com/team",
      evidence: [
        { kind: "public_profile", label: "Profile" },
        { kind: "website", label: "Team page" },
      ],
      verificationStatus: "corroborated",
    });
    const confirmed = suggestConfidence({
      fullName: "Ada Lovelace",
      verificationStatus: "owner_confirmed",
    });
    expect(low).toBeLessThan(observed);
    expect(observed).toBeLessThanOrEqual(0.9);
    expect(confirmed).toBe(0.95);
  });

  it("validates bad contact data and warns on unsourced high confidence", () => {
    const bad = validateProfessional({
      fullName: "",
      publicEmail: "nope",
      publicPhone: "12",
      profileUrl: "javascript:alert(1)",
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(3);

    const risky = validateProfessional({
      fullName: "Ada Lovelace",
      confidence: 0.9,
      verificationStatus: "observed",
    });
    expect(risky.valid).toBe(true);
    expect(risky.warnings.some((w) => /high confidence/i.test(w))).toBe(true);
    expect(risky.warnings.some((w) => /no source/i.test(w))).toBe(true);
  });

  it("forces do-not-contact consistency during normalisation", () => {
    const p = normalizeProfessional({
      fullName: "  Ada   Lovelace ",
      relationshipStage: "contacted",
      doNotContact: true,
      languages: ["English", "english", " Kinyarwanda "],
    });
    expect(p.fullName).toBe("Ada Lovelace");
    expect(p.relationshipStage).toBe("do_not_contact");
    expect(p.languages).toEqual(["English", "Kinyarwanda"]);
  });
});

describe("professional coverage", () => {
  it("counts verification, availability, contact coverage and suppression", () => {
    const c = professionalCoverage([
      {
        fullName: "A",
        verificationStatus: "owner_confirmed",
        availabilityStatus: "open",
        publicEmail: "a@example.com",
        profileUrl: "https://example.com/a",
      },
      {
        fullName: "B",
        verificationStatus: "corroborated",
        doNotContact: true,
        publicPhone: "+250788000000",
      },
      { fullName: "C", verificationStatus: "unverified" },
    ]);
    expect(c.total).toBe(3);
    expect(c.verified).toBe(2);
    expect(c.ownerConfirmed).toBe(1);
    expect(c.openToWork).toBe(1);
    expect(c.doNotContact).toBe(1);
    expect(c.withEmail).toBe(1);
    expect(c.withPhone).toBe(1);
    expect(c.withProfile).toBe(1);
  });

  it("exposes stable taxonomies for the UI", () => {
    expect(PROFESSIONAL_TYPES).toContain("founder");
    expect(PROFESSIONAL_STAGES).toContain("do_not_contact");
  });
});
