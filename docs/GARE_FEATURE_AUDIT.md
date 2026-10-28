# GARE — Feature Audit

Date: 2026-10-12
Scope: full audit of the GARE app (folder `$1000.24.7`) against the target feature set.
Rule: this document records only what exists in the code. Nothing here is aspirational.

## How the app is built

- **Stack:** TanStack Start (React 19) + Vite 8 + Tailwind v4 + Supabase (Postgres + Auth + RLS).
- **Owner model:** every table is owner-scoped with `owner_id = auth.uid()`. Single-owner, private. No roles.
- **Auth:** Supabase email/password. `src/routes/_authenticated/` is a client-side session gate (`ssr: false`).
- **Data access:** browser uses the anon publishable key under RLS. Privileged work runs in authenticated server functions that reuse the caller's session.
- **Server functions (all of them):**
  - `runDiscovery` — `src/lib/discovery.functions.ts`
  - `investigateBusiness` — `src/lib/discovery.functions.ts`
  - `generateProposal` — `src/lib/proposals.functions.ts`
  - `getSystemStatus` — `src/lib/system.functions.ts` (added this pass)
- **External calls:** Google Places only through the authenticated server functions (bounded: max 20/run, dedupe by `place_id`). AI via `src/lib/ai.server.ts` (OpenAI Responses / Gemini / Lovable, with fallback).

## Routes (what a user can reach)

| Route | Purpose |
| --- | --- |
| `/` | Marketing/landing page |
| `/auth` | Sign in / sign up |
| `/dashboard` | KPIs, alerts, recent leads/proposals/tasks, "continue where you left off" |
| `/discover` | Google Maps discovery runs; filters including "closed" |
| `/businesses/$id` | Investigation report, activity/hours, reviews, workspace (notes/tasks/proposals/events) |
| `/proposals` | Proposal list + filters |
| `/proposals/$id` | Proposal editor, versions, "why this message" |
| `/tasks` | Follow-ups: create, due date, priority, overdue, complete/reopen |
| `/history` | Discovery run history |
| `/history/$id` | Results of a past run |
| `/settings` | Owner offer catalog, pricing floors + integration status |
| `/analytics` | Weekly activity/cash analytics, funnel, win rate, CSV export |
| `/money` | Payment/expense ledger, per-currency cash and profit, API usage |

## Data tables

`discovery_runs`, `search_run_results`, `businesses`, `investigations`,
`business_activity_events`, `proposals`, `proposal_versions`, `tasks`,
`business_notes`, `user_preferences`, `offers` (migration `0004_offers_catalog.sql`),
`invoices`, `orders`, `payments` and `expenses` (migration
`0021_payments_expenses.sql`).

`businesses` (after migration `0003_business_activity_signals.sql`) also carries
closure/activity signals: `business_status`, `last_activity_at`, `reviews_last_90d`,
`recent_reviews`, `open_now`, `opening_hours`, `activity_checked_at`, `last_opened_at`,
plus contact fields `phone`, `emails[]`, `socials`, `website`, `website_check`.

## Capability matrix

Legend: **Done** = implemented and wired · **Partial** — exists but limited — **Missing** — not present.

