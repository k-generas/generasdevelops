import { describe, expect, it } from "vitest";
import {
  analyzeSocialLeadAgainstBusinesses,
  classifySocialAccount,
  findOpportunityGaps,
  matchSolutions,
  type SocialMatchBusiness,
  type SocialMatchLead,
} from "./social-business-match";

const NOW = new Date("2026-11-05T10:00:00.000Z");

function business(over: Partial<SocialMatchBusiness> = {}): SocialMatchBusiness {
  return {
    id: "biz-1",
    name: "Kigali Fashion Boutique",
    phone: "+250 788 123 456",
    website: "https://www.kigalifashion.rw",
    district: "Gasabo",
    province: "Kigali City",
    place_id: "ChIJ123",
    maps_url: "https://maps.google.com/?cid=123",
    source: "google_places",
    ...over,
  };
}

function lead(over: Partial<SocialMatchLead> = {}): SocialMatchLead {
  return {
    id: "lead-1",
    platform: "instagram",
    handle: "kigalifashionboutique",
    profile_url: "https://instagram.com/kigalifashionboutique",
    display_name: "Kigali Fashion Boutique",
    biography: "Dresses and kitenge. Order on WhatsApp 0788 123 456.",
    category: "Fashion & apparel",
    district: "Gasabo",
    website: "https://kigalifashion.rw",
    website_status: "live",
    store_status: "none",
    contact_phone: "+250788123456",
    contact_whatsapp: "https://wa.me/250788123456",
    source: "instagram_api",
    last_checked_at: "2026-11-04T09:00:00.000Z",
    ...over,
  };
}

describe("social account classification", () => {
  it("classifies a seller profile without business wording as an individual seller", () => {
    const result = classifySocialAccount(
      lead({
        display_name: "Aline",
        biography: "I sell handmade bags. DM to order.",
        category: null,
        website: null,
      }),
      NOW,
    );
    expect(result.type).toBe("individual_seller");
    expect(result.reasons.join(" ")).toMatch(/selling|individual/i);
  });

  it("classifies business wording plus category as a probable business", () => {
    const result = classifySocialAccount(lead(), NOW);
    expect(result.type).toBe("probable_business");
    expect(result.confidence).toBeGreaterThan(0.55);
  });

  it("leaves an empty profile unknown rather than guessing", () => {
    const result = classifySocialAccount(
      lead({ display_name: "xyz", biography: null, category: null, website: null }),
      NOW,
    );
    expect(result.type).toBe("unknown");
    expect(result.reasons.join(" ")).toMatch(/not contain enough/i);
  });
});

