import { describe, expect, it } from "vitest";
import {
  buildXlsx,
  rowsToSafeCsv,
  safeFilename,
  sanitizeSpreadsheetText,
  spreadsheetCell,
  type ExportColumn,
} from "./export-safe";

const columns: ExportColumn[] = [
  { key: "name", label: "Name" },
  { key: "notes", label: "Notes" },
  { key: "value", label: "Value" },
];

describe("spreadsheet formula injection protection", () => {
  it("neutralises formulas and control prefixes", () => {
    expect(sanitizeSpreadsheetText("=1+1")).toBe("'=1+1");
    expect(sanitizeSpreadsheetText("  @SUM(A1)")).toBe("'  @SUM(A1)");
    expect(sanitizeSpreadsheetText("+cmd|' /C calc'!A0")).toMatch(/^'/);
    expect(sanitizeSpreadsheetText("-2+3")).toMatch(/^'/);
    expect(sanitizeSpreadsheetText("normal text")).toBe("normal text");
  });

  it("keeps real numbers numeric", () => {
    expect(spreadsheetCell(-42)).toBe(-42);
    expect(spreadsheetCell(3.5)).toBe(3.5);
    expect(spreadsheetCell(false)).toBe(false);
    expect(spreadsheetCell("=BAD()")).toBe("'=BAD()");
  });
});

describe("safe CSV", () => {
  it("writes stable headers and escapes quotes, commas and newlines", () => {
    const csv = rowsToSafeCsv(
      [{ name: "A, Inc", notes: 'Said "hello"\nnext', value: 10 }],
      columns,
      { bom: false },
    );
    expect(csv.split("\n")[0]).toBe("Name,Notes,Value");
    expect(csv).toContain('"A, Inc"');
    expect(csv).toContain('"Said ""hello""\nnext"');
    expect(csv).toContain(",10");
  });

  it("sanitises formula cells in CSV", () => {
    const csv = rowsToSafeCsv([{ name: "=HYPERLINK(\"x\")" }], columns, { bom: false });
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("XLSX writer", () => {
  it("produces a ZIP-based workbook with sanitised inline strings", () => {
    const bytes = buildXlsx(
      [{ name: "=BAD()", notes: "hello & <world>", value: 42 }],
      columns,
      "Leads",
    );
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("&apos;=BAD()");
    expect(text).toContain("hello &amp; &lt;world&gt;");
    expect(text).toContain("<v>42</v>");
    expect(text).toContain('name="Leads"');
  });

  it("limits sheet names and produces safe filenames", () => {
    const bytes = buildXlsx([{ name: "x" }], columns, "A/B:C*?[]" + "x".repeat(50));
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).not.toContain('name="A/B:C*?[]');
    expect(safeFilename('report: "Q1" / 2026')).toBe("report-Q1-2026");
    expect(safeFilename("")).toBe("export");
  });
});
