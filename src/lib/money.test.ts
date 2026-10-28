import { describe, expect, it } from "vitest";
import {
  cashSummary,
  invoiceCashTotals,
  invoicePaymentState,
  invoiceStatusAfterPayments,
  latestPaymentAt,
  monthRangeUtc,
  paymentTotalsByInvoice,
  roundMoney,
  sumMoney,
  totalForCurrency,
  withinRange,
} from "@/lib/money";

describe("money", () => {
  it("rounds money to cents and normalizes currency", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(Number.NaN)).toBe(0);
  });

  it("computes partial, full and overpaid invoice states", () => {
    expect(invoicePaymentState(100, [{ amount: 25 }])).toMatchObject({
      due: 100,
      paid: 25,
      remaining: 75,
      overpaid: 0,
      isPaid: false,
      isPartial: true,
    });
    expect(invoicePaymentState(100, [{ amount: 60 }, { amount: 40 }])).toMatchObject({
      paid: 100,
      remaining: 0,
      isPaid: true,
      isPartial: false,
    });
    expect(invoicePaymentState(100, [{ amount: 120 }])).toMatchObject({
      remaining: 0,
      overpaid: 20,
      isPaid: true,
    });
  });

  it("derives invoice status without overriding void invoices", () => {
    expect(invoiceStatusAfterPayments("SENT", 100, [{ amount: 20 }])).toBe("PARTIAL");
    expect(invoiceStatusAfterPayments("PARTIAL", 100, [{ amount: 100 }])).toBe("PAID");
    expect(invoiceStatusAfterPayments("PAID", 100, [])).toBe("SENT");
    expect(invoiceStatusAfterPayments("VOID", 100, [{ amount: 100 }])).toBe("VOID");
    expect(invoiceStatusAfterPayments("DRAFT", 100, [])).toBe("DRAFT");
  });

  it("groups and sums multiple currencies", () => {
    const rows = [
      { amount: 10, currency: "usd" },
      { amount: 5.5, currency: "USD" },
      { amount: 2000, currency: "RWF" },
    ];
    expect(sumMoney(rows)).toEqual([
      { currency: "RWF", amount: 2000 },
      { currency: "USD", amount: 15.5 },
    ]);
    expect(totalForCurrency(rows, "usd")).toBe(15.5);
    expect(sumMoney(rows, -1)).toEqual([
      { currency: "USD", amount: -15.5 },
      { currency: "RWF", amount: -2000 },
    ]);
  });

  it("totals paid and outstanding per currency, including partial payments", () => {
    const totals = invoiceCashTotals(
      [
        { id: "a", amount: 100, currency: "USD", status: "PARTIAL" },
        { id: "b", amount: 50, currency: "USD", status: "PAID" },
        { id: "c", amount: 999, currency: "USD", status: "VOID" },
        { id: "d", amount: 2000, currency: "RWF", status: "SENT" },
      ],
      [
        { invoice_id: "a", amount: 40, currency: "USD" },
        { invoice_id: "b", amount: 50, currency: "USD" },
        { invoice_id: null, amount: 25, currency: "USD" },
      ],
    );
    expect(totals.paid).toEqual([{ currency: "USD", amount: 90 }]);
    expect(totals.outstanding).toEqual([
      { currency: "RWF", amount: 2000 },
      { currency: "USD", amount: 60 },
    ]);
    expect(totals.count).toBe(4);
  });

  it("maps payments to invoices and ignores unlinked cash", () => {
    const map = paymentTotalsByInvoice([
      { invoice_id: "a", amount: 10 },
      { invoice_id: "a", amount: 5 },
      { invoice_id: null, amount: 99 },
    ]);
    expect(map.get("a")).toBe(15);
    expect(map.size).toBe(1);
  });

  it("filters cash by month and currency", () => {
    const now = new Date("2026-10-26T12:00:00.000Z");
    const range = monthRangeUtc(now);
    expect(range.start).toBe("2026-10-01T00:00:00.000Z");
    expect(range.end).toBe("2026-11-01T00:00:00.000Z");
    expect(withinRange("2026-10-31T23:59:59.000Z", range.start, range.end)).toBe(true);
    expect(withinRange("2026-11-01T00:00:00.000Z", range.start, range.end)).toBe(false);

    const cash = cashSummary(
      [
        { amount: 100, currency: "USD", received_at: "2026-10-02T00:00:00.000Z" },
        { amount: 50, currency: "USD", received_at: "2026-09-30T00:00:00.000Z" },
        { amount: 3000, currency: "RWF", received_at: "2026-10-02T00:00:00.000Z" },
      ],
      [{ amount: 30, currency: "USD", paid_at: "2026-10-03T00:00:00.000Z" }],
      "USD",
      range,
    );
    expect(cash).toEqual({
      collected: 100,
      spent: 30,
      net: 70,
      paymentCount: 1,
      expenseCount: 1,
    });
  });

  it("finds the latest payment timestamp", () => {
    expect(
      latestPaymentAt([
        { received_at: "2026-10-01T00:00:00.000Z" },
        { received_at: "2026-10-05T00:00:00.000Z" },
      ]),
    ).toBe("2026-10-05T00:00:00.000Z");
    expect(latestPaymentAt([])).toBeNull();
  });
});
