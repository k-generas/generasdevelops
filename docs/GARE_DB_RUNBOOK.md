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
| `0005_invoices.sql` | `invoices` table (invoicing-lite) |
| `0006_orders_delivery.sql` | `orders` table (orders + delivery checklist) |
| `0007_business_validation_plan.sql` | `businesses.validation_plan` (low-cost validation planner) |
| `0008_rwanda_intelligence.sql` | Rwanda company intelligence columns/tables |
| `0009_rwanda_intelligence.sql` | Rwanda intelligence follow-up |
| `0010_business_facts_align.sql` | business facts alignment |
| `0011_monitoring_digests.sql` | `monitoring_settings`, `daily_digests` |
| `0012_revenue_leaks.sql` | `revenue_leaks` + feasibility defaults |
| `0013_partners.sql` | `partners`, `partner_handoffs` |
| `0014_subscriptions.sql` | `subscriptions` |
| `0015_offer_kits.sql` | `offer_kits` |
| `0016_referrals.sql` | `referrals` |
| `0017_early_access.sql` | early-access capture |
| `0018_admin_console.sql` | admin console tables/columns |
| `0019_grant_admin_emails.sql` | admin email grants |
| `0020_outreach_tracker.sql` | outreach tracking columns/events |
| `0021_payments_expenses.sql` | `payments`, `expenses` + legacy paid-invoice backfill |

## How migrations get applied

The repository has **no** service-role key and no direct database URL. Migrations
run through Lovable using the `LOVABLE_DB_MIGRATION_URL` secret, which only exists
in the hosted environment.

1. **Preferred — via Lovable.** Publish/sync the project in Lovable; it applies any
   new files under `drizzle/migrations` to the shared database.
2. **Manual fallback — Supabase SQL editor.** Open the project's SQL editor and run
   each un-applied file in order, **once**. Some newer files use `IF NOT EXISTS`
   guards, but do not assume a file is safe to re-run: earlier files create objects
   unconditionally and will error if applied twice.

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

-- 0005
select to_regclass('public.invoices') is not null as invoices_exists;

-- 0006
select to_regclass('public.orders') is not null as orders_exists;

-- 0007
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'businesses'
  and column_name = 'validation_plan';

-- 0021
select to_regclass('public.payments') is not null as payments_exists,
       to_regclass('public.expenses') is not null as expenses_exists;
-- Confirms legacy PAID invoices were backfilled once.
select count(*) as legacy_payments from public.payments where method = 'legacy';
```

## Graceful behaviour before a migration is applied

The app is written so an un-migrated database does not hard-fail:

- **0003** — `places.server.ts` / `discovery.functions.ts` detect the missing columns
  and retry the insert without them; activity badges simply show nothing.
- **0004** — `useOffers()` catches the "relation does not exist" error, hides the
  error, and falls back to the built-in `DEFAULT_OFFERS`; Settings shows a banner
  telling you to apply `0004_offers_catalog.sql`. The pricing floors list keeps
  working from the built-in offer names.
- **0005** — `useInvoices()` falls back to `persisted: false`; the Invoices page
  shows a banner and disables creation.
- **0006** — same pattern via `useOrders()`; the Orders page shows a banner and
  disables creation.
- **0007** — reading is safe (`select *` omits the missing column). Saving a
  validation plan fails, and the Validation planner shows the migration hint.
- **0021** — `usePayments()` / `useExpenses()` fall back to `persisted: false`;
  `/money` and `/invoices` show a migration banner and disable payment/expense
  writes. Existing invoice statuses still render.

## Rules

- Never edit a file that has already been applied; add a new numbered migration.
- Keep every new column nullable or defaulted so existing rows stay valid.
