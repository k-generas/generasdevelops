import { describe, expect, it } from "vitest";
import {
  blockedSources,
  coverageReport,
  enabledSources,
  getSource,
  pendingSources,
  SOURCE_REGISTRY,
} from "@/lib/source-registry";

describe("source registry", () => {
  it("only marks the Maps connector as available/enabled", () => {
    expect(enabledSources().map((s) => s.id)).toEqual(["google-maps"]);
  });

  it("records the prohibited bypass source as blocked with a reason", () => {
    const bypass = getSource("scraping-bypass")!;
    expect(bypass.access).toBe("blocked");
    expect(bypass.enabled).toBe(false);
    expect(bypass.reason).toMatch(/never bypass/i);
    expect(blockedSources().map((s) => s.id)).toContain("scraping-bypass");
  });

  it("never enables a source that is not available", () => {
    for (const s of SOURCE_REGISTRY) {
      if (s.enabled) expect(s.access).toBe("available");
      if (s.access !== "available") expect(s.enabled).toBe(false);
    }
  });

  it("lists pending sources with reasons", () => {
    const pending = pendingSources();
    expect(pending.length).toBeGreaterThan(0);
    expect(getSource("rdb-registry")!.access).toBe("requires_authorization");
    expect(pending.every((s) => s.reason === null || typeof s.reason === "string")).toBe(true);
  });

  it("produces an honest coverage report", () => {
    const r = coverageReport();
    expect(r.active).toContain("Google Maps (Places API)");
    expect(r.note).toMatch(/not every business/i);
    expect(r.pending.length).toBeGreaterThan(0);
  });
});
