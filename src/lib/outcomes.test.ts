import { describe, expect, it } from "vitest";
import { summarizeOutcomes } from "@/lib/outcomes";

describe("summarizeOutcomes", () => {
  it("returns a null win rate when nothing is decided", () => {
    const s = summarizeOutcomes([{ status: "SENT" }, { status: "DRAFT" }]);
    expect(s.winRate).toBeNull();
    expect(s.decided).toBe(0);
    expect(s.pipeline).toBe(1);
  });

  it("computes a rounded win rate from decided proposals only", () => {
    const s = summarizeOutcomes([
      { status: "ACCEPTED", price: 1000 },
      { status: "ACCEPTED", price: 500 },
      { status: "REJECTED" },
    ]);
    expect(s.won).toBe(2);
    expect(s.lost).toBe(1);
    expect(s.decided).toBe(3);
    expect(s.winRate).toBe(67);
    expect(s.wonValue).toBe(1500);
  });

  it("counts only sent/replied/negotiating as pipeline", () => {
    const s = summarizeOutcomes([
      { status: "SENT" },
      { status: "REPLIED" },
      { status: "NEGOTIATING" },
      { status: "DRAFT" },
      { status: "EXPIRED" },
      { status: "CANCELLED" },
    ]);
    expect(s.pipeline).toBe(3);
    expect(s.winRate).toBeNull();
  });
});