describe("social-to-business matching", () => {
  it("marks a phone, domain, name and district match as high confidence and auto-links it", () => {
    const result = analyzeSocialLeadAgainstBusinesses(lead(), [business()], NOW);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.status).toBe("high_confidence");
    expect(result.candidates[0]?.signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(["phone", "domain", "name", "location"]),
    );
    expect(result.auto_link_business_id).toBe("biz-1");
    expect(result.account.type).toBe("confirmed_business");
  });

  it("matches on a domain plus strong name when no phone is recorded", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({ contact_phone: null, contact_whatsapp: null, biography: "Dresses and kitenge." }),
      [business()],
      NOW,
    );
    expect(result.candidates[0]?.status).toBe("high_confidence");
    expect(result.candidates[0]?.signals.map((signal) => signal.kind)).toContain("domain");
  });

  it("does not confirm a name-only match without a location signal", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({
        contact_phone: null,
        contact_whatsapp: null,
        website: null,
        website_status: "unknown",
        district: null,
        biography: "Dresses and kitenge.",
      }),
      [business({ phone: null, website: null })],
      NOW,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("does not confirm similar names in different districts without contact evidence", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({
        contact_phone: null,
        contact_whatsapp: null,
        website: null,
        website_status: "unknown",
        district: "Huye",
      }),
      [business({ phone: null, website: null, district: "Gasabo" })],
      NOW,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("preserves a conflicting phone match instead of silently merging it", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({
        display_name: "Aline's Handmade Bags",
        handle: "alinesbags",
        contact_phone: "+250788123456",
        contact_whatsapp: null,
        website: null,
        website_status: "none",
        district: null,
      }),
      [business({ website: null })],
      NOW,
    );
    expect(result.candidates[0]?.status).toBe("conflicting");
    expect(result.candidates[0]?.reason).toMatch(/Conflicting evidence/i);
    expect(result.auto_link_business_id).toBeNull();
  });

  it("keeps a phone-only match as possible, not high confidence", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({
        display_name: "Kigali Fashion",
        handle: "kigalifashion",
        website: null,
        website_status: "none",
        district: null,
        biography: "Order by WhatsApp.",
      }),
      [business({ website: null })],
      NOW,
    );
    expect(result.candidates[0]?.status).toBe("possible");
    expect(result.auto_link_business_id).toBeNull();
  });

  it("does not auto-link when more than one business is a high-confidence candidate", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead(),
      [business(), business({ id: "biz-2" })],
      NOW,
    );
    expect(
      result.candidates.filter((candidate) => candidate.status === "high_confidence"),
    ).toHaveLength(2);
    expect(result.auto_link_business_id).toBeNull();
  });

  it("ignores shared link-hub and social domains", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({
        contact_phone: null,
        contact_whatsapp: null,
        website: "https://linktr.ee/kigalifashion",
        website_status: "link_hub",
        biography: "Dresses and kitenge.",
      }),
      [business({ website: "https://linktr.ee/kigalifashion", phone: null })],
      NOW,
    );
    expect(result.candidates[0]?.status).not.toBe("high_confidence");
    expect(result.candidates[0]?.signals.map((signal) => signal.kind)).not.toContain("domain");
  });

  it("normalizes Rwandan phone formats and WhatsApp links", () => {
    const result = analyzeSocialLeadAgainstBusinesses(
      lead({
        contact_phone: null,
        contact_whatsapp: "https://wa.me/250788123456",
        display_name: "Different Name",
        handle: "differentname",
        website: null,
        website_status: "unknown",
        district: null,
      }),
      [business({ website: null })],
      NOW,
    );
    expect(result.candidates[0]?.signals.map((signal) => signal.kind)).toContain("phone");
  });
});

describe("opportunity gaps and solution fitting", () => {
  it("records website, store and contact gaps with evidence dates", () => {
    const gaps = findOpportunityGaps(
      lead({
        website: null,
        website_status: "none",
        store_status: "whatsapp_only",
        contact_phone: null,
        contact_whatsapp: null,
        biography: "DM to order",
      }),
      business({ website: null }),
      NOW,
    );
    expect(gaps.map((gap) => gap.key)).toEqual(
      expect.arrayContaining(["no_website", "store_whatsapp_only"]),
    );
    expect(gaps.every((gap) => gap.last_checked_at === "2026-11-04T09:00:00.000Z")).toBe(true);
    expect(gaps.every((gap) => gap.verification_status === "single_source")).toBe(true);
  });

  it("marks manual imports as unverified gaps", () => {
    const gaps = findOpportunityGaps(
      lead({ source: "manual_import", website: null, website_status: "none" }),
      business(),
      NOW,
    );
    expect(gaps[0]?.verification_status).toBe("unverified");
  });

  it("returns no gaps for a live website and a live store", () => {
    const gaps = findOpportunityGaps(
      lead({ website_status: "live", store_status: "live_store", contact_phone: "+250788123456" }),
      business(),
      NOW,
    );
    expect(gaps).toHaveLength(0);
    expect(matchSolutions(gaps)).toHaveLength(0);
  });

  it("recommends multiple solution families with explicit uncertainty", () => {
    const gaps = findOpportunityGaps(
      lead({ website: null, website_status: "none", store_status: "whatsapp_only" }),
      business({ website: null }),
      NOW,
    );
    const solutions = matchSolutions(gaps);
    expect(solutions.map((solution) => solution.solution)).toEqual(
      expect.arrayContaining(["DukaLinka", "GENERAS Digital", "GENERAS Systems"]),
    );
    expect(solutions.every((solution) => solution.uncertainties.length > 0)).toBe(true);
  });

  it("treats link hubs as a digital-presence gap rather than a website", () => {
    const gaps = findOpportunityGaps(
      lead({
        website: "https://linktr.ee/shop",
        website_status: "link_hub",
        store_status: "link_hub",
      }),
      business({ website: null }),
      NOW,
    );
    expect(gaps.map((gap) => gap.key)).toEqual(
      expect.arrayContaining(["link_hub_only", "store_link_hub"]),
    );
  });
});
