import { describe, expect, it } from "vitest";
import { assessWebsite, type WebsiteProbe } from "./website-opportunity";

const NOW = new Date("2026-11-08T09:00:00.000Z");

function probe(over: Partial<WebsiteProbe> = {}): WebsiteProbe {
  return {
    url: "https://example.com",
    reachable: true,
    status: 200,
    https: true,
    load_ms: 1200,
    has_viewport_meta: true,
    has_contact_form: true,
    has_email_link: true,
    has_whatsapp_link: false,
    has_online_booking_or_shop: false,
    copyright_year: 2026,
    title: "Example",
    error: null,
    checked_at: NOW.toISOString(),
    ...over,
  };
}

describe("assessWebsite", () => {
  it("qualifies a business with no website", () => {
    const result = assessWebsite({ website: null }, NOW);
    expect(result.state).toBe("no_website");
    expect(result.qualified).toBe(true);
    expect(result.needs[0]?.service).toBe("Website Development");
  });

  it("qualifies a confirmed no-website business as double-checked", () => {
    const result = assessWebsite(
      { website: null, websiteCheck: { confidence: "none_found" } },
      NOW,
    );
    expect(result.needs[0]?.evidence).toContain("double-checked");
  });

  it("keeps an unchecked website out of focus until it is probed", () => {
    const result = assessWebsite({ website: "https://example.com" }, NOW);
    expect(result.state).toBe("unchecked");
    expect(result.qualified).toBe(false);
  });

  it("qualifies an unreachable website", () => {
    const result = assessWebsite(
      {
        website: "https://example.com",
        websiteProbe: probe({ reachable: false, status: 404, https: null }),
      },
      NOW,
    );
    expect(result.state).toBe("needs_work");
    expect(result.qualified).toBe(true);
    expect(result.needs.map((need) => need.key)).toEqual(["site_unreachable"]);
    expect(result.needs[0]?.service).toBe("Website Repair");
  });

  it("qualifies a site without HTTPS", () => {
    const result = assessWebsite(
      { website: "http://example.com", websiteProbe: probe({ https: false }) },
      NOW,
    );
    expect(result.needs.map((need) => need.key)).toContain("no_https");
  });

  it("qualifies a slow site with the performance service", () => {
    const result = assessWebsite(
      { website: "https://example.com", websiteProbe: probe({ load_ms: 5200 }) },
      NOW,
    );
    expect(result.state).toBe("needs_work");
    expect(result.needs.find((need) => need.key === "slow_site")?.service).toBe(
      "Website Performance Improvement",
    );
  });

  it("qualifies a site that is not mobile-ready", () => {
    const result = assessWebsite(
      { website: "https://example.com", websiteProbe: probe({ has_viewport_meta: false }) },
      NOW,
    );
    expect(result.needs.find((need) => need.key === "not_mobile")?.service).toBe(
      "Website Redesign",
    );
  });

  it("qualifies an outdated site for maintenance", () => {
    const result = assessWebsite(
      { website: "https://example.com", websiteProbe: probe({ copyright_year: 2021 }) },
      NOW,
    );
    expect(result.needs.find((need) => need.key === "outdated_site")?.service).toBe(
      "Website Maintenance",
    );
  });

  it("does not treat a phone-only contact path as a site problem", () => {
    const result = assessWebsite(
      {
        website: "https://example.com",
        websiteProbe: probe({
          has_contact_form: false,
          has_email_link: false,
          has_whatsapp_link: false,
        }),
      },
      NOW,
    );
    expect(result.state).toBe("healthy");
  });

  it("does not qualify a site that blocks the automated check", () => {
    const result = assessWebsite(
      {
        website: "https://example.com",
        websiteProbe: probe({ reachable: false, status: 403 }),
      },
      NOW,
    );
    expect(result.state).toBe("unchecked");
    expect(result.qualified).toBe(false);
  });

  it("keeps a healthy website out of focus", () => {
    const result = assessWebsite({ website: "https://example.com", websiteProbe: probe() }, NOW);
    expect(result.state).toBe("healthy");
    expect(result.qualified).toBe(false);
    expect(result.headline).toBe("Website healthy");
  });
});
