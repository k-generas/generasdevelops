import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Invoice } from "@/lib/invoices";

export type InvoiceRow = Invoice & { businesses: { name: string } | null };

export type InvoicesResult = {
  invoices: InvoiceRow[];
  // false when the invoices table is missing (migration not applied yet).
  persisted: boolean;
};

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<InvoicesResult> => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id,number,business_id,proposal_id,currency,amount,status,issued_at,due_at,paid_at,notes,businesses(name)",
        )
        .order("created_at", { ascending: false });
      if (error) return { invoices: [], persisted: false };
      return { invoices: (data ?? []) as unknown as InvoiceRow[], persisted: true };
    },
  });
}
