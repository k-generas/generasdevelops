import { describe, expect, it } from "vitest";
import {
  deliverableTaskTitle,
  kitScopeSummary,
  kitTaskKey,
  normalizeKit,
  problemKeysForOffer,
  resolveKit,
  suggestKit,
  type OfferKit,
} from "./offer-kit";

describe("suggestKit", () => {
  it("gives website offers a design/build checklist and non-recurring terms", () => {
    const kit = suggestKit("Website Redesign");
    expect(kit.offer).toBe("Website Redesign");
    expect(kit.deliverables.length).toBeGreaterThan(0);
    expect(kit.recurring).toBe(false);
    expect(kit.depositPercent).toBe(50);
  });

  it("treats automation offers as recurring engagements", () => {
    const kit = suggestKit("Business Automation");
    expect(kit.recurring).toBe(true);
    expect(kit.deliverables.some((d) => /train/i.test(d))).toBe(true);
  });

  it("falls back to an empty, generic starter for an unknown offer", () => {
    const kit = suggestKit("Mystery Service");
    expect(kit.scopeIncludes).toEqual([]);
    expect(kit.deliverables).toEqual([]);
    expect(kit.active).toBe(true);
  });
});

describe("problemKeysForOffer", () => {
  it("maps an offer to the observable problems it addresses", () => {
    expect(problemKeysForOffer("Website Development")).toContain("no_website");
  });

  it("returns nothing for an offer with no clear problem match", () => {
    expect(problemKeysForOffer("Mystery Service")).toEqual([]);
  });
});

describe("kitScopeSummary", () => {
  it("states includes, excludes and terms honestly", () => {
    const kit = suggestKit("Website Development");
    const text = kitScopeSummary(kit);
    expect(text).toContain("Included:");
    expect(text).toContain("Not included:");
    expect(text).toMatch(/Timeline: about \d+ days/);
  });

  it("is empty when the kit has no scope", () => {
    expect(
      kitScopeSummary({
        offer: "Bare",
        scopeIncludes: [],
        scopeExcludes: [],
        deliverables: [],
        timelineDays: null,
        revisions: null,
        depositPercent: null,
        recurring: false,
        notes: null,
        active: true,
      }),
    ).toBe("");
  });
});

describe("task helpers", () => {
  it("builds a stable per-business dedupe key", () => {
    const a = kitTaskKey("Website Development", "Discovery call", 0, "b1");
    const b = kitTaskKey("Website Development", "Discovery call", 0, "b1");
    const c = kitTaskKey("Website Development", "Discovery call", 0, "b2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("prefixes the task title with the offer", () => {
    expect(deliverableTaskTitle("SEO", "Keyword research")).toBe("SEO: Keyword research");
  });
});

describe("normalizeKit", () => {
  it("drops junk list entries and coerces numbers", () => {
    const kit = normalizeKit({
      offer: "  SEO  ",
      scopeIncludes: ["Audit", "", "  ", 5 as unknown as string],
      timelineDays: "10",
      revisions: undefined,
      depositPercent: null,
    } as unknown as Partial<OfferKit> & { offer: string });
    expect(kit.offer).toBe("SEO");
    expect(kit.scopeIncludes).toEqual(["Audit", "5"]);
    expect(kit.timelineDays).toBe(10);
    expect(kit.revisions).toBeNull();
    expect(kit.active).toBe(true);
  });
});

describe("resolveKit", () => {
  it("prefers a stored kit over the suggested one", () => {
    const stored: OfferKit = {
      ...suggestKit("Website Development"),
      id: "k1",
      deliverables: ["Custom"],
    };
    expect(resolveKit("Website Development", [stored]).deliverables).toEqual(["Custom"]);
  });

  it("falls back to the suggested starter when nothing is stored", () => {
    const kit = resolveKit("Website Development", []);
    expect(kit.id).toBeNull();
    expect(kit.deliverables.length).toBeGreaterThan(0);
  });
});
