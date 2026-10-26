// Change detection for saved businesses. A discovery/monitoring scan already
// paid for the fresh place data, so comparing it with what we stored turns that
// same response into company_events without any extra API call.
export type BusinessSnapshot = {
  id: string;
  name: string;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  review_count?: number | null;
  business_status?: string | null;
  reviews_last_90d?: number | null;
  open_now?: boolean | null;
  last_activity_at?: string | null;
  activity_checked_at?: string | null;
};

export type ObservedPlace = {
  place_id: string;
  name: string;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
  rating: number | null;
  review_count: number | null;
  business_status: string | null;
  activity_checked_at: string;
  last_activity_at: string | null;
  reviews_last_90d: number | null;
  recent_reviews: unknown;
  open_now: boolean | null;
  opening_hours: unknown;
};

export type PlaceChange = {
  kind: "rating" | "reviews" | "status" | "website" | "phone";
  title: string;
  summary: string;
  dedupeKey: string;
  details: Record<string, unknown>;
};

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

function domainOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

export function detectPlaceChanges(before: BusinessSnapshot, place: ObservedPlace): PlaceChange[] {
  const changes: PlaceChange[] = [];
  const day = place.activity_checked_at.slice(0, 10);
  const id = before.id;

  const prevStatus = before.business_status ?? null;
  const nextStatus = place.business_status ?? null;
  if (prevStatus && nextStatus && prevStatus !== nextStatus) {
    const closed = nextStatus === "CLOSED_PERMANENTLY" || nextStatus === "CLOSED_TEMPORARILY";
    const reopened = prevStatus !== "OPERATIONAL" && nextStatus === "OPERATIONAL";
    const title = closed
      ? `${before.name} is marked ${nextStatus === "CLOSED_PERMANENTLY" ? "permanently" : "temporarily"} closed`
      : reopened
        ? `${before.name} is open again`
        : `${before.name} status changed to ${nextStatus.replace(/_/g, " ").toLowerCase()}`;
    changes.push({
      kind: "status",
      title,
      summary: title,
      dedupeKey: `status:${id}:${nextStatus}`,
      details: { before: prevStatus, after: nextStatus },
    });
  }

  if (
    typeof before.rating === "number" &&
    typeof place.rating === "number" &&
    Math.abs(before.rating - place.rating) >= 0.1
  ) {
    changes.push({
      kind: "rating",
      title: `${before.name} rating moved to ${place.rating.toFixed(1)}`,
      summary: `Google rating changed ${before.rating.toFixed(1)} → ${place.rating.toFixed(1)}.`,
      dedupeKey: `rating:${id}:${place.rating.toFixed(1)}:${day}`,
      details: { before: before.rating, after: place.rating },
    });
  }

  if (
    typeof before.review_count === "number" &&
    typeof place.review_count === "number" &&
    place.review_count - before.review_count >= 3
  ) {
    const added = place.review_count - before.review_count;
    changes.push({
      kind: "reviews",
      title: `${before.name} gained ${added} review${added === 1 ? "" : "s"}`,
      summary: `Review count rose from ${before.review_count} to ${place.review_count}.`,
      dedupeKey: `reviews:${id}:${place.review_count}`,
      details: { before: before.review_count, after: place.review_count },
    });
  }

  if (place.website && !sameValue(before.website, place.website)) {
    changes.push({
      kind: "website",
      title: before.website
        ? `${before.name} website changed to ${domainOf(place.website)}`
        : `${before.name} now has a website (${domainOf(place.website)})`,
      summary: before.website
        ? `Website on the Google listing changed to ${place.website}.`
        : `A website appeared on the Google listing: ${place.website}.`,
      dedupeKey: `website:${id}:${domainOf(place.website)}`,
      details: { before: before.website ?? null, after: place.website },
    });
  }

  if (place.phone && !sameValue(before.phone, place.phone)) {
    changes.push({
      kind: "phone",
      title: before.phone
        ? `${before.name} phone changed to ${place.phone}`
        : `${before.name} now has a phone number`,
      summary: before.phone
        ? `Phone on the Google listing changed to ${place.phone}.`
        : `A phone number appeared on the Google listing: ${place.phone}.`,
      dedupeKey: `phone:${id}:${place.phone.replace(/[^\d+]/g, "")}`,
      details: { before: before.phone ?? null, after: place.phone },
    });
  }

  return changes;
}

export type BusinessPlaceUpdate = {
  activity_checked_at: string;
  last_activity_at: string | null;
  reviews_last_90d: number | null;
  recent_reviews: unknown;
  open_now: boolean | null;
  opening_hours: unknown;
  updated_at: string;
  rating?: number;
  review_count?: number;
  business_status?: string;
  website?: string;
  website_source?: string;
  website_checked_at?: string;
  phone?: string;
};

// Always refresh the measured activity fields. Contact details are only filled
// when empty so a verified website/phone is never overwritten by a listing.
export function placeUpdate(place: ObservedPlace, before?: BusinessSnapshot): BusinessPlaceUpdate {
  const update: BusinessPlaceUpdate = {
    activity_checked_at: place.activity_checked_at,
    last_activity_at: place.last_activity_at,
    reviews_last_90d: place.reviews_last_90d,
    recent_reviews: place.recent_reviews,
    open_now: place.open_now,
    opening_hours: place.opening_hours,
    updated_at: place.activity_checked_at,
  };
  if (typeof place.rating === "number") update.rating = place.rating;
  if (typeof place.review_count === "number") update.review_count = place.review_count;
  if (place.business_status) update.business_status = place.business_status;
  if (before && !before.website && place.website) {
    update.website = place.website;
    update.website_source = "google_maps";
    update.website_checked_at = place.activity_checked_at;
  }
  if (before && !before.phone && place.phone) update.phone = place.phone;
  return update;
}
