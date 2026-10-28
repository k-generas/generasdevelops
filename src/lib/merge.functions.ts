// Merge duplicate businesses without losing their history. All reads/writes go
// through the owner's session, so RLS guarantees only their rows are touched.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];

const inputSchema = z.object({
  keepId: z.string().uuid(),
  mergeIds: z.array(z.string().uuid()).min(1).max(20),
});

const SIMPLE_REFS: { table: string; column: string }[] = [
  { table: "business_activity_events", column: "business_id" },
  { table: "business_facts", column: "business_id" },
  { table: "business_notes", column: "business_id" },
  { table: "company_events", column: "business_id" },
  { table: "expenses", column: "business_id" },
  { table: "investigations", column: "business_id" },
  { table: "invoices", column: "business_id" },
  { table: "payments", column: "business_id" },
  { table: "orders", column: "business_id" },
  { table: "partner_handoffs", column: "business_id" },
  { table: "proposals", column: "business_id" },
  { table: "revenue_leaks", column: "business_id" },
  { table: "subscriptions", column: "business_id" },
  { table: "tasks", column: "business_id" },
];

const FILL_FIELDS = [
  "address",
  "business_model",
  "business_status",
  "category",
  "cell",
  "contact_page",
  "description",
  "district",
  "employees_max",
  "employees_min",
  "exports",
  "founded_date",
  "founded_status",
  "industry",
  "industry_secondary",
  "latitude",
  "legal_name",
  "legal_structure",
  "longitude",
  "maps_url",
  "markets_served",
  "open_now",
  "opening_hours",
  "parent_organization",
  "phone",
  "preferred_channel",
  "products_services",
  "province",
  "rating",
  "registration_date",
  "registration_id",
  "registration_status",
  "sector",
  "supply_chain_role",
  "target_customers",
  "website",
  "website_source",
] as const;