| Area | Status | Evidence / gap |
| --- | --- | --- |
| Owner auth | Done | Supabase auth + `_authenticated` gate |
| Lead discovery (Maps) | Done | `runDiscovery`, bounds + dedupe |
| Lead storage / dedupe | Done | `businesses` keyed by `place_id`; reviewable duplicate groups + safe merge (`duplicates.ts`, `merge.functions.ts`) |
| Website double-check | Done | `website-finder.server.ts`, `verifyWebsite` |
| Investigation & scoring | Done | `investigate.server.ts` (visibility + AI report) |
| Activity / closure signals | Done | migration 0003 + `places.server.ts` + UI badges; discovery/Rwanda scans now populate deduped `company_events` (`signals.ts`) |
| Proposals (draft/edit) | Done | `generateProposal`, `proposals.$id`; channel-aware, copy-paste-ready output (Email / WhatsApp / SMS / LinkedIn / DM / call script / formal) |
| Proposal versioning | Done | `proposal_versions` |
| Proposal outcomes / win rate | Done | outcome reason captured in `proposals.$id`; win rate + pipeline on the dashboard (`src/lib/outcomes.ts`) |
| Tasks / follow-ups | Done | `/tasks` (create, due, priority, overdue, complete) |
| Notes & activity timeline | Done | `business_notes`, `business_activity_events` |
| Global search | Done | `GlobalSearch.tsx` (businesses/search/proposals/notes/tasks/emails) |
| Dashboard | Done | KPIs, alerts, "since last visit", continue-where-left-off |
| Pricing floors (safety) | Done | `src/lib/pricing.ts`, enforced in `createProposal`, Settings UI |
| Integration status | Done | `getSystemStatus` + Settings (booleans only, no secrets) |
| Themes | Done | `theme.tsx` / `theme-constants.ts`, 12 accents × 3 modes |
| Offers / pricing catalog | Done | owner-scoped `offers` table (migration 0004); editable in Settings; drives proposal dropdown + floor list; falls back to built-ins when absent |
| Source registry + scan health | Done | `src/lib/sources.ts` (tested) + live "source health" chip on `/discover` derived from real `discovery_runs` |
| Evidence freshness | Done | `src/lib/evidence.ts` (tested) + freshness badge on `/businesses/$id` from `website_checked_at` / `activity_checked_at` |
| Explainable ranking | Partial | `src/lib/ranking.ts` (tested) exists but is not surfaced: needs owner skills/budget profile, so no fabricated scores are shown |
| Validation planner | Done | `src/lib/validation.ts` + `ValidationPlanner.tsx`; persists `businesses.validation_plan` (migration 0007); outcome logs a `validation_outcome` event |
| Orders + delivery | Done | Orders UI + checklist + status transitions (migration 0006). |
| Invoices (invoicing-lite) | Done | owner-scoped `invoices` table (migration 0005), `/invoices` route, create-from-proposal, totals / status / print; invoice balance is now derived from recorded payments (`PARTIAL`/`PAID`) |
| Payments | Done | owner-scoped `payments` ledger (migration 0021), `/money` + `/invoices` entry, partial payments, overpayment visibility, delete/undo; no online processing or card charging |
| Customers / CRM | Missing | businesses serve as leads; no customer records, no lifecycle |
| Outreach logging | Partial | manual log per proposal (channel, time, response) → `business_activity_events` + business timeline; no automated email/WhatsApp sending |
| Conversations / inbox | Missing | none |
| Campaigns / sequences | Missing | none |
| Experiments / A-B | Missing | none |
| Learning / feedback loop | Missing | proposal outcomes are stored per proposal but not learned from |
| Jobs / workers / cron | Missing | `cron-auth.ts` exists but is unused; no queue |
| Cost / budget tracking | Partial | manual `expenses` ledger + paid API usage counts/source-scan cost on `/money`; no hard spend caps or per-token AI accounting yet |
| Automation control center | Missing | discovery is manually triggered only |
| Analytics / reporting | Done | `/analytics` weekly time-series, funnel, cash by currency, win rate; CSV exports on Leads/Numbers |
| Backup / data export | Done | Settings JSON backup over 26 owner tables; per-table errors reported |
| Multi-user / roles | Missing | intentionally single-owner |

## Data collected per business (confirmed)

Name, category, address, phone (national + international), website, maps URL, rating,
review count, business status, lat/lng, public emails (from the website), social links,
recent Google reviews (up to 5), open-now, opening hours, last-activity date,
reviews-in-last-90-days. **No** private data and no invented data.

## Known environment constraints

- Loading a service key into the local process is impossible (the repo only ships the anon
  publishable key), so some integrations are exercised only on the hosted platform.
- AI provider availability depends on secrets present at runtime (`OPENAI_API_KEY`,
  `GEMINI_API_KEY`, `LOVABLE_API_KEY`); `getSystemStatus` reports which are configured.

---

## Addendum 2026-10-14 — Revenue Growth Engine audit (Features A–H)

Audit of the app against the "GARE Revenue Growth Engine" brief, done before any
implementation. Statuses: **COMPLETE** / **PARTIAL** / **MISSING** / **MOCKED** /
**BLOCKED** / **BROKEN**. Nothing below is aspirational.

### Regression baseline (start of pass)

