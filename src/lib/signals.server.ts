// Persists place-change signals. Called from discovery and Rwanda scan when a paid
// search already returned fresh data for a business we have stored.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  detectPlaceChanges,
  placeUpdate,
  type BusinessPlaceUpdate,
  type BusinessSnapshot,
  type ObservedPlace,
} from "./signals";

type Db = SupabaseClient<Database>;

const MISSING_COLUMN = /column .* does not exist|could not find|schema cache/i;

export async function recordPlaceChanges(
  db: Db,
  ownerId: string,
  before: BusinessSnapshot,
  place: ObservedPlace,
): Promise<{ updated: boolean; created: number }> {
  const changes = detectPlaceChanges(before, place);
  const update = placeUpdate(place, before);

  let updated = false;
  let result = await db
    .from("businesses")
    .update(update as never)
    .eq("id", before.id)
    .eq("owner_id", ownerId);
  if (result.error && MISSING_COLUMN.test(result.error.message)) {
    // Older database: still keep the core signals rather than failing the scan.
    const minimal: Partial<BusinessPlaceUpdate> = {};
    if (update.rating !== undefined) minimal.rating = update.rating;
    if (update.review_count !== undefined) minimal.review_count = update.review_count;
    if (update.business_status !== undefined) minimal.business_status = update.business_status;
    if (Object.keys(minimal).length) {
      result = await db
        .from("businesses")
        .update(minimal as never)
        .eq("id", before.id)
        .eq("owner_id", ownerId);
    }
  }
  updated = !result.error;

  let created = 0;
  for (const change of changes) {
    const { data: existing, error: findError } = await db
      .from("company_events")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("dedupe_key", change.dedupeKey)
      .maybeSingle();
    if (findError) break; // table absent on an older database
    if (existing) continue;

    const { error: insertError } = await db.from("company_events").insert({
      owner_id: ownerId,
      business_id: before.id,
      event_kind: "change",
      title: change.title,
      status: "active",
      source_id: "google-maps",
      source_url: place.maps_url,
      source_date: place.activity_checked_at,
      dedupe_key: change.dedupeKey,
      details: change.details as unknown as Json,
    });
    if (insertError) continue; // duplicate race or table missing

    created += 1;
    await db.from("business_activity_events").insert({
      owner_id: ownerId,
      business_id: before.id,
      event_type: "signal",
      summary: change.summary,
      details: change.details as unknown as Json,
    });
  }

  return { updated, created };
}
