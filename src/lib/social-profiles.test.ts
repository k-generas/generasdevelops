import { describe, expect, it } from "vitest";
import {
  extractPublicMetadata,
  hasUsableMetadata,
  isLoginWall,
  mergePrimarySocialMap,
  parseSocialProfileUrl,
  removeSocialUrl,
  socialSearchFromProfiles,
  type SocialProfile,
} from "@/lib/social-profiles";

function parsed(value: string) {
  const result = parseSocialProfileUrl(value);
  if (!result.ok) throw new Error(result.error);
  return result.profile;
}

function profile(overrides: Partial<SocialProfile> = {}): SocialProfile {
  const base = parsed("https://instagram.com/kigalicoffee");
  return {
    ...base,
    status: "confirmed",
    method: "website_link",
    confidence: 0.8,
    excerpt: null,
    firstSeenAt: "2026-11-01T00:00:00.000Z",
    lastCheckedAt: "2026-11-01T00:00:00.000Z",
    lastVerifiedAt: "2026-11-01T00:00:00.000Z",
    persisted: true,
    ...overrides,
  };
}

describe("social profile parsing", () => {
  it("normalizes Instagram profile URLs and removes tracking", () => {
    const result = parseSocialProfileUrl("instagram.com/kigalicoffee/?utm_source=test#top");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.url).toBe("https://www.instagram.com/kigalicoffee/");
    expect(result.profile.handle).toBe("kigalicoffee");
    expect(result.profile.sourceId).toBe("social:instagram:kigalicoffee");
  });

  it("keeps Facebook numeric profile ids usable", () => {
    const result = parseSocialProfileUrl("https://facebook.com/profile.php?id=12345");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.url).toBe("https://www.facebook.com/profile.php?id=12345");
    expect(result.profile.sourceId).toBe("social:facebook:profile.php-id-12345");
  });

  it("accepts LinkedIn, TikTok and WhatsApp profile URLs", () => {
    expect(parsed("https://www.linkedin.com/company/kigali-coffee/").platform).toBe("linkedin");
    expect(parsed("https://www.tiktok.com/@kigalicoffee").handle).toBe("kigalicoffee");
    expect(parsed("https://wa.me/250788123456").handle).toBe("250788123456");
  });

  it("rejects posts, videos and unsupported hosts", () => {
    expect(parseSocialProfileUrl("https://instagram.com/p/abc123").ok).toBe(false);
    expect(parseSocialProfileUrl("https://youtu.be/abc123").ok).toBe(false);
    expect(parseSocialProfileUrl("https://example.com/business").ok).toBe(false);
  });
});

describe("social profile metadata", () => {
  it("extracts Open Graph metadata from public HTML", () => {
    const metadata = extractPublicMetadata(`
      <html>
        <head>
          <title>Fallback title</title>
          <meta content="Kigali Coffee (@kigalicoffee) • Instagram" property="og:title" />
          <meta property="og:description" content="Coffee roasters in Kigali." />
          <meta property="og:site_name" content="Instagram" />
        </head>
      </html>
    `);
    expect(metadata.title).toBe("Kigali Coffee (@kigalicoffee) • Instagram");
    expect(metadata.description).toBe("Coffee roasters in Kigali.");
    expect(metadata.siteName).toBe("Instagram");
    expect(hasUsableMetadata(metadata)).toBe(true);
  });

  it("detects login walls without treating a normal profile as blocked", () => {
    expect(isLoginWall("<p>Log in to Instagram to continue.</p>")).toBe(true);
    expect(
      isLoginWall(
        '<meta property="og:title" content="Kigali Coffee (@kigalicoffee) • Instagram" />',
      ),
    ).toBe(false);
  });
});

describe("social profile state", () => {
  it("does not call a manual, unchecked profile a performed search", () => {
    expect(socialSearchFromProfiles([profile({ status: "unverified" })])).toBeUndefined();
    expect(socialSearchFromProfiles([profile({ status: "blocked" })])).toEqual({
      performed: true,
      found: ["Instagram (kigalicoffee)"],
    });
  });

  it("preserves other primary socials and lets a confirmed profile win", () => {
    const next = mergePrimarySocialMap({ facebook: "https://facebook.com/old-page" }, [
      profile({ status: "unverified", url: "https://instagram.com/new" }),
      profile({
        status: "confirmed",
        url: "https://instagram.com/confirmed",
        platformLabel: "Instagram",
      }),
    ]);
    expect(next["facebook"]).toBe("https://facebook.com/old-page");
    expect(next["instagram"]).toBe("https://instagram.com/confirmed");
  });

  it("removes only the matching saved social URL", () => {
    const next = removeSocialUrl(
      {
        instagram: "https://instagram.com/kigalicoffee",
        facebook: "https://facebook.com/kigalicoffee",
      },
      "social:instagram:kigalicoffee",
      "https://instagram.com/kigalicoffee",
    );
    expect(next["instagram"]).toBeUndefined();
    expect(next["facebook"]).toBe("https://facebook.com/kigalicoffee");
  });
});
