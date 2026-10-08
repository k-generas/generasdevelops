const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

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
};

const FIELDS = [
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
].join(",");

export async function searchPlaces(textQuery: string, maxResults: number): Promise<PlaceResult[]> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !mapsKey) throw new Error("Google Maps connection is not configured.");

  const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": mapsKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": FIELDS,
    },
    body: JSON.stringify({ textQuery, pageSize: maxResults }),
  });

  if (res.status === 403) {
    const body = await res.text();
    throw new Error(`Google Maps denied the request (403): ${body.slice(0, 300)}`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Maps search failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { places?: any[] };
  return (data.places ?? []).map((p) => ({
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
  }));
}
