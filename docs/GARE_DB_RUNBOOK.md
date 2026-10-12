# GARE — Database Migration Runbook

The app (localhost) and the hosted Lovable site share **one** Supabase project
(`lfhzponzmkdconaovolq`). A migration applied once affects both, so there is no
"local database" to reset — always treat migrations as production changes.

Migrations live in `drizzle/migrations/` and are tracked in
`drizzle/migrations/meta/_journal.json`.

| File | Adds |
| --- | --- |
| `0000_discovery_engine.sql` | base tables: `discovery_runs`, `businesses`, `investigations` |
| `0001_memory_proposals_tasks.sql` | `search_run_results`, `business_activity_events`, `proposals`, `proposal_versions`, `tasks`, `business_notes`, `user_preferences` + business columns |
| `0002_website_verification.sql` | website verification columns on `businesses` |
| `0003_business_activity_signals.sql` | activity/closure columns on `businesses` |
| `0004_offers_catalog.sql` | `offers` table (owner-scoped offer catalog) |

## How migrations get applied

The repository has **no** service-role key and no direct database URL. Migrations
run through Lovable using the `LOVABLE_DB_MIGRATION_URL` secret, which only exists
in the hosted environment.

1. **Preferred — via Lovable.** Publish/sync the project in Lovable; it applies any
   new files under `drizzle/migrations` to the shared database.
2. **Manual fallback — Supabase SQL editor.** Open the project's SQL editor and run
   each un-applied file in order. The SQL is plain Postgres and idempotent-safe only
   if you run each file **once**: the statements are not wrapped in
   `IF NOT EXISTS`, so re-running a file errors on the objects it already created.

## Verifying a migration landed

Run these against the project (SQL editor or a client with the anon key + owner RLS):

```sql
-- 0003
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'businesses'
  and column_name in ('activity_checked_at','last_activity_at','open_now',
                      'opening_hours','recent_reviews','reviews_last_90d');

-- 0004
select to_regclass('public.offers') is not null as offers_exists;
```

## Graceful behaviour before a migration is applied

The app is written so an un-migrated database does not hard-fail:

- **0003** — `places.server.ts` / `discovery.functions.ts` detect the missing columns
  and retry the insert without them; activity badges simply show nothing.
- **0004** — `useOffers()` catches the "relation does not exist" error, hides the
  error, and falls back to the built-in `DEFAULT_OFFERS`; Settings shows a banner
  telling you to apply `0004_offers_catalog.sql`. The pricing floors list keeps
  working from the built-in offer names.

## Rules

- Never edit a file that has already been applied; add a new numbered migration.
- Keep every new column nullable or defaulted so existing rows stay valid.
- Every new table must enable RLS and use an `owner_id = auth.uid()` policy plus
  `GRANT ... TO authenticated` and `GRANT ALL ... TO service_role`.
