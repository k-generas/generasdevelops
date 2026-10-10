import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchPlaces } from "./places.server";
import { probeWebsite, analyzeWithAI, computeVisibility } from "./investigate.server";

export const runDiscovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
        location: z.string().trim().max(120).optional().default(""),
        maxResults: z.number().int().min(1).max(20).default(20),
        title: z.string().trim().max(160).optional(),
        rerunOf: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const textQuery = data.location ? `${data.query} in ${data.location}` : data.query;
    const title = data.title || `${data.query}${data.location ? ` in ${data.location}` : ""}`;

    const { data: run, error: runErr } = await supabase
      .from("discovery_runs")
      .insert({ owner_id: userId, query: data.query, location: data.location || null, title, status: "running", rerun_of: data.rerunOf ?? null })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);

    let places;
    try {
      places = await searchPlaces(textQuery, data.maxResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("discovery_runs").update({ status: "failed", error: msg, completed_at: new Date().toISOString() }).eq("id", run.id);
      throw new Error(msg);
    }

    const ids = places.map((p) => p.place_id);
    const { data: existing } = ids.length
      ? await supabase.from("businesses").select("id, place_id").in("place_id", ids)
      : { data: [] as { id: string; place_id: string }[] };
    const known = new Map((existing ?? []).map((r) => [r.place_id, r.id]));
    const fresh = places.filter((p) => !known.has(p.place_id));

    if (fresh.length) {
      const { data: inserted, error } = await supabase
        .from("businesses")
        .insert(fresh.map((p) => ({ ...p, owner_id: userId, discovery_run_id: run.id })))
        .select("id, place_id, name");
      if (error) throw new Error(error.message);
      for (const b of inserted ?? []) known.set(b.place_id, b.id);
      await supabase.from("business_activity_events").insert(
        (inserted ?? []).map((b) => ({
          owner_id: userId, business_id: b.id, event_type: "discovered",
          summary: `Discovered via search “${title}”`, ref_table: "discovery_runs", ref_id: run.id,
        })),
      );
    }

    const links = places.map((p) => ({ owner_id: userId, run_id: run.id, business_id: known.get(p.place_id)!, was_new: !fresh.some((f) => f.place_id === p.place_id) ? false : true }));
    if (links.length) await supabase.from("search_run_results").insert(links);

    await supabase
      .from("discovery_runs")
      .update({ status: "completed", results_count: places.length, new_count: fresh.length, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return { runId: run.id, found: places.length, added: fresh.length, duplicates: places.length - fresh.length };
  });

export const investigateBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ businessId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: biz, error } = await supabase.from("businesses").select("*").eq("id", data.businessId).single();
    if (error || !biz) throw new Error("Business not found");

    const site = await probeWebsite(biz.website);
    const visibility = computeVisibility(biz, site);
    const { owner_id, id, discovery_run_id, created_at, updated_at, status, score, last_opened_at, ...facts } = biz;
    let report;
    try {
      report = await analyzeWithAI(facts, site, visibility);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("business_activity_events").insert({ owner_id: userId, business_id: biz.id, event_type: "investigation_failed", summary: `Investigation failed: ${msg.slice(0, 200)}` });
      throw new Error(msg);
    }

    const { data: inv, error: insErr } = await supabase
      .from("investigations")
      .insert({
        owner_id: userId,
        business_id: biz.id,
        website_reachable: site.reachable,
        website_status: site.status,
        website_https: site.https,
        website_load_ms: site.load_ms,
        website_title: site.title,
        findings: { ...site, visibility } as any,
        report: report as any,
        score: report.score,
        recommended_offer: report.recommended_offer,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const mergedEmails = Array.from(new Set([...(biz.emails ?? []), ...site.emails]));
    const now = new Date().toISOString();
    await supabase
      .from("businesses")
      .update({
        status: "investigated", score: report.score, visibility_score: visibility.score,
        emails: mergedEmails, socials: site.socials as any, last_investigated_at: now, updated_at: now,
      })
      .eq("id", biz.id);
    await supabase.from("business_activity_events").insert({
      owner_id: userId, business_id: biz.id, event_type: "investigated",
      summary: `Investigated · score ${report.score} · visibility ${visibility.score} · ${report.problems.length} problems · offer: ${report.recommended_offer}${site.emails.length ? ` · ${site.emails.length} email(s) found` : ""}`,
      ref_table: "investigations", ref_id: inv.id,
    });
    return { score: report.score, investigationId: inv.id };
  });
