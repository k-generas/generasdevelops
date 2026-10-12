const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type RecentReview = {
  rating: number | null;
  text: string | null;
  author: string | null;
  // RFC3339 timestamp of when the review was published (used as a "still active" signal).
  publish_time: string | null;
};

export type PlaceResult = {
  place_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  maps_url: string | null;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  business_status: string | null;
  latitude: number | null;
  longitude: number | null;
  // Activity / closure signals (captured so closed or recently-quiet places can be flagged).
  activity_checked_at: string;
  last_activity_at: string | null;
  reviews_last_90d: number | null;
  recent_reviews: RecentReview[];
  open_now: boolean | null;
  opening_hours: { weekday_descriptions: string[] | null };
};

export type OpeningHours = {
  openNow?: boolean;
  weekdayDescriptions?: string[];
};

type RawReview = {
  rating?: number;
  text?: { text?: string };
  authorAttribution?: { displayName?: string };
  publishTime?: string;
};

type RawPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
  reviews?: RawReview[];
  regularOpeningHours?: OpeningHours;
  currentOpeningHours?: OpeningHours;
};

const BASE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.location",
];

// Extra fields used for the "last activity" / closure signals. If the gateway
// rejects them we fall back to BASE_FIELDS and still return the businesses.
const ACTIVITY_FIELDS = [
  "places.reviews",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
];

const MAX_REVIEWS = 5;
const RECENT_WINDOW_DAYS = 90;

function toRecentReviews(raw: RawReview[] | undefined): RecentReview[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_REVIEWS).map((r) => ({
    rating: typeof r?.rating === "number" ? r.rating : null,
    text: typeof r?.text?.text === "string" ? r.text.text.slice(0, 500) : null,
    author: r?.authorAttribution?.displayName ?? null,
    publish_time: typeof r?.publishTime === "string" ? r.publishTime : null,
  }));
}

function activityFromReviews(reviews: RecentReview[]): {
  last_activity_at: string | null;
  reviews_last_90d: number | null;
} {
  const times = reviews
    .map((r) => (r.publish_time ? Date.parse(r.publish_time) : NaN))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return { last_activity_at: null, reviews_last_90d: null };
  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return {
    last_activity_at: new Date(Math.max(...times)).toISOString(),
    reviews_last_90d: times.filter((t) => t >= cutoff).length,
  };
}

function hoursOf(
  regular?: OpeningHours,
  current?: OpeningHours,
): { open_now: boolean | null; opening_hours: { weekday_descriptions: string[] | null } } {
  const weekday = regular?.weekdayDescriptions ?? current?.weekdayDescriptions ?? null;
  const openNow =
    typeof current?.openNow === "boolean"
      ? current.openNow
      : typeof regular?.openNow === "boolean"
        ? regular.openNow
        : null;
  return { open_now: openNow, opening_hours: { weekday_descriptions: weekday } };
}

export async function searchPlaces(textQuery: string, maxResults: number): Promise<PlaceResult[]> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !mapsKey) throw new Error("Google Maps connection is not configured.");

  const call = (fields: string[]) =>
    fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": fields.join(","),
      },
      body: JSON.stringify({ textQuery, pageSize: maxResults }),
    });

  let res = await call([...BASE_FIELDS, ...ACTIVITY_FIELDS]);
  if (res.status === 400) {
    // Gateway/API may not allow the activity fields — retry without them.
    res = await call(BASE_FIELDS);
  }
  if (res.status === 403) {
    const body = await res.text();
    throw new Error(`Google Maps denied the request (403): ${body.slice(0, 300)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Maps search failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { places?: RawPlace[] };
  const checkedAt = new Date().toISOString();
  return (data.places ?? []).map((p) => {
    const recent_reviews = toRecentReviews(p.reviews);
    const { last_activity_at, reviews_last_90d } = activityFromReviews(recent_reviews);
    const { open_now, opening_hours } = hoursOf(p.regularOpeningHours, p.currentOpeningHours);
    return {
      place_id: p.id,
      name: p.displayName?.text ?? "Unnamed",
      address: p.formattedAddress ?? null,
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      maps_url: p.googleMapsUri ?? null,
      category: p.primaryTypeDisplayName?.text ?? null,
      rating: typeof p.rating === "number" ? p.rating : null,
      review_count: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
      business_status: p.businessStatus ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      activity_checked_at: checkedAt,
      last_activity_at,
      reviews_last_90d,
      recent_reviews,
      open_now,
      opening_hours,
    };
  });
}