function isBlank(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function earliest(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function buildPatch(keep: BusinessRow, merges: BusinessRow[]): Partial<BusinessRow> {
  const patch: Partial<BusinessRow> = { updated_at: new Date().toISOString() };

  for (const field of FILL_FIELDS) {
    if (!isBlank(keep[field])) continue;
    const found = merges.find((m) => !isBlank(m[field]));
    if (found) (patch as Record<string, unknown>)[field] = found[field];
  }

  const emails = new Set(keep.emails ?? []);
  const tradingNames = new Set(keep.trading_names ?? []);
  const socials = jsonObject(keep.socials);
  for (const m of merges) {
    for (const email of m.emails ?? []) emails.add(email);
    for (const name of m.trading_names ?? []) tradingNames.add(name);
    for (const [key, value] of Object.entries(jsonObject(m.socials))) {
      if (isBlank(socials[key]) && !isBlank(value)) socials[key] = value;
    }
  }
  patch.emails = [...emails];
  patch.trading_names = [...tradingNames];
  patch.socials = socials as BusinessRow["socials"];

  patch.rating = Math.max(
    ...[keep.rating, ...merges.map((m) => m.rating)].filter(
      (n): n is number => typeof n === "number",
    ),
    ...(keep.rating == null && merges.every((m) => m.rating == null) ? [0] : []),
  );
  if (keep.rating == null && merges.every((m) => m.rating == null)) delete patch.rating;

  patch.review_count = Math.max(keep.review_count ?? 0, ...merges.map((m) => m.review_count ?? 0));
  patch.reviews_last_90d = Math.max(
    keep.reviews_last_90d ?? 0,
    ...merges.map((m) => m.reviews_last_90d ?? 0),
  );
  patch.visibility_score = Math.max(
    keep.visibility_score ?? 0,
    ...merges.map((m) => m.visibility_score ?? 0),
  );
  patch.score = Math.max(keep.score ?? 0, ...merges.map((m) => m.score ?? 0));
  patch.last_activity_at = merges.reduce<string | null>(
    (acc, m) => latest(acc, m.last_activity_at),
    keep.last_activity_at,
  );
  patch.last_contacted_at = merges.reduce<string | null>(
    (acc, m) => latest(acc, m.last_contacted_at),
    keep.last_contacted_at,
  );
  patch.created_at = merges.reduce((acc, m) => earliest(acc, m.created_at), keep.created_at);
  patch.contact_suppressed = keep.contact_suppressed || merges.some((m) => m.contact_suppressed);
  patch.location_verified = keep.location_verified || merges.some((m) => m.location_verified);

  if (keep.status !== "investigated") {
    const investigated = merges.find((m) => m.status === "investigated");
    if (investigated) patch.status = investigated.status;
  }
  if (keep.outreach_stage === "not_contacted") {
    const advanced = merges.find((m) => m.outreach_stage !== "not_contacted");
    if (advanced) patch.outreach_stage = advanced.outreach_stage;
  }
  const notes = [keep.outreach_note, ...merges.map((m) => m.outreach_note)]
    .map((n) => (n ?? "").trim())
    .filter(Boolean);
  if (notes.length > 1) patch.outreach_note = [...new Set(notes)].join("\n\n");

  return patch;
}

export const mergeBusinesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const mergeIds = [...new Set(data.mergeIds)].filter((id) => id !== data.keepId);
    if (mergeIds.length === 0) throw new Error("Pick at least one duplicate to merge.");
    const allIds = [data.keepId, ...mergeIds];

    const { data: rows, error } = await supabase.from("businesses").select("*").in("id", allIds);
    if (error) throw new Error(error.message);
    if (!rows || rows.length !== allIds.length) {
      throw new Error("Some records were not found. Refresh and try again.");
    }
    const keep = rows.find((r) => r.id === data.keepId);
    const merges = rows.filter((r) => r.id !== data.keepId);
    if (!keep) throw new Error("The record to keep was not found.");

    const moved: Record<string, number> = {};

    async function moveBusinessRefs(table: string, column: string): Promise<void> {
      const { data: updated, error: updateError } = await supabase
        .from(table as "tasks")
        .update({ [column]: data.keepId } as never)
        .in(column, mergeIds)
        .select("id");
      if (updateError) throw new Error(`${table}: ${updateError.message}`);
      if (updated?.length) moved[table] = (moved[table] ?? 0) + updated.length;
    }

    // Tables with a unique key that includes business_id need conflict cleanup
    // before the update, otherwise the merge would fail on a duplicate key.
    const { data: keepSources } = await supabase
      .from("business_sources")
      .select("source_id")
      .eq("business_id", data.keepId);
    const keepSourceIds = new Set((keepSources ?? []).map((s) => s.source_id));
    if (keepSourceIds.size) {
      const { data: mergeSources } = await supabase
        .from("business_sources")
        .select("id, source_id")
        .in("business_id", mergeIds);
      const conflictIds = (mergeSources ?? [])
        .filter((s) => keepSourceIds.has(s.source_id))
        .map((s) => s.id);
      if (conflictIds.length) {
        const { error: deleteError } = await supabase
          .from("business_sources")
          .delete()
          .in("id", conflictIds);
        if (deleteError) throw new Error(`business_sources: ${deleteError.message}`);
      }
    }
    await moveBusinessRefs("business_sources", "business_id");

    const { data: keepLinks } = await supabase
      .from("search_run_results")
      .select("run_id")
      .eq("business_id", data.keepId);
    const keepRuns = new Set((keepLinks ?? []).map((l) => l.run_id));
    if (keepRuns.size) {
      const { data: mergeLinks } = await supabase
        .from("search_run_results")
        .select("id, run_id")
        .in("business_id", mergeIds);
      const conflictIds = (mergeLinks ?? []).filter((l) => keepRuns.has(l.run_id)).map((l) => l.id);
      if (conflictIds.length) {
        const { error: deleteError } = await supabase
          .from("search_run_results")
          .delete()
          .in("id", conflictIds);
        if (deleteError) throw new Error(`search_run_results: ${deleteError.message}`);
      }
    }
    await moveBusinessRefs("search_run_results", "business_id");

    for (const ref of SIMPLE_REFS) await moveBusinessRefs(ref.table, ref.column);

    // Referrals reference businesses without a foreign key, so move both sides.
    {
      const { data: referrerRows, error: e1 } = await supabase
        .from("referrals")
        .update({ referrer_business_id: data.keepId })
        .in("referrer_business_id", mergeIds)
        .select("id");
      if (e1) throw new Error(`referrals: ${e1.message}`);
      const { data: referredRows, error: e2 } = await supabase
        .from("referrals")
        .update({ referred_business_id: data.keepId })
        .in("referred_business_id", mergeIds)
        .select("id");
      if (e2) throw new Error(`referrals: ${e2.message}`);
      const count = (referrerRows?.length ?? 0) + (referredRows?.length ?? 0);
      if (count) moved["referrals"] = count;
    }

    const patch = buildPatch(keep, merges);
    const { error: patchError } = await supabase
      .from("businesses")
      .update(patch as never)
      .eq("id", data.keepId);
    if (patchError) throw new Error(`businesses: ${patchError.message}`);

    const { error: deleteError } = await supabase
      .from("businesses")
      .delete()
      .in("id", mergeIds)
      .eq("owner_id", userId);
    if (deleteError) throw new Error(`businesses: ${deleteError.message}`);

    await supabase.from("business_activity_events").insert({
      owner_id: userId,
      business_id: data.keepId,
      event_type: "merged",
      summary: `Merged ${mergeIds.length} duplicate record${mergeIds.length === 1 ? "" : "s"} into this business.`,
    });

    return { ok: true, keepId: data.keepId, merged: mergeIds.length, moved };
  });
