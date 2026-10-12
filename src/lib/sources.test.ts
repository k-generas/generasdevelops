import { describe, expect, it } from "vitest";
import { scanHealth, type Source } from "@/lib/sources";

function src(over: Partial<Source>): Source {
  return {
    id: "s1",
    kind: "rss",
    name: "Test",
    url: null,
    enabled: true,
    configured: true,
    last_ok_at: new Date().toISOString(),
    last_attempt_at: new Date().toISOString(),
    error: null,
    fresh_ok: true,
    ...over,
  };
}

describe("sources", () => {
  it("reports healthy source", () => {
    expect(scanHealth(src({}), 7).ok).toBe(true);
  });

  it("flags a stale source", () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    expect(scanHealth(src({ last_ok_at: old.toISOString() }), 7).ok).toBe(false);
  });

  it("flags an unconfigured source", () => {
    expect(scanHealth(src({ enabled: false }), 7).ok).toBe(false);
  });
});
