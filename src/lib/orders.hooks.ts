import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
<<<<<<< Updated upstream

export type OrderRow = {
  id: string;
  number: string;
  business_id: string | null;
  proposal_id: string | null;
  invoice_id: string | null;
  currency: string;
  amount: number;
  status: string;
  due_at: string | null;
  fulfilled_at: string | null;
  checklist: unknown;
  notes: string | null;
  businesses: { name: string } | null;
  invoices: { number: string } | null;
};

export type OrdersResult = { orders: OrderRow[]; persisted: boolean };
=======
import type { Order } from "@/lib/orders";

export type OrderRow = Order & {
  businesses: { name: string } | null;
  proposals: { title: string | null; mode: string | null } | null;
  invoices: { number: string | null } | null;
};

export type OrdersResult = {
  orders: OrderRow[];
  persisted: boolean;
};
>>>>>>> Stashed changes

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrdersResult> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
<<<<<<< Updated upstream
          "id,number,business_id,proposal_id,invoice_id,currency,amount,status,due_at,fulfilled_at,checklist,notes,businesses(name),invoices(number)",
=======
          "id,number,business_id,proposal_id,invoice_id,currency,amount,status,due_at,fulfilled_at,checklist,notes,businesses(name),proposals(title,mode),invoices(number)",
>>>>>>> Stashed changes
        )
        .order("created_at", { ascending: false });
      if (error) return { orders: [], persisted: false };
      return { orders: (data ?? []) as unknown as OrderRow[], persisted: true };
    },
  });
}
