import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { searchPlaces } from "./places.server";
import { probeWebsite, analyzeWithAI, computeVisibility } from "./investigate.server";
import { verifyWebsite } from "./website-finder.server";
import { sameBusinessRecord } from "./company-identity";
import { recordPlaceChanges } from "./signals.server";

// Website verification runs inside discovery so we never claim a business has
// no website when it actually has one. It is time-boxed so a run always returns;
// anything not reached stays "unchecked" rather than being falsely confirmed.
const VERIFY_BUDGET_MS = 15_000;
const VERIFY_CONCURRENCY = 4;
const VERIFY_MAX_DOMAINS = 6;
const VERIFY_PER_REQUEST_MS = 4_000;

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

    const markFailed = async (msg: string) => {
      await supabase
        .from("discovery_runs")
        .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
        .eq("id", run.id);
    };

    let places;
    try {
      places = await searchPlaces(textQuery, data.maxResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A fresh serverless isolate can briefly miss the Google Maps connector
      // env. Retrying costs nothing when there is no provider (no paid call is
      // made), and clears the transient failure that otherwise looks scary.
      if (!/no places provider is configured/i.test(msg)) {
        await markFailed(msg);
        throw new Error(msg);
      }
      await new Promise((r) => setTimeout(r, 1500));
      try {
        places = await searchPlaces(textQuery, data.maxResults);
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        await markFailed(msg2);
        throw new Error(msg2);
      }
    }

    // Load everything already known so a business is never counted twice: first
    // by Google place_id, then by domain/phone/name identity, so the same lead
    // reached through another source (or an earlier run) is not re-added.
    type KnownBusiness = {
      id: string;
      place_id: string | null;
      name: string;
      website: string | null;
      phone: string | null;
      address: string | null;
      rating?: number | null;
      review_count?: number | null;
      business_status?: string | null;
      reviews_last_90d?: number | null;
      open_now?: boolean | null;
      last_activity_at?: string | null;
      activity_checked_at?: string | null;
    };
    const EXISTING_COLUMNS =
      "id, place_id, name, website, phone, address, rating, review_count, business_status, reviews_last_90d, open_now, last_activity_at, activity_checked_at";
    const BASE_COLUMNS = "id, place_id, name, website, phone, address";
    async function loadKnown(columns: string): Promise<KnownBusiness[]> {
      const rows: KnownBusiness[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("businesses")
          .select(columns)
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as unknown as KnownBusiness[];
        rows.push(...batch);
        if (batch.length < 1000) break;
      }
      return rows;
    }
    let existing: KnownBusiness[];
    try {
      existing = await loadKnown(EXISTING_COLUMNS);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/column .* does not exist|could not find|schema cache/i.test(message)) {
        throw new Error(message);
      }
      existing = await loadKnown(BASE_COLUMNS);
    }
    const knownByPlaceId = new Map<string, string>();
    const existingById = new Map(existing.map((e) => [e.id, e]));
    for (const e of existing) if (e.place_id) knownByPlaceId.set(e.place_id, e.id);

    // place_id -> resolved business id (existing match or newly inserted row).
    const resolved = new Map<string, string>();
    const fresh: typeof places = [];
    for (const p of places) {
      const byPlace = knownByPlaceId.get(p.place_id);
      if (byPlace) {
        resolved.set(p.place_id, byPlace);
        continue;
      }
      const dup = existing.find((e) => sameBusinessRecord(e, p));
      if (dup) {
        resolved.set(p.place_id, dup.id);
        continue;
      }
      if (fresh.some((f) => sameBusinessRecord(f, p))) continue;
      fresh.push(p);
    }

    type InsertedRow = { id: string; place_id: string; name: string };
    let inserted: InsertedRow[] = [];
    if (fresh.length) {
      const rows = fresh.map((p) => ({ ...p, owner_id: userId, discovery_run_id: run.id }));
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
      for (const b of inserted) resolved.set(b.place_id, b.id);
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

    // Verify "no website" claims up front. Only a completed check marks a
    // business as confirmed no-website; if a website is found we store it so the
    // lead is no longer shown as website-less.
    const freshByPlaceId = new Map(fresh.map((p) => [p.place_id, p]));
    const noSite = inserted.filter((b) => !freshByPlaceId.get(b.place_id)?.website);
    let verifiedNoWebsite = 0;
    if (noSite.length) {
      const deadline = Date.now() + VERIFY_BUDGET_MS;
      for (let i = 0; i < noSite.length; i += VERIFY_CONCURRENCY) {
        if (Date.now() >= deadline) break;
        await Promise.allSettled(
          noSite.slice(i, i + VERIFY_CONCURRENCY).map(async (b) => {
            const place = freshByPlaceId.get(b.place_id);
            if (!place) return;
            const check = await verifyWebsite(
              {
                place_id: place.place_id,
                name: place.name,
                address: place.address,
                website: null,
              },
              {
                maxDomainCandidates: VERIFY_MAX_DOMAINS,
                perRequestMs: VERIFY_PER_REQUEST_MS,
                deadlineMs: deadline,
              },
            );
            const now = new Date().toISOString();
            const websiteCheck = {
              confidence: check.confidence,
              source: check.source,
              steps: check.steps,
            } as unknown as Json;
            if (check.website) {
              await supabase
                .from("businesses")
                .update({
                  website: check.website,
                  website_source: check.source,
                  website_checked_at: now,
                  website_check: websiteCheck,
                })
                .eq("id", b.id);
              await supabase.from("business_activity_events").insert({
                owner_id: userId,
                business_id: b.id,
                event_type: "website_found",
                summary: `Website found during discovery (${check.source}): ${check.website}`,
              });
            } else if (check.confidence === "none_found" && !check.truncated) {
              verifiedNoWebsite += 1;
              await supabase
                .from("businesses")
                .update({ website_checked_at: now, website_check: websiteCheck })
                .eq("id", b.id);
            }
          }),
        );
      }
    }

    const freshIds = new Set(fresh.map((p) => p.place_id));
    const links = places
      .filter((p) => resolved.has(p.place_id))
      .map((p) => ({
        owner_id: userId,
        run_id: run.id,
        business_id: resolved.get(p.place_id)!,
        was_new: freshIds.has(p.place_id),
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

    // Places we already knew came back with fresh (already paid for) data.
    // Refresh their activity fields and record meaningful changes as signals.
    await Promise.allSettled(
      places.flatMap((p) => {
        const id = knownByPlaceId.get(p.place_id);
        const before = id ? existingById.get(id) : undefined;
        if (!before) return [];
        return [recordPlaceChanges(supabase, userId, before, p)];
      }),
    );

    return {
      runId: run.id,
      found: places.length,
      added: fresh.length,
      duplicates: places.length - fresh.length,
      verifiedNoWebsite,
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
    // Outreach drafting (the multi-channel pack) is generated on demand from the
    // business page so the report returns fast; report the eligibility flags here.
    if (biz.business_status === "CLOSED_PERMANENTLY") {
      await supabase.from("business_activity_events").insert({
        owner_id: userId,
        business_id: biz.id,
        event_type: "closed",
        summary: "Flagged as permanently closed on Google — outreach drafting skipped.",
      });
    }
    return {
      score: report.score,
      investigationId: inv.id,
      recommendedOffer: report.recommended_offer,
      permanentlyClosed: biz.business_status === "CLOSED_PERMANENTLY",
      websiteCheck: check.confidence,
    };
  });
