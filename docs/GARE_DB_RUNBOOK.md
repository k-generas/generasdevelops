# GARE — Database Migration Runbook

The app (localhost) and the hosted Lovable site share **one** Supabase project
(`lfhzponzmkdconaovolq`). A migration applied once affects both, so there is no
"local database" to reset — always treat migrations as production changes.

Lovable can apply either set, depending on which migration mechanism the project
uses. Keep both in sync:

- `supabase/migrations/` — timestamped files for Lovable Cloud / Supabase.
- `drizzle/migrations/` — Lovable's Drizzle history. A migration is only applied
  by Drizzle when it has an entry in `drizzle/migrations/meta/_journal.json`.

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
| `0022_business_audits.sql` | `business_audits` |
| `0023_opportunity_signals.sql` | `opportunity_signals` |
| `0024_opportunities_qualification.sql` | `opportunities` |
| `0025_outreach_columns_repair.sql` | forward-only repair for the outreach columns |

Lovable Cloud migrations (`supabase/migrations/`, newest first):

| File | Adds |
| --- | --- |
| `20261102000000_outreach_columns_repair.sql` | forward-only outreach column repair |
| `20261031000000_opportunities_qualification.sql` | `opportunities` |
| `20261030000000_opportunity_signals.sql` | `opportunity_signals` |
| `20261029000000_business_audits.sql` | `business_audits` |
| `20261026000000_payments_expenses.sql` | `payments`, `expenses` |
| `20261022223809035_outreach_stage_force.sql` | outreach columns + constraint |
| `20261022205533_outreach_tracker.sql` | outreach index |
| `20261016120000_gare_growth_engine.sql` | monitoring, digests, leaks, partners, subscriptions, kits, referrals |

## How migrations get applied

Pushing to `main` syncs the files, but sync alone does not run
externally-authored migrations. Use one of these, in order of preference:

1. **Lovable SQL editor (guaranteed):** More → Database → Manage → SQL editor,
   paste all of `docs/APPLY_PENDING_MIGRATIONS.sql`, and run it.
2. **Lovable chat:** ask "apply the pending migrations in `supabase/migrations/`
   and `drizzle/migrations/`, then verify the tables exist."
3. **Local, when a database URL is available:**

```sh
LOVABLE_DB_MIGRATION_URL="postgres://..." npm run db:migrate
npm run db:verify
```

`npm run db:migrate` applies every file in order and is safe to re-run.
`npm run db:verify` checks the hosted schema and live site and exits non-zero on
any missing table/column.

### Why the outreach columns were skipped

Drizzle applies journal entries newer than the last applied migration. The hosted
database recorded `0021_payments_expenses` but not `0020_outreach_tracker`, so
Drizzle considers `0020` already passed and will never run it. That is why
`0025_outreach_columns_repair.sql` (and
`supabase/migrations/20261102000000_outreach_columns_repair.sql`) exists: it is
newer than `0021` and idempotently re-adds the columns, constraint, and index.

The same mistake must not be repeated: every new `drizzle/migrations/*.sql` file
needs a matching entry in `drizzle/migrations/meta/_journal.json`, and new entries
must have a `when` timestamp greater than the newest already-applied entry.

### Current hosted status (checked 2026-11-02)

The hosted database (`lfhzponzmkdconaovolq`) is missing:

- `business_audits`
- `opportunity_signals`
- `opportunities`
- `businesses.outreach_stage`, `businesses.last_contacted_at`, `businesses.outreach_note`

Paste-ready fallback: `docs/APPLY_PENDING_MIGRATIONS.sql`.

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

-- 20261029 / 20261030 / 20261031
select to_regclass('public.business_audits') is not null as business_audits_exists,
       to_regclass('public.opportunity_signals') is not null as opportunity_signals_exists,
       to_regclass('public.opportunities') is not null as opportunities_exists;

-- outreach columns
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'businesses'
  and column_name in ('outreach_stage','last_contacted_at','outreach_note');
```

Or simply run `npm run db:verify`.

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
