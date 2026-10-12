// Pricing rules shared by the server (enforcement) and the owner UI (Settings +
// proposal form). Kept dependency-free so it is easy to unit test.

export const OFFER_LIST = [
  "Website Development",
  "Website Redesign",
  "Website Performance Improvement",
  "Business Automation",
  "Custom Software",
  "DukaLinka",
  "Digital Product",
  "Digital Service",
] as const;

export type OfferName = (typeof OFFER_LIST)[number];

export const DEFAULT_CURRENCY = "USD";

export type MinPrices = Record<string, number>;

// user_preferences.min_prices is stored as JSON; tolerate anything and keep only
// non-negative numbers so a bad value can never disable the safety floor.
export function parseMinPrices(value: unknown): MinPrices {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: MinPrices = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

export function minPriceFor(offer: string | null | undefined, minPrices: MinPrices): number | null {
  if (!offer) return null;
  const v = minPrices[offer];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type PriceCheck =
  { ok: true; floor: number | null } | { ok: false; floor: number; message: string };

// A price is only rejected when an explicit price is below the owner's floor.
// No floor, or no price, is always allowed (auto-drafts leave price to confirm).
export function checkPrice(
  price: number | null | undefined,
  offer: string | null | undefined,
  minPrices: MinPrices,
): PriceCheck {
  const floor = minPriceFor(offer, minPrices);
  if (price == null || floor == null) return { ok: true, floor };
  if (price < floor) {
    return {
      ok: false,
      floor,
      message: `Price ${price} is below your minimum of ${floor} for ${offer}. Raise the price or lower the minimum in Settings.`,
    };
  }
  return { ok: true, floor };
}
