import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSocialProfileUrl, type ParsedSocialProfile } from "@/lib/social-profiles";
import { probeSocialProfile, scanSocialProfiles } from "@/lib/social-scan.server";

function parsed(value: string): ParsedSocialProfile {
  const result = parseSocialProfileUrl(value);
  if (!result.ok) throw new Error(result.error);
  return result.profile;
}

function response(status: number, body = "", contentType = "text/html") {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    headers: new Headers({ "content-type": contentType }),
    text: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public social profile probe", () => {
  it("confirms a readable public profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          200,
          `<title>Kigali Coffee (@kigalicoffee) • Instagram</title>
           <meta property="og:description" content="Coffee roasters in Kigali." />`,
        ),
      ),
    );

    const result = await probeSocialProfile(parsed("https://instagram.com/kigalicoffee"));
    expect(result.status).toBe("confirmed");
    expect(result.verifiedAt).toEqual(expect.any(String));
    expect(result.excerpt).toMatch(/Kigali Coffee/);
  });

  it("records login walls as blocked, not missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(200, "<title>Login • Instagram</title><p>Log in to Instagram to continue.</p>"),
      ),
    );

    const result = await probeSocialProfile(parsed("https://instagram.com/kigalicoffee"));
    expect(result.status).toBe("blocked");
    expect(result.verifiedAt).toBeNull();
  });

  it("records denied access and missing pages honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(403, "Forbidden")),
    );
    expect((await probeSocialProfile(parsed("https://facebook.com/kigalicoffee"))).status).toBe(
      "blocked",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(404, "Not found")),
    );
    expect((await probeSocialProfile(parsed("https://facebook.com/kigalicoffee"))).status).toBe(
      "inaccessible",
    );
  });

  it("does not treat a bare 200 response as a confirmed profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(200, "<html><body>hello</body></html>")),
    );
    const result = await probeSocialProfile(parsed("https://instagram.com/kigalicoffee"));
    expect(result.status).toBe("unverified");
    expect(result.verifiedAt).toBeNull();
  });

  it("records network failures as inaccessible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await probeSocialProfile(parsed("https://instagram.com/kigalicoffee"));
    expect(result.status).toBe("inaccessible");
    expect(result.excerpt).toMatch(/network down/);
  });
});

describe("bounded social profile scan", () => {
  it("dedupes profiles and checks at most eight", async () => {
    const fetchMock = vi.fn(async () =>
      response(200, '<title>Business profile</title><meta name="description" content="Shop" />'),
    );
    vi.stubGlobal("fetch", fetchMock);

    const profiles = Array.from({ length: 10 }, (_, index) =>
      parsed(`https://instagram.com/business${index}`),
    );
    const scan = await scanSocialProfiles([...profiles, profiles[0]!]);

    expect(scan.skipped).toBe(2);
    expect(scan.results).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
