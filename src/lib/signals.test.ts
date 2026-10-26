import { describe, expect, it } from "vitest";
import {
  detectPlaceChanges,
  placeUpdate,
  type BusinessSnapshot,
  type ObservedPlace,
} from "@/lib/signals";

const BEFORE: BusinessSnapshot = {
  id: "biz-1",
  name: "Acme Ltd",
  phone: "+250788000000",
  website: "https://acme.rw",
  rating: 4.2,
  review_count: 10,
  business_status: "OPERATIONAL",
  activity_checked_at: "2026-10-01T00:00:00.000Z",
};

function place(over: Partial<ObservedPlace> = {}): ObservedPlace {
  return {
    place_id: "p1",
    name: "Acme Ltd",
    phone: "+250788000000",
    website: "https://acme.rw",
    maps_url: "https://maps.google.com/acme",
    rating: 4.2,
    review_count: 10,
    business_status: "OPERATIONAL",
    activity_checked_at: "2026-10-26T09:00:00.000Z",
    last_activity_at: "2026-10-20T00:00:00.000Z",
    reviews_last_90d: 2,
    recent_reviews: [],
    open_now: true,
    opening_hours: { weekday_descriptions: [] },
    ...over,
  };
}

describe("detectPlaceChanges", () => {
  it("returns no changes when the measured listing is unchanged", () => {
    expect(detectPlaceChanges(BEFORE, place())).toEqual([]);
  });

  it("records closure, rating, review, website and phone changes", () => {
    const changes = detectPlaceChanges(
      BEFORE,
      place({
        business_status: "CLOSED_PERMANENTLY",
        rating: 4.5,
        review_count: 18,
        website: "https://new-acme.rw",
        phone: "+250788999999",
      }),
    );
    expect(changes.map((c) => c.kind).sort()).toEqual([
      "phone",
      "rating",
      "reviews",
      "status",
      "website",
    ]);
    expect(changes.find((c) => c.kind === "status")?.title).toContain("permanently closed");
    expect(changes.find((c) => c.kind === "reviews")?.title).toContain("8 reviews");
    expect(changes.find((c) => c.kind === "website")?.dedupeKey).toBe("website:biz-1:new-acme.rw");
  });

  it("does not invent a baseline event when the previous value was unknown", () => {
    const changes = detectPlaceChanges(
      { ...BEFORE, rating: null, review_count: null, business_status: null },
      place({ rating: 4.9, review_count: 100, business_status: "CLOSED_TEMPORARILY" }),
    );
    expect(changes).toEqual([]);
  });

  it("ignores single-review noise", () => {
    const changes = detectPlaceChanges(BEFORE, place({ review_count: 11 }));
    expect(changes).toEqual([]);
  });
});

describe("placeUpdate", () => {
  it("refreshes activity fields but only fills missing contact details", () => {
    const update = placeUpdate(
      place({ website: "https://new-acme.rw", phone: "+250788999999", rating: 4.4 }),
      BEFORE,
    );
    expect(update.rating).toBe(4.4);
    expect(update.website).toBeUndefined();
    expect(update.phone).toBeUndefined();
    expect(update.open_now).toBe(true);
  });

  it("fills a website and phone when the saved record had none", () => {
    const update = placeUpdate(place(), { ...BEFORE, website: null, phone: null });
    expect(update.website).toBe("https://acme.rw");
    expect(update.website_source).toBe("google_maps");
    expect(update.phone).toBe("+250788000000");
  });
});
