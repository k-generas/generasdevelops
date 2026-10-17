const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

// Free fallback used only when the Lovable Google Maps connector is not present
// (e.g. running locally without the gateway keys). Sign up — no credit card — at
// https://myprojects.geoapify.com and set GEOAPIFY_API_KEY.
const GEOAPIFY_GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search";
export const GEOAPIFY_PLACE_ID_PREFIX = "geoapify:";

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

// Geoapify (OpenStreetMap-based) geocoding shape.
type GeoapifyContact = { phone?: string; website?: string; email?: string };
type GeoapifyProps = {
  place_id?: string;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  district?: string;
  country?: string;
  categories?: string[];
  result_type?: string;
  website?: string;
  phone?: string;
  contact?: GeoapifyContact;
  opening_hours?: string;
};
type GeoapifyFeature = {
  properties?: GeoapifyProps;
  geometry?: { coordinates?: number[] };
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

// ---------------------------------------------------------------------------
// Google (via the Lovable connector gateway). Used whenever the gateway keys
// are present — i.e. inside Lovable.
// ---------------------------------------------------------------------------
async function searchPlacesGoogle(
  textQuery: string,
  maxResults: number,
  lovableKey: string,
  mapsKey: string,
): Promise<PlaceResult[]> {
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

// ---------------------------------------------------------------------------
// Geoapify (OpenStreetMap). Free, no credit card — the local fallback.
// Geoapify has no ratings/reviews, so those signals come back null.
// ---------------------------------------------------------------------------
async function geoapifyFeatures(
  textQuery: string,
  maxResults: number,
  apiKey: string,
  amenityOnly: boolean,
): Promise<GeoapifyFeature[]> {
  const url = new URL(GEOAPIFY_GEOCODE_URL);
  url.searchParams.set("text", textQuery);
  url.searchParams.set("limit", String(maxResults));
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", apiKey);
  if (amenityOnly) url.searchParams.set("type", "amenity");
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403)
      throw new Error("Geoapify rejected the API key. Check GEOAPIFY_API_KEY.");
    if (res.status === 429)
      throw new Error("Geoapify is rate limited right now. Try again in a minute.");
    throw new Error(`Geoapify search failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { features?: GeoapifyFeature[] };
  return data.features ?? [];
}

function toGeoapifyPlace(f: GeoapifyFeature, checkedAt: string): PlaceResult | null {
  const p = f.properties ?? {};
  const name = (p.name ?? "").trim();
  if (!name) return null;
  const coords = f.geometry?.coordinates ?? [];
  const lon = typeof coords[0] === "number" ? coords[0] : null;
  const lat = typeof coords[1] === "number" ? coords[1] : null;
  const categories = p.categories ?? [];
  const category =
    (categories.length ? categories[categories.length - 1] : p.result_type)?.replace(/\./g, " ") ??
    null;
  const id = p.place_id
    ? `${GEOAPIFY_PLACE_ID_PREFIX}${p.place_id}`
    : `${GEOAPIFY_PLACE_ID_PREFIX}${lat ?? "?"},${lon ?? "?"}`;
  return {
    place_id: id,
    name,
    address: p.formatted ?? p.address_line1 ?? null,
    phone: p.contact?.phone ?? p.phone ?? null,
    website: p.website ?? p.contact?.website ?? null,
    maps_url:
      lat != null && lon != null
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
        : null,
    category,
    rating: null,
    review_count: null,
    business_status: null,
    latitude: lat,
    longitude: lon,
    activity_checked_at: checkedAt,
    last_activity_at: null,
    reviews_last_90d: null,
    recent_reviews: [],
    open_now: null,
    opening_hours: { weekday_descriptions: p.opening_hours ? [p.opening_hours] : null },
  };
}

async function searchPlacesGeoapify(
  textQuery: string,
  maxResults: number,
  apiKey: string,
): Promise<PlaceResult[]> {
  // Prefer amenity (business) results; if the query is too broad and that returns
  // nothing, retry unfiltered and keep whatever has a name.
  let features = await geoapifyFeatures(textQuery, maxResults, apiKey, true);
  if (features.length === 0)
    features = await geoapifyFeatures(textQuery, maxResults, apiKey, false);
  const checkedAt = new Date().toISOString();
  return features
    .map((f) => toGeoapifyPlace(f, checkedAt))
    .filter((p): p is PlaceResult => p !== null)
    .slice(0, maxResults);
}

// Provider selection: the Lovable Google Maps connector wins when configured,
// otherwise Geoapify makes local discovery work.
export async function searchPlaces(textQuery: string, maxResults: number): Promise<PlaceResult[]> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (lovableKey && mapsKey) return searchPlacesGoogle(textQuery, maxResults, lovableKey, mapsKey);

  const geoKey = process.env["GEOAPIFY_API_KEY"];
  if (geoKey) return searchPlacesGeoapify(textQuery, maxResults, geoKey);

  throw new Error(
    "No places provider is configured. Connect Google Maps in Lovable, or set GEOAPIFY_API_KEY for local runs.",
  );
}
