// Core Rwanda scan, extracted from the authenticated server function so the
// exact same bounded, de-duplicated scan can also run from the daily monitoring
// job (which has no user session and uses the service-role client).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { searchPlaces, type PlaceResult } from "./places.server";
import { recordPlaceChanges } from "./signals.server";
import { buildScanPlan, estimateScanCost, type ScanScope } from "./rwanda-scan";
import { dedupeBusinesses } from "./company-identity";
import { normalizeProvince, type IndustryKey } from "./rwanda";

export type SupabaseDb = SupabaseClient<Database>;

export type RwandaScanInput = {
  industries: IndustryKey[];
  national?: boolean | undefined;
  province?: string | undefined;
  districts?: string[] | undefined;
  maxQueries?: number | undefined;
  title?: string | undefined;
};

export type RwandaScanResult = {
  runId: string;
  scanId: string | null;
  queries: number;
  truncated: boolean;
  estimatedCostUsd: number;
  found: number;
  added: number;
  duplicatesWithinRun: number;
  duplicatesAgainstDb: number;
  failedQueries: number;
  newIds: string[];
  perQuery: { query: string; location: string; found: number; error: string | null }[];
};

// New profile columns added in migration 0008. The insert retries without them
// when the database predates the migration, so a scan never fails because of a
// missing column.
const NEW_PROFILE_COLUMNS = [
  "province",
  "district",
  "industry",
  "profile_confidence",
  "intel_updated_at",
] as const;

type Collected = PlaceResult & {
  industry: IndustryKey;
  province: string;
  district: string | null;
};

type ExistingRow = {
  id: string;
  place_id: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  rating?: number | null;
  review_count?: number | null;
  business_status?: string | null;
  reviews_last_90d?: number | null;
  open_now?: boolean | null;
  last_activity_at?: string | null;
  activity_checked_at?: string | null;
};

