import { describe, expect, it } from "vitest";
import {
  buildDensityClusters,
  centerFor,
  haversineKm,
  matchesDistrict,
  monitoringPolicy,
  observableGaps,
  opportunityFor,
  readRadarSettings,
  radarFreshness,
  splitNewAndKnown,
  type RadarBusiness,
  type RadarOpportunity,
} from "@/lib/radar";

const NOW = new Date("2026-10-12T00:00:00Z");

function biz(over: Partial<RadarBusiness> = {}): RadarBusiness {
  return {
    id: "b1",
    name: "Test Co",
    district: "Gasabo",
    province: "Kigali City",
    category: "restaurant",
    website: null,
    phone: null,
    emails: [],
    socials: null,
    latitude: -1.94,
    longitude: 30.06,
    ...over,
  };
}

function gapsOf(b: RadarBusiness, findings = null): string[] {
  return observableGaps(b, findings, "2026-10-01T00:00:00Z", NOW).map((g) => g.key);
}

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(-1.94, 30.06, -1.94, 30.06)).toBe(0);
  });
  it("approximates one degree of latitude", () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 0);
  });
});

describe("readRadarSettings", () => {
  it("returns defaults for junk", () => {
    expect(readRadarSettings(null)).toEqual({
      district: null,
      radiusKm: 5,
      category: "all",
      service: "all",
      monitoring: "manual",
      centerLat: null,
      centerLng: null,
    });
  });
  it("keeps valid values and rejects invalid ones", () => {
    const s = readRadarSettings({
      district: "Gasabo",
      radiusKm: 7,
      category: "nope",
      service: "automation",
      monitoring: "daily",
      centerLat: -1.9,
      centerLng: 30.0,
    });
    expect(s.district).toBe("Gasabo");
    expect(s.radiusKm).toBe(5);
    expect(s.category).toBe("all");
    expect(s.service).toBe("automation");
    expect(s.monitoring).toBe("daily");
    expect(s.centerLat).toBe(-1.9);
  });
});

describe("district matching", () => {
  it("matches by stored district or parsed address", () => {
    expect(matchesDistrict({ district: "gasabo", address: null }, "Gasabo")).toBe(true);
    expect(matchesDistrict({ district: "Musanze", address: null }, "Gasabo")).toBe(false);
    expect(matchesDistrict({ district: null, address: "KG 11 Ave, Gasabo" }, "Gasabo")).toBe(true);
    expect(matchesDistrict({ district: "Musanze", address: null }, null)).toBe(true);
  });
});

describe("centerFor", () => {
  it("prefers an explicit centre", () => {
    expect(centerFor([], { district: null, centerLat: 1, centerLng: 2 })).toEqual({
      lat: 1,
      lng: 2,
    });
  });
  it("averages stored coordinates otherwise", () => {
    const c = centerFor(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 2, longitude: 4 },
      ],
      { district: null, centerLat: null, centerLng: null },
    );
    expect(c).toEqual({ lat: 1, lng: 2 });
  });
  it("returns null without real coordinates", () => {
    expect(
      centerFor([{ latitude: null, longitude: null }], {
        district: null,
        centerLat: null,
        centerLng: null,
      }),
    ).toBeNull();
  });
});

describe("observableGaps", () => {
  it("flags a listing-only no-website lead as unverified", () => {
    const gaps = observableGaps(biz(), null, "2026-10-01T00:00:00Z", NOW);
    const noWebsite = gaps.find((g) => g.key === "no_website");
    expect(noWebsite?.status).toBe("unverified");
    expect(noWebsite?.confidence).toBe(0.6);
    expect(gaps.map((g) => g.key)).toContain("no_digital_profile");
    expect(gaps.map((g) => g.key)).toContain("no_contact_details");
  });
  it("upgrades the no-website gap once double-checked", () => {
    const gaps = observableGaps(
      biz({ website_check: { confidence: "none_found", source: "website-finder" } }),
      null,
      "2026-10-01T00:00:00Z",
      NOW,
    );
    const noWebsite = gaps.find((g) => g.key === "no_website");
    expect(noWebsite?.status).toBe("single_source");
    expect(noWebsite?.confidence).toBe(0.8);
  });
  it("flags closed and dormant businesses", () => {
    expect(gapsOf(biz({ business_status: "CLOSED_PERMANENTLY" }))).toContain("closed_permanently");
    expect(
      gapsOf(biz({ reviews_last_90d: 0, last_activity_at: "2025-01-01T00:00:00Z" })),
    ).toContain("dormant");
  });
});

