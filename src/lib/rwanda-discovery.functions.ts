import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchPlaces } from "./places.server";
import { buildScanPlan, estimateScanCost, type ScanScope } from "./rwanda-scan";
import { dedupeBusinesses } from "./company-identity";
import { normalizeProvince, type IndustryKey } from "./rwanda";

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

const INDUSTRY_KEYS = [
  "manufacturing",
  "wholesale_retail",
  "agriculture",
  "construction",
  "transport",
  "hospitality",
  "health",
  "education",
  "finance",
  "technology",
  "professional",
  "trade",
  "energy_mining",
  "other",
] as const;

type Collected = {
  place_id: string;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  industry: IndustryKey;
  province: string;
  district: string | null;
  [key: string]: unknown;
};

export const runRwandaScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        industries: z.array(z.enum(INDUSTRY_KEYS)).min(1).max(14),
        national: z.boolean().optional().default(false),
        province: z.string().trim().max(60).optional(),
        districts: z.array(z.string().trim().max(60)).max(30).optional(),
        maxQueries: z.number().int().min(1).max(10).optional(),
        title: z.string().trim().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
          } as Collected);
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
    const { data: existing } = ids.length
      ? await supabase.from("businesses").select("id, place_id").in("place_id", ids)
      : { data: [] as { id: string; place_id: string }[] };
    const known = new Map((existing ?? []).map((r) => [r.place_id, r.id]));
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

    return {
      runId: run.id,
      queries: plan.queries.length,
      truncated: plan.truncated,
      estimatedCostUsd: plan.estimatedCostUsd,
      found: kept.length,
      added: fresh.length,
      duplicatesWithinRun: duplicates.length,
      duplicatesAgainstDb: kept.length - fresh.length,
      failedQueries: failed,
      perQuery,
    };
  });
