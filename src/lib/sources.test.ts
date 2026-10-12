import { describe, expect, it } from "vitest";
import { scanHealth } from "@/lib/sources";

describe("sources", () => {
  it("reports health correctly", () => {
    const now = new Date();
    const ok: any = {
      enabled: true,
      configured: true,
      last_ok_at: now.toISOString(),
      last_attempt_at: now.toISOString(),
      error: null,
    };
    expect(scanHealth(ok, 7).ok).toBe(true);
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const stale: any = { ...ok, last_ok_at: old.toISOString() };
    expect(scanHealth(stale, 7).ok).toBe(false);
    const no: any = { enabled: false, configured: true, last_ok_at: null };
    expect(scanHealth(no, 7).ok).toBe(false);
  });
});
