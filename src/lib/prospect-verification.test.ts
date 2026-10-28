import { describe, expect, it } from "vitest";
import {
  buildProspectVerification,
  type StoredWebsiteCheck,
  type VerificationBusiness,
  type VerificationFindings,
} from "@/lib/prospect-verification";

const NOW = new Date("2026-10-29T12:00:00.000Z");

function business(overrides: Partial<VerificationBusiness> = {}): VerificationBusiness {
  return {
    name: "Kigali Coffee Ltd",
    category: "Coffee processing",
    address: "Kigali, Rwanda",
    district: "Gasabo",
    phone: "+250 788 123 456",
    place_id: "place_123",
    maps_url: "https://maps.google.com/?cid=123",
    ...overrides,
  };
}

function noneFoundCheck(overrides: Partial<StoredWebsiteCheck> = {}): StoredWebsiteCheck {
  return {
    confidence: "none_found",
    source: null,
    checked_at: "2026-10-28T09:00:00.000Z",
    steps: [
      { step: "Places listing", result: "no website listed" },
      { step: "Fresh place-details lookup", result: "no website" },
      { step: "Checked 8 likely domains", result: "No domain matched the business name" },
      {
        step: "Checked 8 free-hosting / website-builder candidates",
        result: "none matched the business name",
      },
    ],
    ...overrides,
  };
}

function healthyFindings(overrides: Partial<VerificationFindings> = {}): VerificationFindings {
  return {
    url: "https://example.rw",
    reachable: true,
    status: 200,
    load_ms: 900,
    has_viewport_meta: true,
    has_contact_form: true,
    has_email_link: false,
    has_whatsapp_link: false,
    has_online_booking_or_shop: true,
    copyright_year: 2026,
    ...overrides,
  };
}

function build(
  b: VerificationBusiness,
  extra: {
    findings?: VerificationFindings | null;
    websiteCheck?: StoredWebsiteCheck | null;
    socialSearch?: { performed: boolean; found?: string[]; error?: string | null };
  } = {},
) {
  return buildProspectVerification({
    business: b,
    findings: extra.findings ?? null,
    websiteCheck: extra.websiteCheck ?? null,
    observedAt: "2026-10-28T09:00:00.000Z",
    now: NOW,
    ...(extra.socialSearch ? { socialSearch: extra.socialSearch } : {}),
  });
}