- `git` HEAD `412ab13`; working tree clean; `main == origin/main`.
- `npx tsc --noEmit` — clean · `npx eslint .` — 0 errors (7 pre-existing warnings) ·
  `npx vitest run` — 25 files / 161 tests passing · `npx vite build` — succeeds.

### Since the 2026-10-12 audit, these shipped and are verified

- **Monitoring**: automatic daily radar scan + in-app digest feed — migration
  `0011_monitoring_digests.sql` (`monitoring_settings`, `daily_digests`),
  `monitoring.ts` / `monitoring.server.ts` / `monitoring.functions.ts`, `/updates`
  route + nav unread badge; Radar page gained "run daily scan now". Committed `3e858d9`.
- **Saved-leads search**: `business-search.ts` + paginated search on `/businesses`.
- **Rwanda scan core** extracted to `rwanda-scan.server.ts` (shared by scan + monitoring).
- **Phase 1 (A + F)**: `revenue-leaks.ts` + `feasibility.ts` (pure, tested) + `revenue_leaks`
  table & `user_preferences.feasibility_defaults` (migration 0012) + `/leaks` page.
- **Phase 2 (B)**: `partners.ts` (pure overflow + matching, tested) + owner-scoped
  `partners` / `partner_handoffs` (migration 0013) + `/partners` page.
- **Phase 3 (C + G)**: `recurring.ts` + `recovery.ts` (pure, tested) + owner-scoped
  `subscriptions` (migration 0014) + `/revenue` and `/recovery` pages; recovery reuses `tasks`.
- **Phase 4 (E)**: `offer-kit.ts` (pure, tested) + owner-scoped `offer_kits` (migration 0015)
  + `/offers` studio; leak cards gained a **Plan delivery** action that turns a kit's checklist
  into deduped `tasks`.
- **Phase 5 (D + H)**: `intent.ts` + `referrals.ts` (pure, tested) + `/intent` board
  (no new table) + owner-scoped `referrals` ledger (migration 0016) + `/referrals` page.

### Capability matrix (Features A–H)

| Feature | Status | Evidence / gap (pre-implementation) |
| --- | --- | --- |
| **A. Revenue leak detector** | **MISSING→DONE (this pass)** | No leak concept existed. Was **PARTIAL** as "review detected problems": `business-intel.deriveObservedProblems` + `service-match` derived problems from measured website evidence, shown inside the intel modal only — no persistent, reviewable, owner-scoped leak list. Now: `revenue-leaks.ts` (pure) + `/leaks` feed + `revenue_leaks` table (migration 0012). |
| **B. Agency overflow / sub-contract work finder** | **MISSING→DONE (this pass)** | No concept existed. Now: `partners.ts` (pure overflow detection + honest partner matching) + owner-scoped `partners` / `partner_handoffs` (migration 0013) + `/partners` page (overflow list, partner directory, handoff tracker). |
| **C. Recurring revenue builder** | **PARTIAL→DONE (this pass)** | `MatchExplanation.recurring` flagged recurring offers and the `offers` catalog existed, but there was no recurring pipeline. Now: `recurring.ts` (pure MRR/ARR/churn/renewal model that keeps proposed/paused/churned value out of MRR) + owner-scoped `subscriptions` (migration 0014) + `/revenue` page (snapshot stats, renewals, recurring-leak opportunities, lifecycle status). |
| **D. Buyer-intent signals** | **PARTIAL→DONE (this pass)** | `company_events`, `activity.ts` (hiring detection + disclaimer), `reviews_last_90d`, `last_activity_at` existed as badges with no board. Now: `intent.ts` (pure scorer that blends measured gaps, review/activity recency, activity signals and pipeline stage; every score carries reasons, uncertainties and a limitation) + `/intent` board ranked by tier. No new table. |
| **E. Repeatable offer factory** | **PARTIAL→DONE (this pass)** | The `offers` catalog (name, default price, deliverables, notes) existed but carried no reusable scope or delivery template. Now: `offer-kit.ts` (pure templates + scope summary + delivery checklist, derived from the shared offer rules) + owner-scoped `offer_kits` (migration 0015) + `/offers` studio; a leak's **Plan delivery** materialises the offer's checklist into deduped `tasks` (reuses `tasks`, no new pipeline). |
| **F. Profit & delivery feasibility engine** | **MISSING→DONE (this pass)** | No profit/capacity/margin model existed anywhere. `ranking.ts` has a ranking score, not a financial model. Now: `feasibility.ts` (pure, scenarios + capacity + honest flags) + stored assumptions (migration 0012) + per-leak profit check on `/leaks`. |
| **G. Lost-deal recovery** | **PARTIAL→DONE (this pass)** | `proposals.outcome` + `outcomes.ts` captured reasons but there was no dormant-lead detection. Now: `recovery.ts` (pure) detects no-response / soft-no / lost with priority + a respectful next step; `/recovery` page lists candidates and creates a deduped follow-up **task** (reuses `tasks`, no new table, never messages the buyer). |
| **H. Referral / partnership intelligence** | **MISSING→DONE (this pass)** | No referral tracking or partnership candidates existed. Now: `referrals.ts` (pure referral summary + evidence-only `partnershipCandidates` from recorded clients/partners) + owner-scoped `referrals` ledger (migration 0016) + `/referrals` page. Clusters are hypotheses derived only from recorded businesses. |

