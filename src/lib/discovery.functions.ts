import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchPlaces } from "./places.server";
import { probeWebsite, analyzeWithAI } from "./investigate.server";

export const runDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
        location: z.string().trim().max(120).optional().default(""),
        maxResults: z.number().int().min(1).max(20).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const textQuery = data.location ? `${data.query} in ${data.location}` : data.query;

    let places;
    try {
      places = await searchPlaces(textQuery, data.maxResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("discovery_runs").insert({ owner_id: userId, query: data.query, location: data.location || null, status: "failed", error: msg });
      throw new Error(msg);
    }

    const { data: run, error: runErr } = await supabase
      .from("discovery_runs")
      .insert({ owner_id: userId, query: data.query, location: data.location || null, results_count: places.length })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);

    const ids = places.map((p) => p.place_id);
    const { data: existing } = ids.length
      ? await supabase.from("businesses").select("place_id").in("place_id", ids)
      : { data: [] as { place_id: string }[] };
    const known = new Set((existing ?? []).map((r) => r.place_id));
    const fresh = places.filter((p) => !known.has(p.place_id));

    if (fresh.length) {
      const { error } = await supabase
        .from("businesses")
        .insert(fresh.map((p) => ({ ...p, owner_id: userId, discovery_run_id: run.id })));
      if (error) throw new Error(error.message);
    }
    await supabase.from("discovery_runs").update({ new_count: fresh.length }).eq("id", run.id);
    return { found: places.length, added: fresh.length, duplicates: places.length - fresh.length };
  });

export const investigateBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ businessId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: biz, error } = await supabase.from("businesses").select("*").eq("id", data.businessId).single();
    if (error || !biz) throw new Error("Business not found");

    const site = await probeWebsite(biz.website);
    const { owner_id, id, discovery_run_id, created_at, updated_at, status, score, ...facts } = biz;
    const report = await analyzeWithAI(facts, site);

    const { error: insErr } = await supabase.from("investigations").insert({
      owner_id: userId,
      business_id: biz.id,
      website_reachable: site.reachable,
      website_status: site.status,
      website_https: site.https,
      website_load_ms: site.load_ms,
      website_title: site.title,
      findings: site as any,
      report: report as any,
      score: report.score,
      recommended_offer: report.recommended_offer,
    });
    if (insErr) throw new Error(insErr.message);
    await supabase
      .from("businesses")
      .update({ status: "investigated", score: report.score, updated_at: new Date().toISOString() })
      .eq("id", biz.id);
    return { score: report.score };
  });
