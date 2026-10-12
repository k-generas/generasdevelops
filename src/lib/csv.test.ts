import { describe, expect, it } from "vitest";
import { downloadCsv, rowsToCsv } from "@/lib/csv";

describe("csv", () => {
  it("quotes fields with commas/newlines/quotes", () => {
    const csv = rowsToCsv([
      { name: "Acme, Inc", note: 'Line\n"quoted"' },
      { name: "Beta", note: "ok" },
    ]);
    expect(csv).toContain('"Acme, Inc"');
    expect(csv).toContain('"Line\n""quoted"""');
  });

  it("includes UTF-8 BOM by default", () => {
    const csv = rowsToCsv([{ a: 1 }]);
    expect(csv.startsWith("\ufeff")).toBe(true);
  });

  it("handles empty array", () => {
    const csv = rowsToCsv([]);
    expect(csv).toBe("\ufeff");
  });

  it("downloads without throwing (smoke)", () => {
    expect(() => downloadCsv("a,b\n1,2", "test.csv")).not.toThrow();
  });
});