describe("opportunityFor", () => {
  const settings = readRadarSettings({ district: "Gasabo", radiusKm: 5, category: "all" });

  it("builds an opportunity with priority and an offer match", () => {
    const o = opportunityFor({
      business: biz(),
      findings: null,
      investigationAt: null,
      settings,
      offers: [{ name: "Website development", default_price: 500 }],
      center: { lat: -1.94, lng: 30.06 },
      now: NOW,
    });
    expect(o).not.toBeNull();
    expect(o!.matches[0]?.offer).toBe("Website development");
    expect(o!.priority).toBeGreaterThan(0);
    expect(o!.needsVerification).toBe(true);
    expect(o!.distanceKm).toBeCloseTo(0, 3);
  });

  it("excludes businesses outside the district", () => {
    const o = opportunityFor({
      business: biz({ district: "Musanze" }),
      findings: null,
      investigationAt: null,
      settings,
      offers: [],
      center: null,
      now: NOW,
    });
    expect(o).toBeNull();
  });

  it("excludes businesses outside the radius", () => {
    const o = opportunityFor({
      business: biz({ latitude: 0, longitude: 0 }),
      findings: null,
      investigationAt: null,
      settings,
      offers: [],
      center: { lat: -1.94, lng: 30.06 },
      now: NOW,
    });
    expect(o).toBeNull();
  });

  it("excludes businesses outside the category", () => {
    const o = opportunityFor({
      business: biz({ category: "clinic", industry: "health" }),
      findings: null,
      investigationAt: null,
      settings: readRadarSettings({ district: "Gasabo", category: "retail" }),
      offers: [],
      center: null,
      now: NOW,
    });
    expect(o).toBeNull();
  });
});

describe("buildDensityClusters", () => {
  function opp(id: string): RadarOpportunity {
    return {
      id,
      name: id,
      district: "Gasabo",
      province: "Kigali City",
      industry: "hospitality",
      industryLabel: "Restaurants & hospitality",
      website: null,
      phone: null,
      latitude: null,
      longitude: null,
      distanceKm: null,
      gaps: [
        {
          key: "no_website",
          label: "No website found",
          evidence: "",
          severity: "high",
          confidence: 0.6,
          status: "unverified",
          observedAt: NOW.toISOString(),
          source: "google",
          matchable: true,
        },
      ],
      matches: [],
      priority: 0.5,
      confidence: 0.5,
      needsVerification: true,
      reasons: [],
      observedAt: NOW.toISOString(),
      lastCheckedAt: null,
      inPipeline: false,
    };
  }
  it("groups by district + industry + primary gap and respects minCount", () => {
    expect(buildDensityClusters([opp("a")], 2)).toHaveLength(0);
    const clusters = buildDensityClusters([opp("a"), opp("b"), opp("c")], 2);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(3);
    expect(clusters[0]!.gapKey).toBe("no_website");
  });
});

describe("freshness and monitoring honesty", () => {
  it("labels fresh and stale checks", () => {
    expect(radarFreshness("2026-10-12T00:00:00Z", NOW).state).toBe("fresh");
    expect(radarFreshness("2026-08-01T00:00:00Z", NOW).state).toBe("stale");
  });
  it("never claims real-time", () => {
    for (const m of ["frequent", "daily", "manual"] as const) {
      expect(monitoringPolicy(m).claimsRealtime).toBe(false);
    }
  });
});

describe("splitNewAndKnown", () => {
  it("separates pipeline leads from new ones", () => {
    const known = { inPipeline: true } as RadarOpportunity;
    const fresh = { inPipeline: false } as RadarOpportunity;
    const split = splitNewAndKnown([known, fresh]);
    expect(split.fresh).toEqual([fresh]);
    expect(split.known).toEqual([known]);
  });
});
