import { DEFAULT_CURRENCY, OFFER_LIST } from "@/lib/pricing";

// A configurable service the owner sells. Persisted in public.offers (owner
// scoped). `id` is null for the built-in fallback rows so the UI can tell an
// unsaved default apart from a stored row.
export type Offer = {
  id: string | null;
  name: string;
  default_price: number | null;
  currency: string;
  deliverables: string | null;
  notes: string | null;
  active: boolean;
  position: number;
};

export const OFFER_COLUMNS =
  "id,name,default_price,currency,deliverables,notes,active,position" as const;

// Seed shown when the owner has not configured a catalog yet (or the offers
// table does not exist). Mirrors the historical static OFFER_LIST so nothing
// regresses.
export const DEFAULT_OFFERS: Offer[] = OFFER_LIST.map((name, i) => ({
  id: null,
  name,
  default_price: null,
  currency: DEFAULT_CURRENCY,
  deliverables: null,
  notes: null,
  active: true,
  position: i,
}));

export function sortOffers(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function activeOfferNames(offers: Offer[]): string[] {
  return sortOffers(offers)
    .filter((o) => o.active && o.name.trim() !== "")
    .map((o) => o.name);
}

// Offer names for the pricing-floor list: keep configured offers, otherwise
// fall back to the built-in list so floors stay usable before any catalog save.
export function offerNamesForFloors(offers: Offer[]): string[] {
  const names = sortOffers(offers)
    .filter((o) => o.name.trim() !== "")
    .map((o) => o.name);
  return names.length > 0 ? names : [...OFFER_LIST];
}
