import { describe, expect, it } from "vitest";
import {
  bestStatus,
  isFactual,
  isProvenanceStale,
  mergeFact,
  type Provenance,
  type VerificationStatus,
} from "@/lib/provenance";

function prov(over: Partial<Provenance> = {}): Provenance {
  return {
    source: "test",
    source_type: "directory",
    method: "manual",
    url: null,
    first_seen_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
    excerpt: null,
    confidence: 0.7,
    status: "single_source",
    ...over,
  };
}

describe("provenance", () => {
  it("treats only verified/sourced statuses as factual", () => {
    expect(isFactual("officially_verified")).toBe(true);
    expect(isFactual("multi_source")).toBe(true);
    expect(isFactual("single_source")).toBe(true);
    expect(isFactual("ai_inference")).toBe(false);
    expect(isFactual("estimated")).toBe(false);
    expect(isFactual("unknown")).toBe(false);
  });

  it("picks the most trustworthy status", () => {
    const statuses: VerificationStatus[] = ["single_source", "ai_inference", "multi_source"];
    expect(bestStatus(statuses)).toBe("multi_source");
    expect(bestStatus([])).toBe("unknown");
  });

  it("expires AI/estimates faster than official data", () => {
    const old = new Date();
    old.setDate(old.getDate() - 120);
    const ai = prov({
      status: "ai_inference",
      last_verified_at: null,
      last_checked_at: old.toISOString(),
    });
    const official = prov({
      status: "officially_verified",
      last_checked_at: old.toISOString(),
    });
    expect(isProvenanceStale(ai)).toBe(true);
    expect(isProvenanceStale(official)).toBe(false);
  });

  it("merges agreeing sources into multi_source", () => {
    const m = mergeFact([
      { value: "Kigali", provenance: prov({ source: "a", status: "single_source" }) },
      { value: "Kigali", provenance: prov({ source: "b", status: "single_source" }) },
    ]);
    expect(m.value).toBe("Kigali");
    expect(m.status).toBe("multi_source");
    expect(m.conflicts).toHaveLength(0);
    expect(m.sources).toHaveLength(2);
  });

  it("preserves conflicts instead of choosing", () => {
    const m = mergeFact([
      { value: 50, provenance: prov({ source: "a" }) },
      { value: 200, provenance: prov({ source: "b" }) },
    ]);
    expect(m.status).toBe("conflicting");
    expect(m.value).toBeNull();
    expect(m.conflicts).toHaveLength(2);
  });

  it("returns unknown for no evidence", () => {
    const m = mergeFact([]);
    expect(m.status).toBe("unknown");
    expect(m.value).toBeNull();
  });
});