### Safety-relevant findings carried into implementation

- All financial concepts must stay separate; `feasibility.RevenueLedger` + `actualProfit`
  compute profit only from **collected cash − refunds − costs** (never from proposed/invoiced).
- The leak detector asserts **no monetary loss**: every leak carries `evidence`, an explicit
  `limitation`, and `hypothesis` when confidence < 0.6 (`REVENUE_LEAK_RULE`).
- New tables are owner-scoped `owner_id = auth.uid()`; UI degrades gracefully when migration
  0012 is not yet applied (returns `[]` / `applied:false` instead of throwing).

---

## Addendum 2026-10-26 — Money truth

Money is now recorded as cash, not inferred from invoice status.

- **Payments are the source of truth for collected cash.** `payments` links to an
  invoice and/or business, stores amount/currency/method/received date/reference,
  and is owner-scoped (migration `0021_payments_expenses.sql`). Invoices stay as
  documents; their `PARTIAL`/`PAID` status is synchronized from linked payments.
  `VOID` is never overwritten.
- **Legacy invoices are preserved.** Migration 0021 backfills existing `PAID`
  invoices into `payments` with method `legacy`, guarded against duplicates.
- **Expenses are recorded manually.** `expenses` stores costs by category, vendor,
  amount/currency, method, paid date and optional business link.
- **No FX is applied.** Collected, spent, net and outstanding totals are grouped
  per currency; the UI never adds different currencies together.
- **Analytics prefers the ledger.** When payments exist, cash series/won totals use
  recorded payments; otherwise they fall back to legacy paid invoices.
- **Cost visibility, not hard caps.** `/money` shows discovery runs, AI
  investigations, source scans and provider-recorded scan cost for the month.
- **Outbound sending remains out of scope.** No email/WhatsApp/SMS provider is
  configured and no online payment is processed; entry is manual.

---

## Addendum 2026-10-29 — Prospect verification

Website, ownership, activity and contact checks are now explicit rather than implied.
`src/lib/prospect-verification.ts` builds per-channel coverage, verification status,
evidence records, observed problems, priority reasons and uncertainties from stored
checks. `ProspectVerificationPanel.tsx` surfaces the result on the business page and
intel modal.

- **No fabricated coverage.** Sources the app cannot check stay `not_performed` or
  `blocked`; an empty result is not proof that a website, profile or directory listing
  does not exist. Paid provider usage remains capped and deduped.
- **Website checks are structured and bounded.** Aliases, domain guesses and up to four
  free-hosting candidates are tested with positive/negative/failed/not-performed
  outcomes. Truncated runs are recorded as truncated and do not count as complete.
- **Guesses are labelled.** `domain_match` and `free_hosting` websites are low-confidence,
  capped at priority B, excluded from multi-channel presence, and require ownership
  confirmation. A broken website alone does not prove the business is operating.
- **Identity matching is conservative.** Name-only dedupe requires compatible locations,
  so same-name foreign companies are not merged.
- **Still manual:** social platforms, directories, marketplaces, WHOIS/registry checks
  and any outbound contact. No new schema migration was required; evidence reuses the
  existing `website_check` JSONB.

