import { describe, expect, it } from "vitest";
import {
  buildSocialLeadNeeds,
  extractPhone,
  inferCategory,
  inferDistrict,
  isLinkHub,
  isWhatsAppLink,
  parseSocialLeadInput,
  scoreSocialLead,
  splitSocialLeadInputs,
} from "./social-leads";

describe("social lead input", () => {
  it("parses instagram URLs, bare handles and facebook pages", () => {
    expect(parseSocialLeadInput("https://instagram.com/KigaliShop/")).toMatchObject({
      ok: true,
      platform: "instagram",
      handle: "kigalishop",
    });
    expect(parseSocialLeadInput("@KigaliShop")).toMatchObject({
      ok: true,
      platform: "instagram",
      handle: "kigalishop",
    });
    expect(parseSocialLeadInput("https://facebook.com/KigaliShop")).toMatchObject({
      ok: true,
      platform: "facebook",
    });
  });

  it("rejects unsupported or post URLs", () => {
    expect(parseSocialLeadInput("https://instagram.com/p/abc").ok).toBe(false);
    expect(parseSocialLeadInput("https://tiktok.com/@shop").ok).toBe(false);
  });

  it("splits and dedupes imports while capping at 20", () => {
    expect(splitSocialLeadInputs("@a\n@b, @a")).toEqual(["@a", "@b"]);
    expect(
      splitSocialLeadInputs(Array.from({ length: 30 }, (_, i) => `@shop${i}`).join("\n")),
    ).toHaveLength(20);
  });
});

describe("social lead classification", () => {
  it("detects WhatsApp and link hubs", () => {
    expect(isWhatsAppLink("https://wa.me/250788123456")).toBe(true);
    expect(isLinkHub("https://linktr.ee/kigalishop")).toBe(true);
  });

  it("extracts Rwandan phone numbers", () => {
    expect(extractPhone("Order on 0788 123 456")).toBe("+250788123456");
    expect(extractPhone("+250 788 123 456")).toBe("+250788123456");
  });

  it("infers category and district", () => {
    expect(inferCategory("Custom dresses and kitenge fashion")).toBe("Fashion & apparel");
    expect(inferDistrict("We deliver around Kicukiro")).toBe("Kicukiro");
  });
});

describe("social lead scoring", () => {
  it("scores an active, contactable no-store seller highly", () => {
    const result = scoreSocialLead({
      followersCount: 12_000,
      mediaCount: 200,
      lastPostAt: new Date().toISOString(),
      engagementRate: 4,
      websiteStatus: "none",
      storeStatus: "none",
      hasContact: true,
      district: "Gasabo",
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.factors.opportunity).toBe(25);
  });

  it("marks stale profiles and live stores as weaker fits", () => {
    const result = scoreSocialLead({
      followersCount: 300,
      mediaCount: 10,
      lastPostAt: "2020-01-01T00:00:00.000Z",
      engagementRate: 0,
      websiteStatus: "live",
      storeStatus: "live_store",
      hasContact: false,
      district: null,
    });
    expect(result.score).toBeLessThan(30);
    expect(result.factors.activity).toBe(0);
    expect(result.factors.opportunity).toBe(0);
  });

  it("builds specific DUKALINKA needs from observed gaps", () => {
    const needs = buildSocialLeadNeeds({
      websiteStatus: "none",
      storeStatus: "none",
      lastPostAt: "2020-01-01T00:00:00.000Z",
      followersCount: 5000,
      hasContact: false,
      district: null,
      biography: null,
    });
    expect(needs).toContain("No website found — needs an online store");
    expect(needs).toContain("Visible demand but no owned sales channel");
    expect(needs).toContain("Posting is stale — needs consistent product activity");
  });
});
