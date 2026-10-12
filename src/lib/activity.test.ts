import { describe, expect, it } from "vitest";
import {
  classifyDiscovery,
  diffActivity,
  HIRING_DISCLAIMER,
  isGenuinelyNew,
  isHiringKind,
  signalStrength,
  type ActivityEvent,
} from "@/lib/activity";

const NOW = new Date("2026-10-12T00:00:00Z");

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    key: "k1",
    kind: "vacancy",
    title: "Sales officer",
    first_seen_at: "2026-10-01T00:00:00Z",
    last_seen_at: "2026-10-10T00:00:00Z",
    source_date: "2026-10-01T00:00:00Z",
    status: "active",
    source_id: "rw-job-boards",
    url: null,
    confidence: 0.7,
    ...over,
  };
}

describe("isGenuinelyNew", () => {
  it("treats a recent source date as genuinely new", () => {
    expect(isGenuinelyNew(event(), NOW)).toBe(true);
  });

  it("treats an old source date as not new even if just discovered", () => {
    const e = event({ source_date: "2026-01-01T00:00:00Z" });
    expect(isGenuinelyNew(e, NOW)).toBe(false);
  });
});

describe("classifyDiscovery", () => {
  it("marks previously known records", () => {
    expect(classifyDiscovery(event(), true, NOW)).toBe("already_known");
  });
  it("distinguishes newly discovered old records", () => {
    const e = event({ source_date: "2026-01-01T00:00:00Z" });
    expect(classifyDiscovery(e, false, NOW)).toBe("newly_discovered_old");
  });
  it("marks genuinely new records", () => {
    expect(classifyDiscovery(event(), false, NOW)).toBe("genuinely_new");
  });
});

describe("diffActivity", () => {
  it("detects new, updated, reopened and closed", () => {
    const prev = [
      event({ key: "a", title: "A" }),
      event({ key: "b", status: "closed", title: "B" }),
      event({ key: "c", last_seen_at: "2026-10-01T00:00:00Z", title: "C" }),
    ];
    const cur = [
      event({ key: "b", status: "active", title: "B" }),
      event({ key: "c", last_seen_at: "2026-10-11T00:00:00Z", title: "C" }),
      event({ key: "d", title: "D" }),
    ];
    const changes = diffActivity(prev, cur);
    expect(changes.find((c) => c.event.key === "d")?.type).toBe("new");
    expect(changes.find((c) => c.event.key === "b")?.type).toBe("reopened");
    expect(changes.find((c) => c.event.key === "c")?.type).toBe("updated");
    expect(changes.find((c) => c.event.key === "a")?.type).toBe("closed");
  });

  it("does not report a closed record as closed again", () => {
    const prev = [event({ key: "a", status: "closed" })];
    expect(diffActivity(prev, [])).toEqual([]);
  });
});

describe("signalStrength", () => {
  it("ranks tenders and expansion as strong", () => {
    expect(signalStrength(event({ kind: "tender" }), NOW)).toBe("strong");
    expect(signalStrength(event({ kind: "expansion" }), NOW)).toBe("strong");
  });
  it("ranks a plain vacancy as weak", () => {
    expect(signalStrength(event({ kind: "vacancy" }), NOW)).toBe("weak");
  });
  it("downgrades stale or unverified signals", () => {
    expect(signalStrength(event({ kind: "tender", status: "unverified" }), NOW)).toBe("weak");
    const stale = event({ kind: "tender", source_date: "2025-01-01T00:00:00Z" });
    expect(signalStrength(stale, NOW)).toBe("weak");
  });
});

describe("hiring helpers", () => {
  it("identifies hiring kinds", () => {
    expect(isHiringKind("vacancy")).toBe(true);
    expect(isHiringKind("repeated_recruitment")).toBe(true);
    expect(isHiringKind("tender")).toBe(false);
  });
  it("ships an explicit disclaimer", () => {
    expect(HIRING_DISCLAIMER).toMatch(/does not prove/i);
  });
});
