import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFERS,
  activeOfferNames,
  offerNamesForFloors,
  sortOffers,
  type Offer,
} from "@/lib/offers";
import { OFFER_LIST } from "@/lib/pricing";

function offer(over: Partial<Offer>): Offer {
  return {
    id: null,
    name: "X",
    default_price: null,
    currency: "USD",
    deliverables: null,
    notes: null,
    active: true,
    position: 0,
    ...over,
  };
}

describe("offers", () => {
  it("seeds defaults from the built-in offer list", () => {
    expect(DEFAULT_OFFERS.map((o) => o.name)).toEqual([...OFFER_LIST]);
    expect(DEFAULT_OFFERS.every((o) => o.id === null)).toBe(true);
  });

  it("sorts by position then name", () => {
    const sorted = sortOffers([
      offer({ name: "B", position: 2 }),
      offer({ name: "A", position: 1 }),
      offer({ name: "C", position: 1 }),
    ]);
    expect(sorted.map((o) => o.name)).toEqual(["A", "C", "B"]);
  });

  it("drops inactive and blank offers from the active names", () => {
    expect(
      activeOfferNames([
        offer({ name: "Keep", active: true, position: 0 }),
        offer({ name: "Drop", active: false, position: 1 }),
        offer({ name: "   ", active: true, position: 2 }),
      ]),
    ).toEqual(["Keep"]);
  });

  it("falls back to the built-in list when no offers are configured", () => {
    expect(offerNamesForFloors([])).toEqual([...OFFER_LIST]);
    expect(offerNamesForFloors([offer({ name: "Custom" })])).toEqual(["Custom"]);
  });
});