export async function performRwandaScan(
  supabase: SupabaseDb,
  userId: string,
  data: RwandaScanInput,
): Promise<RwandaScanResult> {
  const scope: ScanScope = data.national
    ? { kind: "national" }
    : data.districts && data.districts.length
      ? { kind: "districts", districts: data.districts }
      : data.province
        ? { kind: "provinces", provinces: [normalizeProvince(data.province) ?? "Kigali City"] }
        : { kind: "national" };

  const plan = buildScanPlan({ industries: data.industries, scope }, data.maxQueries ?? 10);
  if (plan.queries.length === 0) throw new Error("Nothing to scan: empty plan.");

  const title = data.title || `Rwanda scan · ${data.industries.join(", ")}`;

  // Group the run in the existing discovery_runs table.
  const { data: run, error: runErr } = await supabase
    .from("discovery_runs")
    .insert({
      owner_id: userId,
      query: title,
      location: scope.kind === "national" ? "Rwanda" : (data.province ?? "Rwanda"),
      title,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);

  // Durable scan bookkeeping (migration 0008). Absent table => skip silently.
  let scanId: string | null = null;
  {
    const { data: scan } = await supabase
      .from("source_scans")
      .insert({
        owner_id: userId,
        source_id: "google-maps",
        status: "running",
        cost_usd: estimateScanCost(plan.queries.length),
      })
      .select("id")
      .single();
    scanId = scan?.id ?? null;
  }

  const collected: Collected[] = [];
  const perQuery: { query: string; location: string; found: number; error: string | null }[] = [];

  for (const q of plan.queries) {
    const textQuery = q.location ? `${q.query} in ${q.location}` : q.query;
    try {
      const places = await searchPlaces(textQuery, 20);
      for (const p of places) {
        collected.push({
          ...p,
          industry: q.industry,
          province: q.province,
          district: q.district,
        });
      }
      perQuery.push({ query: q.query, location: q.location, found: places.length, error: null });
    } catch (e) {
      // A single failed query must not abort the whole run.
      perQuery.push({
        query: q.query,
        location: q.location,
        found: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Cross-query de-duplication (a company can appear under several searches).
  const { kept, duplicates } = dedupeBusinesses(collected);

  const ids = kept.map((p) => p.place_id);
  const EXISTING_COLUMNS =
    "id, place_id, name, website, phone, address, rating, review_count, business_status, reviews_last_90d, open_now, last_activity_at, activity_checked_at";
  const fullRes = ids.length
    ? await supabase.from("businesses").select(EXISTING_COLUMNS).in("place_id", ids)
    : null;
  let existing = (fullRes?.data ?? []) as ExistingRow[];
  if (
    fullRes?.error &&
    /column .* does not exist|could not find|schema cache/i.test(fullRes.error.message)
  ) {
    const fallback = ids.length
      ? await supabase.from("businesses").select("id, place_id").in("place_id", ids)
      : null;
    existing = (fallback?.data ?? []) as ExistingRow[];
  }
  const known = new Map(existing.map((r) => [r.place_id, r.id]));
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const fresh = kept.filter((p) => !known.has(p.place_id));

  if (fresh.length) {
    const now = new Date().toISOString();
    const rows = fresh.map((p) => ({
      ...p,
      owner_id: userId,
      discovery_run_id: run.id,
      industry: p.industry,
      province: p.province,
      district: p.district,
      profile_confidence: "single_source",
      intel_updated_at: now,
    }));
    type InsertedRow = { id: string; place_id: string };
    let inserted: InsertedRow[] = [];
    let insErr: string | null = null;
    {
      const res = await supabase
        .from("businesses")
        .insert(rows as never)
        .select("id, place_id");
      inserted = (res.data ?? []) as InsertedRow[];
      insErr = res.error?.message ?? null;
    }
    if (insErr && /column .*does not exist|could not find|schema cache/i.test(insErr)) {
      const stripped = rows.map((r) => {
        const c: Record<string, unknown> = { ...r };
        for (const k of NEW_PROFILE_COLUMNS) delete c[k];
        return c;
      });
      const res = await supabase
        .from("businesses")
        .insert(stripped as never)
        .select("id, place_id");
      inserted = (res.data ?? []) as InsertedRow[];
      insErr = res.error?.message ?? null;
    }
    if (insErr) {
      await supabase
        .from("discovery_runs")
        .update({ status: "failed", error: insErr, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      if (scanId)
        await supabase
          .from("source_scans")
          .update({ status: "failed", error: insErr, finished_at: new Date().toISOString() })
          .eq("id", scanId);
      throw new Error(insErr);
    }
    for (const b of inserted) known.set(b.place_id, b.id);
  }

  const links = kept
    .filter((p) => known.has(p.place_id))
    .map((p) => ({
      owner_id: userId,
      run_id: run.id,
      business_id: known.get(p.place_id)!,
      was_new: fresh.some((f) => f.place_id === p.place_id),
    }));
  if (links.length) await supabase.from("search_run_results").insert(links);

  const newIds = kept
    .filter((p) => fresh.some((f) => f.place_id === p.place_id))
    .map((p) => known.get(p.place_id)!)
    .filter(Boolean);

  const failed = perQuery.filter((q) => q.error).length;
  await supabase
    .from("discovery_runs")
    .update({
      status: failed === perQuery.length ? "failed" : "completed",
      results_count: kept.length,
      new_count: fresh.length,
      completed_at: new Date().toISOString(),
      error: failed ? `${failed}/${perQuery.length} queries failed` : null,
    })
    .eq("id", run.id);

  if (scanId)
    await supabase
      .from("source_scans")
      .update({
        status: failed === perQuery.length ? "failed" : "ok",
        items_found: kept.length,
        new_items: fresh.length,
        error: failed ? `${failed}/${perQuery.length} queries failed` : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", scanId);

  // Revisited companies: the scan already paid for this data, so use it to
  // refresh activity and record change signals.
  await Promise.allSettled(
    kept.flatMap((p) => {
      const before = existingById.get(known.get(p.place_id) ?? "");
      if (!before?.name) return [];
      return [recordPlaceChanges(supabase, userId, before, p)];
    }),
  );

  return {
    runId: run.id,
    scanId,
    queries: plan.queries.length,
    truncated: plan.truncated,
    estimatedCostUsd: plan.estimatedCostUsd,
    found: kept.length,
    added: fresh.length,
    duplicatesWithinRun: duplicates.length,
    duplicatesAgainstDb: kept.length - fresh.length,
    failedQueries: failed,
    newIds,
    perQuery,
  };
}
