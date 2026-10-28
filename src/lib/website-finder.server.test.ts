import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyWebsite } from "@/lib/website-finder.server";

function response(ok: boolean, body = "") {
  return {
    ok,
    text: async () => body,
    json: async () => ({}),
  } as Response;
}

function clearProviderEnv() {
  vi.stubEnv("LOVABLE_API_KEY", "");
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
  vi.stubEnv("GEOAPIFY_API_KEY", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("website finder", () => {
  it("checks aliases and free-hosting candidates with structured evidence", async () => {
    clearProviderEnv();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url === "https://roasters.wordpress.com") {
          return response(true, "<html><body>KC Roasters coffee in Kigali</body></html>");
        }
        return response(false);
      }),
    );

    const check = await verifyWebsite(
      {
        place_id: "place_1",
        name: "Kigali Coffee Ltd",
        address: "Kigali, Rwanda",
        website: null,
        aliases: ["KC Roasters"],
      },
      { maxDomainCandidates: 2, maxFreeHostingCandidates: 4, perRequestMs: 100 },
    );

    expect(check.website).toBe("https://roasters.wordpress.com");
    expect(check.source).toBe("free_hosting");
    expect(check.confidence).toBe("likely");
    expect(check.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "place_details", status: "not_performed" }),
        expect.objectContaining({ id: "domain_candidates", status: "negative" }),
        expect.objectContaining({ id: "free_hosting", status: "positive" }),
      ]),
    );
    expect(check.candidates_tested).toBeGreaterThan(0);
    expect(check.checked_at).toEqual(expect.any(String));
    expect(calls).toContain("https://roasters.wordpress.com");
  });

  it("stops honestly when the deadline has already passed", async () => {
    clearProviderEnv();
    const fetchMock = vi.fn(async () => response(false));
    vi.stubGlobal("fetch", fetchMock);

    const check = await verifyWebsite(
      {
        place_id: "place_1",
        name: "Kigali Coffee Ltd",
        address: "Kigali, Rwanda",
        website: null,
      },
      { deadlineMs: Date.now() - 1 },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(check.website).toBeNull();
    expect(check.confidence).toBe("none_found");
    expect(check.truncated).toBe(true);
    expect(check.candidates_tested).toBe(0);
    expect(check.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "domain_candidates", status: "truncated" }),
        expect.objectContaining({ id: "free_hosting", status: "not_performed" }),
      ]),
    );
    expect(check.steps.map((s) => s.step)).toContain("Free-hosting / website-builder candidates");
  });

  it("keeps free-hosting probing within the configured cap", async () => {
    clearProviderEnv();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(typeof input === "string" ? input : input.toString());
        return response(false);
      }),
    );

    const check = await verifyWebsite(
      {
        place_id: "place_1",
        name: "Kigali Coffee Ltd",
        address: "Kigali, Rwanda",
        website: null,
      },
      {
        maxDomainCandidates: 1,
        maxFreeHostingCandidates: 2,
        perRequestMs: 100,
      },
    );

    const freeHostCalls = calls.filter((u) => /wixsite|wordpress|blogspot|business\.site/i.test(u));
    expect(new Set(freeHostCalls).size).toBeLessThanOrEqual(4);
    expect(check.candidates_tested).toBeLessThanOrEqual(3);
    expect(check.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "domain_candidates", status: "negative" }),
        expect.objectContaining({ id: "free_hosting", status: "negative" }),
      ]),
    );
  });
});
