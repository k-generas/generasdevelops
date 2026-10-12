import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  nextOrderNumber,
  orderIsLate,
  toChecklist,
  type ChecklistItem,
} from "@/lib/orders";

describe("orders", () => {
  it("parses checklist safely (mixed strings/objects, garbage ignored)", () => {
    const c = toChecklist([
      "Setup domain",
      { label: "Build pages", done: true },
      null,
      5,
      { label: "", done: "yes" as unknown as boolean },
    ]);
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual({ label: "Setup domain", done: false });
    expect(c[1]).toEqual({ label: "Build pages", done: true });
    expect(c[2]!.label).toBe("");
  });

  it("computes progress", () => {
    const p = checklistProgress([
      { label: "A", done: true },
      { label: "B", done: false },
      { label: "C", done: true },
    ]);
    expect(p.done).toBe(2);
    expect(p.total).toBe(3);
  });

  it("generates order numbers", () => {
    expect(nextOrderNumber([], 2026)).toBe("ORD-2026-0001");
    expect(nextOrderNumber(["ORD-2026-0001", "ORD-2026-0005"], 2026)).toBe("ORD-2026-0006");
  });

  it("detects late orders", () => {
    const past = "2000-01-01T00:00:00.000Z";
    expect(orderIsLate({ status: "IN_PROGRESS", due_at: past })).toBe(true);
    expect(orderIsLate({ status: "FULFILLED", due_at: past })).toBe(false);
    expect(orderIsLate({ status: "DRAFT", due_at: null })).toBe(false);
  });
});
