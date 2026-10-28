import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRangeUtc } from "@/lib/money";

export type PaymentRow = {
  id: string;
  business_id: string | null;
  invoice_id: string | null;
  amount: number;
  currency: string;
  method: string;
  received_at: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  businesses: { name: string } | null;
  invoices: { number: string } | null;
};

export type ExpenseRow = {
  id: string;
  business_id: string | null;
  category: string;
  vendor: string | null;
  amount: number;
  currency: string;
  method: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  businesses: { name: string } | null;
};

export type MoneyResult<T> = {
  rows: T[];
  // false when the table is missing because migration 0021 has not been applied.
  persisted: boolean;
};

export function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async (): Promise<MoneyResult<PaymentRow>> => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id,business_id,invoice_id,amount,currency,method,received_at,reference,notes,created_at,businesses(name),invoices(number)",
        )
        .order("received_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) return { rows: [], persisted: false };
      return { rows: (data ?? []) as unknown as PaymentRow[], persisted: true };
    },
  });
}

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async (): Promise<MoneyResult<ExpenseRow>> => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id,business_id,category,vendor,amount,currency,method,paid_at,reference,notes,created_at,businesses(name)",
        )
        .order("paid_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) return { rows: [], persisted: false };
      return { rows: (data ?? []) as unknown as ExpenseRow[], persisted: true };
    },
  });
}

export function useBusinessOptions() {
  return useQuery({
    queryKey: ["business-options"],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name")
        .order("name", { ascending: true })
        .limit(5000);
      if (error) return [];
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export type UsageSummary = {
  discoveryRuns: number;
  investigations: number;
  sourceScans: number;
  scanCostUsd: number;
  scansPersisted: boolean;
};

export function useUsageSummary() {
  return useQuery({
    queryKey: ["usage-summary", "month"],
    queryFn: async (): Promise<UsageSummary> => {
      const range = monthRangeUtc();
      const [runs, investigations, scans] = await Promise.all([
        supabase
          .from("discovery_runs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", range.start)
          .lt("created_at", range.end),
        supabase
          .from("investigations")
          .select("id", { count: "exact", head: true })
          .gte("created_at", range.start)
          .lt("created_at", range.end),
        supabase
          .from("source_scans")
          .select("cost_usd")
          .gte("started_at", range.start)
          .lt("started_at", range.end),
      ]);
      const scanRows = scans.error ? [] : (scans.data ?? []);
      const scanCostUsd = scanRows.reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
      return {
        discoveryRuns: runs.count ?? 0,
        investigations: investigations.count ?? 0,
        sourceScans: scanRows.length,
        scanCostUsd: Math.round(scanCostUsd * 1000) / 1000,
        scansPersisted: !scans.error,
      };
    },
    staleTime: 60_000,
  });
}
