import { describe, expect, it } from "vitest";
import {
  buildServiceCatalog,
  matchServices,
  PROBLEM_KEYS,
  suggestedBuyerRole,
  type ObservedProblem,
  type ServiceDefinition,
} from "@/lib/service-match";

const NOW = new Date("2026-10-12T00:00:00Z");

function problem(over: Partial<ObservedProblem> = {}): ObservedProblem {
  return {
    key: "no_website",
    label: "No website found",
    evidence: "No domain listed on the map profile",
    source: "google-maps",
    observed_at: "2026-10-01T00:00:00Z",
    confidence: 0.8,
    severity: "high",
    status: "single_source",
    ...over,
  };
}

const CATALOG: ServiceDefinition[] = [
  { offer: "Website Development", addresses: ["no_website"], effort: "medium", recurring: false },
  {
    offer: "Business Automation",
    addresses: ["manual_process"],
    effort: "medium",
    recurring: true,
  },
  { offer: "Custom Software", addresses: ["no_website"], effort: "high", recurring: false },
];

describe("matchServices", () => {
  it("only proposes owner-confirmed services", () => {
    const matches = matchServices([problem()], CATALOG, ["Website Development"], {
      industry: "wholesale_retail",
      size: "small",
      now: NOW,
    });
    expect(matches.map((m) => m.offer)).toEqual(["Website Development"]);
  });

  it("returns nothing when there is no matching problem", () => {
    const matches = matchServices(
      [problem({ key: "something_else" })],
      CATALOG,
      ["Website Development"],
      { industry: "wholesale_retail", size: "small", now: NOW },
    );
    expect(matches).toEqual([]);
  });

  it("marks weak evidence as a hypothesis and caps its confidence", () => {
    const matches = matchServices(
      [problem({ status: "ai_inference", confidence: 0.9 })],
      CATALOG,
      ["Website Development"],
      { industry: "wholesale_retail", size: "small", now: NOW },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.hypothesis).toBe(true);
    expect(matches[0]!.confidence).toBeLessThan(0.6);
  });

  it("explains the match and lists uncertainties", () => {
    const matches = matchServices([problem()], CATALOG, ["Website Development"], {
      industry: "wholesale_retail",
      size: "unknown",
      now: NOW,
    });
    const m = matches[0]!;
    expect(m.observedProblem).toContain("No website");
    expect(m.evidence[0]!.source).toBe("google-maps");
    expect(m.uncertainties.join(" ")).toMatch(/size is unknown/i);
    expect(m.likelyBuyerRole).toMatch(/suggested/i);
  });

  it("flags stale evidence", () => {
    const matches = matchServices(
      [problem({ observed_at: "2024-01-01T00:00:00Z" })],
      CATALOG,
      ["Website Development"],
      { industry: "wholesale_retail", size: "small", now: NOW },
    );
    expect(matches[0]!.uncertainties.join(" ")).toMatch(/stale/i);
  });

  it("ranks stronger matches first and preserves effort/recurring", () => {
    const matches = matchServices(
      [problem()],
      CATALOG,
      ["Website Development", "Custom Software"],
      {
        industry: "wholesale_retail",
        size: "small",
        now: NOW,
      },
    );
    expect(matches).toHaveLength(2);
    expect(matches[0]!.confidence).toBeGreaterThanOrEqual(matches[1]!.confidence);
  });
});

describe("suggestedBuyerRole", () => {
  it("suggests a plausible role but never asserts it", () => {
    expect(suggestedBuyerRole("Website Development")).toMatch(/suggested/i);
    expect(suggestedBuyerRole("Business Automation")).toMatch(/suggested/i);
  });
});

describe("buildServiceCatalog", () => {
  it("maps offer names to addressable problems", () => {
    const catalog = buildServiceCatalog([
      "Website Development",
      "Website Performance Improvement",
      "Business Automation",
    ]);
    const byOffer = new Map(catalog.map((c) => [c.offer, c]));
    expect(byOffer.get("Website Development")!.addresses).toContain(PROBLEM_KEYS.noWebsite);
    expect(byOffer.get("Website Performance Improvement")!.addresses).toEqual([
      PROBLEM_KEYS.slowSite,
      PROBLEM_KEYS.notMobile,
    ]);
    expect(byOffer.get("Business Automation")!.recurring).toBe(true);
  });

  it("skips offers that do not clearly map to a problem", () => {
    const catalog = buildServiceCatalog(["Something Unrelated", ""]);
    expect(catalog).toEqual([]);
  });

  it("only feeds owner-confirmed services into matches", () => {
    const catalog = buildServiceCatalog(["Website Development", "Business Automation"]);
    const matches = matchServices(
      [problem({ key: PROBLEM_KEYS.noWebsite })],
      catalog,
      ["Website Development"],
      { industry: "wholesale_retail", size: "small", now: NOW },
    );
    expect(matches.map((m) => m.offer)).toEqual(["Website Development"]);
  });
});
