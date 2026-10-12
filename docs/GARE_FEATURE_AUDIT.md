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

## Data tables

`discovery_runs`, `search_run_results`, `businesses`, `investigations`,
`business_activity_events`, `proposals`, `proposal_versions`, `tasks`,
`business_notes`, `user_preferences`, `offers` (migration `0004_offers_catalog.sql`).

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
| Lead storage / dedupe | Done | `businesses` keyed by `place_id` |
| Website double-check | Done | `website-finder.server.ts`, `verifyWebsite` |
| Investigation & scoring | Done | `investigate.server.ts` (visibility + AI report) |
| Activity / closure signals | Done | migration 0003 + `places.server.ts` + UI badges |
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
| Invoices (invoicing-lite) | Done | owner-scoped `invoices` table (migration 0005), `/invoices` route, create-from-proposal, totals / status / print |
| Payments | Missing | none — nothing is charged; Settings states this plainly |
| Customers / CRM | Missing | businesses serve as leads; no customer records, no lifecycle |
| Outreach logging | Partial | manual log per proposal (channel, time, response) → `business_activity_events` + business timeline; no automated email/WhatsApp sending |
| Conversations / inbox | Missing | none |
| Campaigns / sequences | Missing | none |
| Experiments / A-B | Missing | none |
| Learning / feedback loop | Missing | proposal outcomes are stored per proposal but not learned from |
| Jobs / workers / cron | Missing | `cron-auth.ts` exists but is unused; no queue |
| Cost / budget tracking | Missing | no token or spend accounting |
| Automation control center | Missing | discovery is manually triggered only |
| Analytics / reporting | Partial | dashboard counters + win rate; no time-series or export |
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