describe("prospect verification", () => {
  it("verifies a website on a different-brand domain without inventing identity proof", () => {
    const out = build(
      business({ website: "https://acmeholdings.com", website_source: "google_places" }),
      { findings: healthyFindings({ url: "https://acmeholdings.com" }) },
    );

    expect(out.website_status).toBe("WEBSITE_VERIFIED");
    expect(out.website_status_reason).toMatch(/real probe/i);
    expect(out.online_presence_status).toBe("MULTI_CHANNEL_PRESENCE");
    expect(out.identity_confidence_0_100).toBeGreaterThanOrEqual(70);
  });

  it("accepts a non-.rw / non-.com website for a Rwandan business", () => {
    const out = build(
      business({
        website: "https://kigalicoffee.co.ke",
        website_source: "google_places",
        address: "Kigali, Rwanda",
      }),
      { findings: healthyFindings({ url: "https://kigalicoffee.co.ke" }) },
    );

    expect(out.rwanda_location).toBe("rwanda");
    expect(out.website_status).toBe("WEBSITE_VERIFIED");
    expect(out.website_status_reason).toMatch(/real probe/i);
  });

  it("verifies a free-hosted website and does not treat it as no website", () => {
    const out = build(
      business({
        website: "https://kigalicoffee.wixsite.com/home",
        website_source: "domain_match",
      }),
      { findings: healthyFindings({ url: "https://kigalicoffee.wixsite.com/home" }) },
    );

    expect(out.website_status).toBe("WEBSITE_VERIFIED");
    expect(out.website_status).not.toBe("NO_WEBSITE_FOUND_HIGH_COVERAGE");
    expect(out.commercial_priority).toBe("B");
    expect(out.uncertainties.join(" ")).toMatch(/confirm it belongs/i);
  });

  it("classifies a social-only business as social/marketplace presence", () => {
    const out = build(
      business({
        socials: { facebook: "https://facebook.com/kigalicoffee" },
      }),
      {
        websiteCheck: noneFoundCheck(),
        socialSearch: { performed: true, found: ["Facebook"] },
      },
    );

    expect(out.website_status).toBe("NO_WEBSITE_FOUND_HIGH_COVERAGE");
    expect(out.online_presence_status).toBe("SOCIAL_OR_MARKETPLACE_ONLY");
    expect(out.checks_performed.join(" ")).toMatch(/social platform search/i);
  });

  it("keeps a parent-company website as a B priority for the local factory", () => {
    const out = build(
      business({
        website: "https://parentgroup.com",
        website_source: "google_places",
        parent_organization: "Parent Group",
        category: "Coffee processing factory",
      }),
      {
        findings: healthyFindings({
          url: "https://parentgroup.com",
          has_contact_form: true,
          has_online_booking_or_shop: true,
        }),
      },
    );

    expect(out.website_status).toBe("WEBSITE_VERIFIED");
    expect(out.commercial_priority).toBe("B");
    expect(out.priority_reasons.join(" ")).toMatch(/parent organisation/i);
  });

  it("excludes a same-name foreign company from the Rwanda priority list", () => {
    const out = build(
      business({
        address: "Nairobi, Kenya",
        district: null,
        phone: "+254 712 345 678",
      }),
      {
        websiteCheck: noneFoundCheck(),
        socialSearch: { performed: true, found: [] },
      },
    );

    expect(out.rwanda_location).toBe("other");
    expect(out.commercial_priority).toBe("C");
    expect(out.next_verification_step).toMatch(/actually in Rwanda/i);
  });

  it("marks parked and unreachable domains as broken or inactive", () => {
    const parked = build(
      business({ website: "https://kigalicoffee.rw", website_source: "google_places" }),
      {
        findings: healthyFindings({
          url: "https://kigalicoffee.rw",
          parked: true,
          reachable: true,
        }),
      },
    );
    const unreachable = build(
      business({ website: "https://kigalicoffee.rw", website_source: "google_places" }),
      {
        findings: healthyFindings({
          url: "https://kigalicoffee.rw",
          reachable: false,
          status: 503,
        }),
      },
    );

    expect(parked.website_status).toBe("WEBSITE_BROKEN_OR_INACTIVE");
    expect(unreachable.website_status).toBe("WEBSITE_BROKEN_OR_INACTIVE");
    expect(parked.online_presence_status).not.toBe("MULTI_CHANNEL_PRESENCE");
    expect(unreachable.online_presence_status).not.toBe("MULTI_CHANNEL_PRESENCE");
    expect(unreachable.digital_gap.map((g) => g.key)).toContain("broken_website");
  });

  it("never turns a truncated search into a confirmed no-website result", () => {
    const out = build(business(), {
      websiteCheck: noneFoundCheck({ truncated: true }),
    });

    expect(out.website_status).toBe("POSSIBLE_HIDDEN_WEBSITE");
    expect(out.website_status).not.toBe("NO_WEBSITE_FOUND_HIGH_COVERAGE");
    expect(out.next_verification_step).toMatch(/longer website double-check/i);
    expect(out.uncertainties.join(" ")).toMatch(/could not be ruled out/i);
  });

  it("prioritises a genuine factory with direct contact and a weak verified website", () => {
    const out = build(
      business({
        website: "https://kigalicoffee.rw",
        website_source: "google_places",
        category: "Coffee processing factory",
        industry: "manufacturing",
        last_activity_at: "2026-10-01T00:00:00.000Z",
        reviews_last_90d: 6,
        open_now: true,
      }),
      {
        findings: healthyFindings({
          url: "https://kigalicoffee.rw",
          load_ms: 1200,
          has_viewport_meta: false,
          has_contact_form: false,
          has_email_link: false,
          has_whatsapp_link: false,
          has_online_booking_or_shop: false,
          copyright_year: 2019,
        }),
      },
    );

    expect(out.website_status).toBe("WEBSITE_VERIFIED");
    expect(out.manufacturing_evidence.status).toBe("supported");
    expect(out.operating_status).toBe("operating_evidence");
    expect(out.digital_gap.map((g) => g.key)).toEqual(
      expect.arrayContaining(["not_mobile", "outdated_content", "no_contact_channel"]),
    );
    expect(out.commercial_priority).toBe("A");
  });

  it("labels unperformed checks honestly and records no fabricated gaps", () => {
    const out = build(business());

    expect(out.website_status).toBe("NOT_CHECKED");
    expect(out.online_presence_status).toBe("LIMITED_PRESENCE_FOUND");
    expect(out.digital_gap).toEqual([]);
    expect(out.checks_failed).toEqual([]);
    expect(out.checks_not_performed.join(" ")).toMatch(/social platform search/i);
    expect(out.checks_not_performed.join(" ")).toMatch(/registration/i);
    expect(out.evidence_log.some((e) => e.check_id === "social_platforms")).toBe(false);
    expect(out.evidence_log.some((e) => e.check_id === "places_listing")).toBe(true);
  });
});
