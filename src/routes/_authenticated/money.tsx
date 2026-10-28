import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Banknote,
  Download,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInvoices } from "@/lib/invoices.hooks";
import { formatMoney } from "@/lib/invoices";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  categoryLabel,
  cashSummary,
  invoiceCashTotals,
  methodLabel,
  monthRangeUtc,
  normalizeCurrency,
  paymentTotalsByInvoice,
  roundMoney,
  CURRENCY_SUGGESTIONS,
} from "@/lib/money";
import { useBusinessOptions, useExpenses, usePayments, useUsageSummary } from "@/lib/money.hooks";
import { deleteExpense, deletePayment, recordExpense } from "@/lib/money.actions";
import { RecordPaymentDialog, type PaymentInvoiceOption } from "@/components/RecordPaymentDialog";
import { downloadCsv, rowsToCsv } from "@/lib/csv";
import { ErrorBanner, EmptyState } from "@/components/ErrorBanner";
import { describeError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/money")({
  head: () => ({
    meta: [
      { title: "Money - GARE" },
      {
        name: "description",
        content: "Payments received, expenses paid and true cash profit by currency.",
      },
    ],
  }),
  component: MoneyPage,
});

type LedgerRow = {
  kind: "payment" | "expense";
  id: string;
  date: string;
  title: string;
  detail: string;
  currency: string;
  amount: number;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "-";
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function MoneyPage() {
  const qc = useQueryClient();
  const paymentsQ = usePayments();
  const expensesQ = useExpenses();
  const invoicesQ = useInvoices();
  const businessesQ = useBusinessOptions();
  const usageQ = useUsageSummary();

  const payments = useMemo(() => paymentsQ.data?.rows ?? [], [paymentsQ.data?.rows]);
  const expenses = useMemo(() => expensesQ.data?.rows ?? [], [expensesQ.data?.rows]);
  const invoices = useMemo(() => invoicesQ.data?.invoices ?? [], [invoicesQ.data?.invoices]);
  const businesses = useMemo(() => businessesQ.data ?? [], [businessesQ.data]);
  const paymentsPersisted = paymentsQ.data?.persisted ?? false;
  const expensesPersisted = expensesQ.data?.persisted ?? false;
  const invoicesPersisted = invoicesQ.data?.persisted ?? false;

  const today = new Date().toISOString().slice(0, 10);
  const [currency, setCurrency] = useState("USD");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "payment" | "expense">("ALL");
  const [msg, setMsg] = useState<string | null>(null);

  const [category, setCategory] = useState("software");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState("USD");
  const [method, setMethod] = useState("bank_transfer");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [expenseBusinessId, setExpenseBusinessId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const month = useMemo(() => monthRangeUtc(), []);
  const paidByInvoice = useMemo(() => paymentTotalsByInvoice(payments), [payments]);

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const payment of payments) set.add(normalizeCurrency(payment.currency));
    for (const expense of expenses) set.add(normalizeCurrency(expense.currency));
    for (const invoice of invoices) set.add(normalizeCurrency(invoice.currency));
    return [...set].sort();
  }, [payments, expenses, invoices]);

  const activeCurrency = currencies.includes(currency) ? currency : (currencies[0] ?? "USD");
  const monthCash = cashSummary(payments, expenses, activeCurrency, month);
  const allCash = cashSummary(payments, expenses, activeCurrency);
  const invoiceTotals = useMemo(() => invoiceCashTotals(invoices, payments), [invoices, payments]);
  const outstanding =
    invoiceTotals.outstanding.find((row) => row.currency === activeCurrency)?.amount ?? 0;

  const summaries = useMemo(
    () =>
      currencies.map((code) => {
        const all = cashSummary(payments, expenses, code);
        return {
          currency: code,
          collected: all.collected,
          spent: all.spent,
          net: all.net,
          outstanding: invoiceTotals.outstanding.find((row) => row.currency === code)?.amount ?? 0,
        };
      }),
    [currencies, payments, expenses, invoiceTotals.outstanding],
  );

  const paymentOptions = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.id && invoice.status !== "VOID")
        .map<PaymentInvoiceOption>((invoice) => ({
          id: invoice.id as string,
          number: invoice.number,
          business_id: invoice.business_id,
          businessName: invoice.businesses?.name ?? null,
          amount: Number(invoice.amount) || 0,
          currency: invoice.currency,
          status: invoice.status,
          paid: paidByInvoice.get(invoice.id as string) ?? 0,
        })),
    [invoices, paidByInvoice],
  );

  const ledger = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [];
    for (const payment of payments) {
      const businessName = payment.businesses?.name ?? null;
      const invoiceNumber = payment.invoices?.number ?? null;
      rows.push({
        kind: "payment",
        id: payment.id,
        date: payment.received_at,
        title: invoiceNumber ?? businessName ?? "General payment",
        detail: [
          invoiceNumber && businessName ? businessName : null,
          methodLabel(payment.method),
          payment.reference,
        ]
          .filter(Boolean)
          .join(" - "),
        currency: normalizeCurrency(payment.currency),
        amount: Number(payment.amount) || 0,
      });
    }
    for (const expense of expenses) {
      rows.push({
        kind: "expense",
        id: expense.id,
        date: expense.paid_at,
        title: expense.vendor || categoryLabel(expense.category),
        detail: [
          categoryLabel(expense.category),
          expense.businesses?.name,
          methodLabel(expense.method),
          expense.reference,
        ]
          .filter(Boolean)
          .join(" - "),
        currency: normalizeCurrency(expense.currency),
        amount: Number(expense.amount) || 0,
      });
    }
    return rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [payments, expenses]);

  const filteredLedger = filter === "ALL" ? ledger : ledger.filter((row) => row.kind === filter);
  const visibleLedger = filteredLedger.slice(0, 100);

  async function refreshMoney() {
    await Promise.all([paymentsQ.refetch(), expensesQ.refetch(), invoicesQ.refetch()]);
    void qc.invalidateQueries({ queryKey: ["nav-counts"] });
    void qc.invalidateQueries({ queryKey: ["analytics-data"] });
  }

  async function addExpense() {
    const value = roundMoney(Number(amount));
    if (!(value > 0)) {
      setMsg("Enter an expense amount greater than zero.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await recordExpense({
        business_id: expenseBusinessId || null,
        category,
        vendor,
        amount: value,
        currency: expenseCurrency,
        method,
        paid_at: new Date(`${paidAt}T00:00:00.000Z`).toISOString(),
        reference,
        notes,
      });
      setMsg(`Recorded ${formatMoney(value, normalizeCurrency(expenseCurrency))} expense.`);
      setAmount("");
      setVendor("");
      setReference("");
      setNotes("");
      await refreshMoney();
    } catch (e) {
      const d = describeError(e, "Record expense");
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeLedgerRow(row: LedgerRow) {
    const label = row.kind === "payment" ? "payment" : "expense";
    if (!window.confirm(`Delete this ${label} of ${formatMoney(row.amount, row.currency)}?`))
      return;
    setBusy(true);
    setMsg(null);
    try {
      if (row.kind === "payment") await deletePayment(row.id);
      else await deleteExpense(row.id);
      setMsg(`Deleted ${label}.`);
      await refreshMoney();
    } catch (e) {
      const d = describeError(e, `Delete ${label}`);
      setMsg(`${d.title}: ${d.message} How to fix: ${d.fix}`);
    } finally {
      setBusy(false);
    }
  }

  function exportLedger() {
    const rows = ledger.map((row) => ({
      kind: row.kind,
      date: row.date.slice(0, 10),
      title: row.title,
      detail: row.detail,
      currency: row.currency,
      amount: row.amount,
      signed_amount: row.kind === "payment" ? row.amount : -row.amount,
    }));
    downloadCsv(rowsToCsv(rows), `money-ledger-${today}.csv`);
  }

  const moneyMigrationMissing = !paymentsPersisted || !expensesPersisted;
  const usage = usageQ.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Money</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet className="h-6 w-6 text-primary" />
            Cash truth
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Payments in, costs out, and real profit by currency. No online payment is processed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={activeCurrency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Display currency"
          >
            {(currencies.length ? currencies : ["USD"]).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <Button onClick={() => setPaymentOpen(true)} disabled={!paymentsPersisted}>
            <Plus className="h-4 w-4" />
            Record payment
          </Button>
        </div>
      </header>

      {msg && (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">{msg}</p>
      )}

      {(paymentsQ.isError || expensesQ.isError || invoicesQ.isError) && (
        <ErrorBanner
          error={(paymentsQ.error ?? expensesQ.error ?? invoicesQ.error) as Error}
          context="Money"
          onRetry={() => void refreshMoney()}
        />
      )}

      {moneyMigrationMissing && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-card p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Money ledger needs migration 0021</p>
            <p className="text-muted-foreground">
              Apply <code>0021_payments_expenses.sql</code> (see{" "}
              <code>docs/GARE_DB_RUNBOOK.md</code>). Recording payments and expenses is disabled
              until then.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={`Collected - ${activeCurrency} this month`}
          value={formatMoney(monthCash.collected, activeCurrency)}
          hint={`${formatMoney(allCash.collected, activeCurrency)} all time`}
        />
        <Kpi
          label={`Spent - ${activeCurrency} this month`}
          value={formatMoney(monthCash.spent, activeCurrency)}
          hint={`${formatMoney(allCash.spent, activeCurrency)} all time`}
        />
        <Kpi
          label={`Net cash - ${activeCurrency} this month`}
          value={formatMoney(monthCash.net, activeCurrency)}
          hint="Payments minus expenses"
        />
        <Kpi
          label={`Outstanding - ${activeCurrency}`}
          value={formatMoney(outstanding, activeCurrency)}
          hint={`${monthCash.paymentCount} payment${monthCash.paymentCount === 1 ? "" : "s"} this month`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Banknote className="h-4 w-4" />
              Cash ledger
            </CardTitle>
            <Button size="sm" variant="outline" onClick={exportLedger} disabled={!ledger.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { value: "ALL", label: "All" },
                { value: "payment", label: "Payments" },
                { value: "expense", label: "Expenses" },
              ].map((tab) => (
                <Button
                  key={tab.value}
                  size="sm"
                  variant={filter === tab.value ? "default" : "outline"}
                  onClick={() => setFilter(tab.value as typeof filter)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {filteredLedger.length === 0 ? (
              <EmptyState
                title="No money recorded yet"
                why="Record a payment when cash arrives, or add an expense when you pay for tools, data or help."
              />
            ) : (
              <div className="divide-y rounded-lg border">
                {visibleLedger.map((row) => (
                  <div
                    key={`${row.kind}:${row.id}`}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        row.kind === "payment"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {row.kind === "payment" ? (
                        <Banknote className="h-4 w-4" />
                      ) : (
                        <Receipt className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(row.date)}
                        {row.detail ? ` - ${row.detail}` : ""}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        row.kind === "payment"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      }`}
                    >
                      {formatMoney(row.kind === "payment" ? row.amount : -row.amount, row.currency)}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeLedgerRow(row)}
                      disabled={busy}
                      title={`Delete ${row.kind}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {filteredLedger.length > visibleLedger.length && (
              <p className="text-xs text-muted-foreground">
                Showing the latest {visibleLedger.length} of {filteredLedger.length}. Export CSV for
                the full ledger.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Receipt className="h-4 w-4" />
              Add an expense
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Category</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm">
              <Label htmlFor="expense-vendor" className="mb-1 block text-muted-foreground">
                Vendor / description
              </Label>
              <Input
                id="expense-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. Google Maps, contractor"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <Label htmlFor="expense-amount" className="mb-1 block text-muted-foreground">
                  Amount
                </Label>
                <Input
                  id="expense-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="text-sm">
                <Label htmlFor="expense-currency" className="mb-1 block text-muted-foreground">
                  Currency
                </Label>
                <Input
                  id="expense-currency"
                  list="expense-currency-options"
                  value={expenseCurrency}
                  onChange={(e) => setExpenseCurrency(e.target.value.toUpperCase())}
                  maxLength={6}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <Label htmlFor="expense-date" className="mb-1 block text-muted-foreground">
                  Paid
                </Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </div>
              <div className="text-sm">
                <Label htmlFor="expense-method" className="mb-1 block text-muted-foreground">
                  Method
                </Label>
                <select
                  id="expense-method"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.filter((item) => item.value !== "legacy").map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {businesses.length > 0 && (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Business (optional)</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={expenseBusinessId}
                  onChange={(e) => setExpenseBusinessId(e.target.value)}
                >
                  <option value="">No business link</option>
                  {businesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="text-sm">
              <Label htmlFor="expense-reference" className="mb-1 block text-muted-foreground">
                Reference
              </Label>
              <Input
                id="expense-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt or invoice number"
              />
            </div>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
            />
            <Button
              className="w-full"
              onClick={() => void addExpense()}
              disabled={busy || !expensesPersisted}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add expense
            </Button>
            {!invoicesPersisted && (
              <p className="text-xs text-muted-foreground">
                Invoice linking is unavailable until the invoices migration is applied. General
                payments still work.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <datalist id="expense-currency-options">
        {CURRENCY_SUGGESTIONS.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">By currency</CardTitle>
          </CardHeader>
          <CardContent>
            {summaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No currencies recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Currency</th>
                      <th className="py-2 pr-3 text-right font-medium">Collected</th>
                      <th className="py-2 pr-3 text-right font-medium">Spent</th>
                      <th className="py-2 pr-3 text-right font-medium">Net</th>
                      <th className="py-2 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((row) => (
                      <tr key={row.currency} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{row.currency}</td>
                        <td className="py-2 pr-3 text-right">
                          {formatMoney(row.collected, row.currency)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatMoney(row.spent, row.currency)}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right font-medium ${
                            row.net < 0 ? "text-destructive" : ""
                          }`}
                        >
                          {formatMoney(row.net, row.currency)}
                        </td>
                        <td className="py-2 text-right">
                          {formatMoney(row.outstanding, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Paid API usage this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discovery runs</span>
              <span className="font-medium">{usage?.discoveryRuns ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">AI investigations</span>
              <span className="font-medium">{usage?.investigations ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Source scans</span>
              <span className="font-medium">{usage?.sourceScans ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-muted-foreground">Provider cost recorded</span>
              <span className="font-medium">{formatMoney(usage?.scanCostUsd ?? 0, "USD")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Provider cost only counts scans that reported spend. Add other paid tools as expenses
              above.
            </p>
            {usage && !usage.scansPersisted && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Source scan cost data is unavailable on this database. Apply the latest intelligence
                migration to see it.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        invoices={paymentOptions}
        businesses={businesses}
        onSaved={(message) => {
          if (message) setMsg(message);
          void refreshMoney();
        }}
      />
    </div>
  );
}
