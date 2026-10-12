import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrdersResult> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,number,business_id,proposal_id,invoice_id,currency,amount,status,due_at,fulfilled_at,checklist,notes,businesses(name),proposals(title,mode),invoices(number)",
        )
        .order("created_at", { ascending: false });
      if (error) return { orders: [], persisted: false };
      return { orders: (data ?? []) as unknown as OrderRow[], persisted: true };
    },
  });
}
