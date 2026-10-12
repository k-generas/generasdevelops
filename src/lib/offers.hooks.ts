import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_OFFERS, OFFER_COLUMNS, type Offer } from "@/lib/offers";

export type OffersResult = {
  offers: Offer[];
  // false when the offers table is missing (migration not applied yet); the UI
  // falls back to DEFAULT_OFFERS and shows a hint instead of breaking.
  persisted: boolean;
};

export function useOffers() {
  return useQuery({
    queryKey: ["offers"],
    queryFn: async (): Promise<OffersResult> => {
      const { data, error } = await supabase
        .from("offers")
        .select(OFFER_COLUMNS)
        .order("position", { ascending: true });
      if (error) return { offers: DEFAULT_OFFERS, persisted: false };
      const offers = (data ?? []) as Offer[];
      return { offers: offers.length > 0 ? offers : DEFAULT_OFFERS, persisted: true };
    },
  });
}
