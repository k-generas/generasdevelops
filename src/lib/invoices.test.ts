import { describe, expect, it } from "vitest";
import {
  formatMoney,
  isOverdue,
  nextInvoiceNumber,
  renderInvoiceText,
  type Invoice,
} from "@/lib/invoices";

function inv(over: Partial<Invoice>): Invoice {
  return {
    id: "x",
    number: "INV-2026-0001",
    business_id: null,
    proposal_id: null,
    currency: "USD",
    amount: 500,
    status: "DRAFT",
    issued_at: "2026-01-01T00:00:00.000Z",
    due_at: null,
    paid_at: null,
    notes: null,
    ...over,
  };
}

describe("invoices", () => {
  it("formats money, falling back for unknown currencies", () => {
    expect(formatMoney(1500, "USD")).toContain("1,500");
    expect(formatMoney(10, "NOTACURRENCY")).toBe("NOTACURRENCY 10");
  });

  it("generates a deterministic next number per year", () => {
    expect(nextInvoiceNumber([], 2026)).toBe("INV-2026-0001");
    expect(nextInvoiceNumber(["INV-2026-0001", "INV-2026-0007", "INV-2025-0009"], 2026)).toBe(
      "INV-2026-0008",
    );
  });

  it("detects overdue invoices but not paid/void ones", () => {
    const past = "2020-01-01T00:00:00.000Z";
    expect(isOverdue({ status: "SENT", due_at: past })).toBe(true);
    expect(isOverdue({ status: "PARTIAL", due_at: past })).toBe(true);
    expect(isOverdue({ status: "PAID", due_at: past })).toBe(false);
    expect(isOverdue({ status: "VOID", due_at: past })).toBe(false);
    expect(isOverdue({ status: "SENT", due_at: null })).toBe(false);
  });

  it("renders a plain-text invoice with the amount and client", () => {
    const text = renderInvoiceText(
      {
        ...({} as Invoice),
        number: "INV-2026-0001",
        currency: "USD",
        amount: 500,
        status: "SENT",
        issued_at: new Date().toISOString(),
        due_at: null,
        paid_at: null,
        notes: null,
        id: null,
        business_id: null,
        proposal_id: null,
      },
      "Acme Ltd",
      "Website redesign",
    );
    expect(text).toContain("INVOICE INV-2026-0001");
    expect(text).toContain("Bill to:");
    expect(text).toContain("Acme Ltd");
    expect(text).toContain("$500.00");
    expect(renderInvoiceText({} as Invoice).length).toBeGreaterThan(0);
  });
});
