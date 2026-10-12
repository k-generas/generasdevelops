import { useMemo } from "react";

type Row = Record<string, unknown>;
type Options = {
  filename?: string;
  bom?: boolean; // UTF-8 BOM helps Excel
};

export function rowsToCsv(rows: Row[], opts: Options = {}): string {
  const { filename, bom = true } = opts;
  if (!rows.length) return bom ? "\ufeff" : "";
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [
    bom ? "\ufeff" : "",
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export function downloadCsv(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
