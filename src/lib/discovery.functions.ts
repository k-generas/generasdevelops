import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { searchPlaces } from "./places.server";
import { probeWebsite, analyzeWithAI, computeVisibility } from "./investigate.server";
import { verifyWebsite } from "./website-finder.server";
import { createProposal } from "./proposals.server";

// Columns added in migration 0003 — stripped on retry if the DB predates them.
const ACTIVITY_COLUMNS = [
  "activity_checked_at",
  "last_activity_at",
  "reviews_last_90d",
  "recent_reviews",
  "open_now",
  "opening_hours",
] as const;

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
      .insert({
        owner_id: userId,
        query: data.query,
        location: data.location || null,
        title,
        status: "running",
        rerun_of: data.rerunOf ?? null,
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);

    let places;
    try {
      places = await searchPlaces(textQuery, data.maxResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("discovery_runs")
        .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      throw new Error(msg);
    }

    const ids = places.map((p) => p.place_id);
    const { data: existing } = ids.length
      ? await supabase.from("businesses").select("id, place_id").in("place_id", ids)
      : { data: [] as { id: string; place_id: string }[] };
    const known = new Map((existing ?? []).map((r) => [r.place_id, r.id]));
    const fresh = places.filter((p) => !known.has(p.place_id));

    if (fresh.length) {
      const rows = fresh.map((p) => ({ ...p, owner_id: userId, discovery_run_id: run.id }));
      type InsertedRow = { id: string; place_id: string; name: string };
      let inserted: InsertedRow[] = [];
      let insErr: string | null = null;
      {
        const res = await supabase.from("businesses").insert(rows).select("id, place_id, name");
        inserted = (res.data ?? []) as InsertedRow[];
        insErr = res.error?.message ?? null;
      }
      // Older databases may not have the activity-signal columns yet; retry without them
      // so discovery still works until the migration is applied.
      if (insErr && /column .*does not exist|could not find|schema cache/i.test(insErr)) {
        const stripped = rows.map((r) => {
          const c: Record<string, unknown> = { ...r };
          for (const k of ACTIVITY_COLUMNS) delete c[k];
          return c;
        });
        const res = await supabase
          .from("businesses")
          .insert(stripped as never)
          .select("id, place_id, name");
        inserted = (res.data ?? []) as InsertedRow[];
        insErr = res.error?.message ?? null;
      }
      if (insErr) throw new Error(insErr);
      for (const b of inserted) known.set(b.place_id, b.id);
      await supabase.from("business_activity_events").insert(
        inserted.map((b) => ({
          owner_id: userId,
          business_id: b.id,
          event_type: "discovered",
          summary: `Discovered via search “${title}”`,
          ref_table: "discovery_runs",
          ref_id: run.id,
        })),
      );
    }

    const links = places.map((p) => ({
      owner_id: userId,
      run_id: run.id,
      business_id: known.get(p.place_id)!,
      was_new: !fresh.some((f) => f.place_id === p.place_id) ? false : true,
    }));
    if (links.length) await supabase.from("search_run_results").insert(links);

    await supabase
      .from("discovery_runs")
      .update({
        status: "completed",
        results_count: places.length,
        new_count: fresh.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return {
      runId: run.id,
      found: places.length,
      added: fresh.length,
      duplicates: places.length - fresh.length,
    };
  });

export const investigateBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        businessId: z.string().uuid(),
        provider: z.enum(["auto", "openai", "gemini", "lovable"]).default("auto"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: biz, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", data.businessId)
      .single();
    if (error || !biz) throw new Error("Business not found");

    // Double-check the website before trusting "no website" from the listing.
    const check = await verifyWebsite(biz);
    if (check.website && check.website !== biz.website) {
      biz.website = check.website;
      await supabase.from("business_activity_events").insert({
        owner_id: userId,
        business_id: biz.id,
        event_type: "website_found",
        summary: `Website found by double-check (${check.source}): ${check.website}`,
      });
    }
    const site = await probeWebsite(biz.website);
    const visibility = computeVisibility(biz, site);
    const {
      owner_id,
      id,
      discovery_run_id,
      created_at,
      updated_at,
      status,
      score,
      last_opened_at,
      website_check: _wc,
      ...facts
    } = biz;
    (facts as unknown as Record<string, unknown>)["website_check"] = {
      confidence: check.confidence,
      source: check.source,
      steps: check.steps,
    };
    let report;
    try {
      report = await analyzeWithAI(facts, site, visibility, data.provider);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("business_activity_events").insert({
        owner_id: userId,
        business_id: biz.id,
        event_type: "investigation_failed",
        summary: `Investigation failed: ${msg.slice(0, 200)}`,
      });
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
        findings: { ...site, visibility } as unknown as Json,
        report: report as unknown as Json,
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
        status: "investigated",
        score: report.score,
        visibility_score: visibility.score,
        emails: mergedEmails,
        socials: site.socials as unknown as Json,
        last_investigated_at: now,
        updated_at: now,
        website: check.website,
        website_source: check.source,
        website_checked_at: now,
        website_check: {
          confidence: check.confidence,
          source: check.source,
          steps: check.steps,
        } as unknown as Json,
      })
      .eq("id", biz.id);
    await supabase.from("business_activity_events").insert({
      owner_id: userId,
      business_id: biz.id,
      event_type: "investigated",
      summary: `Investigated · score ${report.score} · visibility ${visibility.score} · ${report.problems.length} problems · offer: ${report.recommended_offer}${site.emails.length ? ` · ${site.emails.length} email(s) found` : ""}`,
      ref_table: "investigations",
      ref_id: inv.id,
    });
    // Auto-draft a first-contact proposal for every investigated business that fits an offer.
    // Never auto-draft for a permanently closed business.
    const permanentlyClosed = biz.business_status === "CLOSED_PERMANENTLY";
    if (permanentlyClosed) {
      await supabase.from("business_activity_events").insert({
        owner_id: userId,
        business_id: biz.id,
        event_type: "closed",
        summary: "Flagged as permanently closed on Google — no outreach proposal drafted.",
      });
    }
    let proposalId: string | null = null;
    let proposalError: string | null = null;
    if (!permanentlyClosed && !report.recommended_offer.startsWith("No offer")) {
      try {
        const r = await createProposal(supabase, userId, {
          businessId: biz.id,
          mode: "First-contact message",
          channel: mergedEmails.length ? "Email" : "WhatsApp",
          language: "English",
          tone: "Professional",
          offer: report.recommended_offer,
          currency: "USD",
          auto: true,
          provider: data.provider,
        });
        proposalId = r.proposalId;
      } catch (e) {
        proposalError = e instanceof Error ? e.message : String(e);
      }
    }
    return {
      score: report.score,
      investigationId: inv.id,
      proposalId,
      proposalError,
      websiteCheck: check.confidence,
    };
  });
