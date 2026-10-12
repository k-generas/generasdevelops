# GARE — Regression Log

A running record of changes and the verification that they did not break existing behaviour.

## Verification commands (run from the project root)

```
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## 2026-10-12 — Post-investigation business report modal

### What changed
- **`src/lib/business-intel.ts`** (new, pure + tested) — `deriveObservedProblems` turns a business +
  its stored website-probe findings + the double-checked "no website" state into explicit
  `ObservedProblem`s (no invented facts); `recommendServices` matches the owner's ACTIVE offers against
  those problems via the existing evidence-based matcher (`buildServiceCatalog` + `matchServices`), so
  only offers with a credible link are suggested. Plus `companySize` / `businessIndustry`.
  `src/lib/business-intel.test.ts` (14 tests).
- **`src/components/BusinessIntelModal.tsx`** (new) — a shadcn `Dialog` opened after a run and
  re-openable any time. Shows the full business profile (all stored fields, incl. the 0008 enrichment
  when applied), the investigation report + visibility + website evidence, the recommended services
  derived from the owner's own offers (with hypothesis/confidence/next-action/uncertainties), and the
  outreach pack (display-only instance).
- **`src/components/OutreachMessages.tsx`** — added an `auto` prop (default true). The modal renders a
  second, `auto={false}` instance that only displays + offers a manual regenerate, so the pack is still
  generated exactly once by the inline panel's token bump.
- **`src/routes/_authenticated/businesses.$id.tsx`** — opens the modal the moment you click Run
  investigation (so the business is visible even if the run fails), keeps an always-visible "View full
  report" button to reopen it, and keeps the existing inline report. Passes `investigating`/`error`
  state into the modal.
- **`src/components/BusinessIntelModal.tsx`** — the report section now shows the investigating status
  and any investigation error, and the whole modal is reachable before an investigation exists.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 22 files / 128 tests passing (added `business-intel`)
- `npm run build` — succeeded

### Non-breaking design decisions
- Additive only: the inline report, outreach panel and Proposal Studio are untouched; the modal is an
  extra view over the same data.
- The modal reads the same React Query cache keys as the page, so opening it costs no extra fetches.
- Recommendations reuse the tested §7 matcher; no new matching rules were introduced.

## 2026-10-12 — AI multi-channel outreach pack (Email / WhatsApp / SMS)

### What changed
- **`src/lib/proposals.server.ts`** — extracted `loadProposalContext` (business + latest
  investigation + pricing floor + recent context) shared by both generators. `createProposal` is
  unchanged in behaviour and now uses it. Added `createOutreachPack`: one AI call produces 3 Email +
  3 WhatsApp + 3 SMS first-contact messages, each a distinct angle, saved one-per-proposal under the
  distinct `mode = "Outreach message"`. Regeneration replaces this business's UNSENT pack drafts
  (DRAFT/READY_TO_SEND) and keeps anything already sent. One summary activity event + one de-duped
  review task per business. Respects the owner's pricing floor via `research.pricing_floor`.
- **`src/lib/outreach-pack.ts`** (new, pure + tested) — `OUTREACH_PACK_MODE`, `OUTREACH_PACK_CHANNELS`,
  `selectPackMessages` (≤3 per channel, channel-ordered, drops empty bodies/unknown channels) and
  `packChannelCounts`. `src/lib/outreach-pack.test.ts` (6 tests).
- **`src/lib/proposals.functions.ts`** — added `generateOutreachPack` server fn (auth-scoped).
- **`src/lib/discovery.functions.ts`** — `investigateBusiness` no longer auto-drafts a single proposal;
  it returns `recommendedOffer` + `permanentlyClosed` so the client can decide, keeping the report
  response fast.
- **`src/components/OutreachMessages.tsx`** (new) — the panel on the business page: groups the pack by
  channel, per-message Copy + "Open & send" links, a Write/Regenerate button, auto-runs once when the
  page signals a fresh eligible investigation.
- **`src/routes/_authenticated/businesses.$id.tsx`** — renders the panel below the report and bumps a
  token after each successful investigation when the business fits an offer (skips permanently closed
  / "No offer").
- **`src/components/BusinessWorkspace.tsx`** — copy now says an outreach pack (not a single proposal)
  is written after each investigation.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 21 files / 114 tests passing (added `outreach-pack`)
- `npm run build` — succeeded

### Non-breaking design decisions
- The pack reuses the `proposals` table, so the existing copy/version/send/outcome workflow is unchanged.
- The pack `mode` marker is exclusive to the pack, so regeneration can safely replace only its own drafts.
- `createProposal` and the manual Proposal Studio are untouched.

## 2026-10-12 — Activity signals, pricing floors, Settings, Tasks, Dashboard

### Baseline at start of pass
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (see note below)
- `npm test` — 1 file / 1 test passing
- `npm run build` — succeeded

### Changes
- **Migration 0003** adds activity columns to `businesses` (additive, nullable / defaulted).
- **Places intake** now also requests reviews and hours, and derives `last_activity_at`,
  `reviews_last_90d`, `open_now`, `opening_hours`. If Google rejects the extra fields, the
  request retries with the original field set, so discovery keeps working.
- **Discovery insert** uses the new columns on the happy path and retries without them if the
  database predates migration 0003 (guarded by an "unknown column" error match). This keeps
  the app functional on an un-migrated database.
- **Auto-proposals** are skipped for `CLOSED_PERMANENTLY` businesses.
- **Pricing floors** are enforced inside `createProposal`; a price below the owner's minimum
  is rejected before any row is written.
- **Settings** page and `getSystemStatus` were added. The status function returns booleans
  only — no key values ever leave the server.
- **Tasks** gained create / due date / priority / overdue / complete / reopen.
- **Dashboard** gained a failed-run alert, an overdue alert, and a "continue where you left
  off" card driven by `businesses.last_opened_at`.
- **Tooling:** `.prettierrc` now sets `endOfLine: "auto"`; a set of pre-existing
  `@typescript-eslint/no-explicit-any` errors were replaced with real types.

### Non-breaking design decisions
- Every new column is nullable or has a default, so existing rows remain valid.
- The discovery layer degrades gracefully when the new columns or the extra Places fields
  are unavailable.
- No existing table, route, column or server function was removed or renamed.
- The Settings nav entry was added to the desktop sidebar and the account menu; the mobile
  bottom bar intentionally stays at five tabs.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing `react-refresh/only-export-components` warnings
  in shadcn UI files and `theme.tsx`; warnings do not fail the lint command)
- `npm test` — 2 files / 7 tests passing
- `npm run build` — succeeded
- Route smoke test while the dev server was running: `/dashboard` and `/settings` both HTTP 200

### Lint note
The repository is checked out with `core.autocrlf=true`, so every file is CRLF while Prettier
defaulted to LF. That produced thousands of line-ending-only errors unrelated to this work.
`.prettierrc` now uses `endOfLine: "auto"` so the file's existing line endings are preserved,
which removed the noise without reformatting (and without creating a huge, misleading diff).

## 2026-10-12 — Manual outreach log per proposal

### Baseline at start of pass
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing `react-refresh/only-export-components` warnings)
- `npm test` — 3 files / 11 tests passing
- `npm run build` — succeeded

### Changes
- **`src/lib/outreach.ts`** — pure helpers: `OUTREACH_CHANNELS`, `outreachSummary`,
  `readOutreachDetails` (defensive jsonb reader), `nowLocalInput` (datetime-local value).
- **Proposal detail (`/proposals/$id`)** — replaced the `window.prompt` "Record as sent" flow
  with an Outreach panel: channel select, happened-at datetime, and a response/notes field.
  Recording an outreach marks the proposal `SENT` (setting `sent_at`/`sent_channel`), inserts a
  `proposal_outreach` row into `business_activity_events` (so it shows on the business
  timeline), completes the matching open `send-proposal-<id>` task, and lists the proposal's
  outreach history inline.

### Non-breaking design decisions
- Uses only existing tables/columns (`proposals`, `business_activity_events`, `tasks`) — no
  migration, so the feature is fully live on the current database.
- The new `proposal_outreach` event type is additive; the previous `proposal_sent` events are
  still listed alongside it, so no historical outreach disappears.
- Channel defaults to the proposal's channel but is user-editable; the jsonb `details` reader
  tolerates missing/foreign shapes and never throws.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 4 files / 16 tests passing (added `src/lib/outreach.test.ts`)
- `npm run build` — succeeded

## 2026-10-12 — Offer catalog CRUD (P1) + generated-file cleanup

### Baseline at start of pass
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing `react-refresh` warnings)
- `npm test` — 2 files / 7 tests passing
- `npm run build` — succeeded

### Cleanup before the feature
- The Supabase integration files (`src/integrations/supabase/{auth-attacher,auth-middleware,client,client.server,cron-auth,previewAuthStorage,types}.ts`)
  are marked "automatically generated"; Prettier/`eslint --fix` had reflowed them into needless
  churn. They were reverted and added to both `.prettierignore` and the ESLint `ignores` list.
  `types.ts` was restored to its generated style and only the six real activity columns were
  re-applied, cutting the diff to +18 lines.

### Changes
- **Migration `0004_offers_catalog.sql`** adds an owner-scoped `offers` table
  (`id, owner_id, name, default_price, currency, deliverables, notes, active, position,
  created_at, updated_at`) with RLS `owner_id = auth.uid()`, grants, and a `(owner_id, position)`
  index. Additive only — no existing table touched.
- **`src/lib/offers.ts`** — pure, dependency-free catalog helpers (`Offer`, `DEFAULT_OFFERS`
  seeded from the historical `OFFER_LIST`, `sortOffers`, `activeOfferNames`, `offerNamesForFloors`).
- **`src/lib/offers.hooks.ts`** — `useOffers()` reads the catalog and, if the table is missing,
  returns `DEFAULT_OFFERS` with `persisted: false` instead of throwing.
- **Settings (`/settings`)** — new "Offer catalog" editor (add / edit name, default price,
  currency, deliverables, notes, active / delete) with a batch save; the pricing-floor list is now
  driven by the catalog (falling back to built-in names). A banner explains when `0004` is not yet
  applied.
- **`BusinessWorkspace`** — the proposal offer dropdown now lists the owner's active offers,
  falling back to the built-in list if the catalog is empty.

### Non-breaking design decisions
- The static `OFFER_LIST` / `DEFAULT_OFFERS` seed keeps every proposal path working even before
  migration `0004` is applied, so nothing is blocked on the database.
- `useOffers()` swallows only the "table missing" read error (returns defaults); genuine errors
  still surface through React Query. No writes are attempted when the table is absent.
- No existing table, route, column or server function was removed or renamed.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing `react-refresh/only-export-components` warnings)
- `npm test` — 3 files / 11 tests passing (added `src/lib/offers.test.ts`)
- `npm run build` — succeeded

### Known limitation
Migration `0004` cannot be applied from this environment (no service-role key; Lovable-only
migration URL). Until it is applied, the catalog UI shows built-in defaults read-only and states
this in the banner. See `docs/GARE_DB_RUNBOOK.md`.

## 2026-10-12 — Channel-aware drafting + proposal outcomes / win rate

### Baseline at start of pass
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing `react-refresh` warnings)
- `npm test` — 4 files / 16 tests passing
- `npm run build` — succeeded

### Changes
- **Copy-paste channels (`src/lib/channels.ts`)** — canonical channel list (Email, WhatsApp,
  SMS, LinkedIn, Instagram DM, Facebook Messenger, Phone call script, Formal document) with
  per-channel format rules, fed into drafting so the AI output is ready to paste as-is.
- **`proposals.server.ts`** — the prompt now includes a `CHANNEL FORMAT:` line from
  `channelGuidance()` plus rules: write for the exact channel, plain text only (no markdown),
  body copy-paste ready, title = email subject (short label otherwise).
- **Proposal Studio** — the channel dropdown uses `PROPOSAL_CHANNELS` and shows the current
  channel's format hint under the extra-instructions box.
- **Proposal outcomes (`src/lib/outcomes.ts`)** — `summarizeOutcomes` computes won/lost,
  decided, win rate (rounded, or null), pipeline and won value.
- **`proposals.$id`** — new "Outcome" panel to record the reason (reuses `proposals.outcome`),
  logging a `proposal_outcome` event to the business timeline.
- **Dashboard** — new "Win rate" card (won · lost · in progress).

### Non-breaking design decisions
- Channels are plain strings; unknown/legacy channels still work via a generic fallback
  guidance, so existing proposals and the outreach log are unaffected.
- No schema change or migration: the outcome reuses `proposals.outcome` and `proposals.status`.
- Win rate is null (shown as "—") until a proposal is decided, so it never reports a
  misleading 0%.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 6 files / 23 tests passing (added `channels.test.ts`, `outcomes.test.ts`)
- `npm run build` — succeeded

## 2026-10-12 — Orders + delivery + CSV exports

### Baseline at start of pass
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing warnings)
- `npm test` — 36 tests passing
- `npm run build` — succeeded

### Changes
- **Orders (migration `0006_orders_delivery.sql`)** — owner-scoped `orders` table + Orders page
  (create from proposal/invoice, delivery checklist, status transitions, mark fulfilled), hooks
  and pure helpers (`src/lib/orders.ts`) with tests.
- **CSV export** — `src/lib/csv.ts` (`rowsToCsv`, `downloadCsv`) with tests, wired as an
  "Export CSV" button on Proposals, Invoices and Orders.
- **Quick links** — proposal detail has "Create invoice" / "Create order".

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 46 tests passing
- `npm run build` — succeeded

## 2026-10-12 — Opportunity intelligence foundations + validation planner

### Baseline at start of pass
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing warnings)
- `npm test` — 46 tests passing
- `npm run build` — succeeded

### Changes
- **Evidence integrity (`src/lib/evidence.ts`)** — `freshnessDays`, `isStale`,
  `normalizeConfidence` (pure + tested).
- **Source registry (`src/lib/sources.ts`)** — `Source` type + `scanHealth()` (pure + tested).
- **Explainable ranking (`src/lib/ranking.ts`)** — `rankScore` / `explainRank` over evidence,
  fit, feasibility, speed and margin with configurable weights (pure + tested).
- **Validation planner (`src/lib/validation.ts`)** — `defaultPlan`, `canValidate` and a safe
  `readPlan` jsonb reader (pure + tested).
- **Discover** — a live "Source health" chip derived from real `discovery_runs` (ok/stale + last
  error); no new table.
- **Business page** — an "evidence freshness" badge from real `website_checked_at` /
  `activity_checked_at` (flags >30 days old).
- **Validation planner UI (`src/components/ValidationPlanner.tsx`)** — the 9-step low-cost
  validation plan on the business page; saving stores `businesses.validation_plan` and recording
  an outcome logs a `validation_outcome` event. Migration `0007_business_validation_plan.sql`
  adds the nullable column.

### Non-breaking design decisions
- `0007` adds one nullable jsonb column; reading is safe before it is applied, and saving shows
  the migration hint instead of failing hard.
- Ranking is NOT surfaced with invented numbers: the app has no owner skills/budget profile, so
  fit/margin inputs would be fabricated. The ranker exists as a tested library and will be shown
  once real owner-profile data exists (audit marks this BLOCKED on owner-profile data).
- Every new pure module has unit tests; no route/table/column removed or renamed.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 47 tests passing
- `npm run build` — succeeded

## 2026-10-12 — Rwanda Business Intelligence, Phase 1 (foundation)

Spec: `docs/GARE_RWANDA_INTELLIGENCE_SPEC.md`. Plan + audit: `docs/GARE_RWANDA_PLAN.md`.

### Baseline at start of pass
- `npx tsc --noEmit` — 2 errors, both in the untracked WIP `src/routes/_authenticated/businesses.tsx`
  (array-of-arrays passed to `rowsToCsv`). Committed code clean.
- `npm run lint` — 18 errors, all Prettier, all in the untracked `businesses.tsx`; 7 pre-existing
  `react-refresh` warnings elsewhere.
- `npm test` — 13 files / 47 tests passing.
- `npm run build` — succeeded.

### Changes
- **`src/lib/rwanda.ts`** — Rwanda taxonomy: 5 provinces / 30 districts, province + Kinyarwanda
  aliases, 14 industry categories, `classifyIndustry`, `normalizeDistrict/Province`,
  `provinceOfDistrict`, `parseLocation` (never guesses), `matchesLocation` (pure + tested).
- **`src/lib/company-identity.ts`** — canonical name normalisation (strips legal suffixes/accents),
  domain/phone normalisation, `nameSimilarity` (token Jaccard), `matchBusiness` and
  `dedupeBusinesses` for cross-source dedupe (pure + tested).
- **`src/lib/provenance.ts`** — verification statuses + labels, `isFactual` (AI inference is never a
  fact), `bestStatus`, per-status freshness, `isProvenanceStale`, and `mergeFact` which preserves
  conflicts instead of choosing a value (pure + tested).
- **`src/lib/source-registry.ts`** — typed registry of permitted sources with access status,
  legality + cost + scan-interval metadata. Only the Maps connector is `available`; official /
  tenders / jobs sources are `requires_authorization`/`unverified` with reasons; CAPTCHA/paywall
  bypass is `blocked` with an explicit reason. `coverageReport` states coverage is partial
  (pure + tested).
- **`drizzle/migrations/0008_rwanda_intelligence.sql`** — additive: comprehensive business profile
  columns (location, industry, registration, workforce, commercial model, suppression) plus
  `business_sources`, `business_facts`, `company_events`, `source_scans` tables with the standard
  `owner_id = auth.uid()` RLS, grants and indexes. Journal updated (`_journal.json` idx 8).
- **`src/routes/_authenticated/businesses.tsx`** — fixed the WIP page (type + lint) and added
  province / district / industry / website-status filters, an industry-aware CSV export, and a
  source-coverage panel derived from the registry. Reads only existing columns, so it works on the
  current database before `0008` is applied.

### Non-breaking design decisions
- Migration `0008` is entirely additive (nullable/defaulted columns, new tables only). No existing
  table, column, route or server function was removed or renamed.
- All new libraries are pure and dependency-free, matching the repo's existing
  `src/lib/*.ts` + colocated `.test.ts` convention.
- The source registry records blocked/pending integrations with reasons instead of implying
  coverage the app does not have (spec §2/§13).
- The Businesses page intentionally does not read `0008` columns yet, so nothing breaks if the
  migration is not applied; enrichment that writes those columns is Phase 2+.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing `react-refresh/only-export-components` warnings)
- `npm test` — 17 files / 71 tests passing (added `rwanda`, `company-identity`, `provenance`,
  `source-registry` test files)
- `npm run build` — succeeded

### Preserved uncommitted user changes
- `src/routes/_authenticated/businesses.tsx` was completed rather than discarded; the nav entry in
  `route.tsx` and generated `routeTree.gen.ts` are untouched in intent.

### Known limitations / follow-ups
- `drizzle/migrations/0006_orders_delivery.sql` still contains leftover merge-conflict markers
  (pre-existing, committed, already-applied migration — left untouched intentionally). Follow-up.
- Migration `0008` cannot be applied from this environment (no service-role/migration URL); it is
  applied on the Lovable platform.
- Phase 2 (live permitted sources) is limited by access: the only technically accessible source is
  Google Maps; others are recorded as pending with reasons.

## 2026-10-12 — Phase 2: bounded Rwanda Google Maps scan (Maps only)

User-selected scope for Phase 2: reuse the existing Maps connector only (no new sources, no new
external access), with strict cost bounds and durable scan records.

### Baseline before changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing `react-refresh` warnings)
- `npm test` — 17 files / 71 tests passing
- `npm run build` — succeeded

### Changes
- **`src/lib/rwanda-scan.ts`** (+ `rwanda-scan.test.ts`) — pure scan planner / cost controller:
  industry → search terms, scope (national / provinces / districts) → plan, hard caps
  `MAX_RESULTS_PER_QUERY = 20`, `MAX_QUERIES_PER_RUN = 10`, `COST_PER_QUERY_USD = 0.032`, and
  `withinBudget` / truncation. No I/O, fully tested.
- **`src/lib/rwanda-discovery.functions.ts`** — `runRwandaScan` server function: builds a plan,
  creates a `discovery_runs` row, writes `source_scans` (status/cost/items), runs the bounded
  Maps searches, de-duplicates results with `dedupeBusinesses`, inserts new businesses (with a
  fallback when `0008` profile columns are not yet present), and links `search_run_results`.
- **`src/integrations/supabase/types.ts`** — added the `0008` businesses profile columns and the
  `business_sources`, `business_facts`, `company_events`, `source_scans` tables so the server
  function typechecks.
- **`src/routes/_authenticated/discover.tsx`** — "00 · Rwanda scan presets" panel: industry
  multi-select, national / province / district scope, live plan + estimated cost preview, run
  button, and result summary.

### Non-breaking design decisions
- Scan cost is bounded in the pure planner before any paid call, and previewed in the UI before
  running (spec §10).
- New businesses still insert with existing columns; `0008` enrichment columns are written only
  when available, so the feature works before the migration is applied.
- No new external source access; other registry sources remain pending/blocked with reasons.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 18 files / 77 tests passing (added `rwanda-scan` test file)
- `npm run build` — succeeded

### Known limitations / follow-ups
- Live Maps calls cannot be exercised here (no `LOVABLE_API_KEY` / `GOOGLE_MAPS_API_KEY`).
- `source_scans` / `business_*` writes require migration `0008` to be applied (Lovable platform).

## 2026-10-12 — Phase 3/4 pure libraries: activity signals + service matching

### Baseline before changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing warnings)
- `npm test` — 18 files / 77 tests passing
- `npm run build` — succeeded

### Changes
- **`src/lib/activity.ts`** (+ `activity.test.ts`) — company activity/hiring monitoring per spec §6:
  explicit statuses (`active`/`closed`/`expired`/`removed`/`unverified`/`unknown`), activity kinds,
  `isGenuinelyNew` / `classifyDiscovery` (distinguishes a newly discovered OLD listing from a real new
  one), `diffActivity` change tracking, conservative `signalStrength`, `isHiringKind`, and the
  `HIRING_DISCLAIMER` that hiring signals do not prove budget or intent. Pure + tested.
- **`src/lib/service-match.ts`** (+ `service-match.test.ts`) — evidence-backed service-to-company
  matching per spec §7: only owner-confirmed services are proposed; a match requires an observed
  problem linked to the service; confidence combines evidence confidence × verification weight ×
  severity × industry fit × freshness; weak/AI/inference matches are explicitly labelled
  `hypothesis` with capped confidence; each match carries the §7 explanation (observed problem,
  evidence + freshness, why relevant, suggested contact role — labelled a suggestion, next action,
  uncertainties, effort, recurring). Pure + tested. Reuses `provenance.ts` (facts vs inference) and
  `rwanda.ts` (industry labels).

### Non-breaking design decisions
- New libraries are pure and dependency-free, matching the repo's `src/lib/*.ts` + `.test.ts` pattern.
- `signalStrength` and service-match confidence deliberately stay conservative and never assert a
  company need or a verified buyer.
- `buildServiceCatalog` maps the owner's active offer names to observable problem keys by keyword;
  offers that do not clearly map are skipped rather than guessed, and only active/confirmed offers
  are ever matched.
- The business profile UI derives problems from MEASURED website-audit findings (not AI text) and
  reuses the existing `report`/findings data, so nothing is fabricated and no extra scan is needed.

### UI wiring (revised — feature kept on its OWN page)
- **DECISION:** the Rwanda intelligence must live on a dedicated page, not injected into the
  existing Discover flow or the `businesses.$id` detail page. `discover.tsx` and `businesses.$id.tsx`
  were reverted to their committed state (the detail page's "Run investigation" button at
  `businesses.$id.tsx:262` is untouched).
- **`src/routes/_authenticated/rwanda.tsx`** (new, route `/_authenticated/rwanda`, "Rwanda Intel",
  `Factory` icon in nav) — the dedicated company-intelligence page:
  - Scan presets: industry multi-select, national/province/district scope, `buildScanPlan` preview
    (bounded to `MAX_QUERIES_PER_RUN`), and `runRwandaScan`.
  - Companies table from `businesses` (`select("*")`, limit 1000) with province/industry/website/
    status/search filters; uses `locationOf` to prefer stored `province`/`district` and fall back to
    `parseLocation(address)` so it works before AND after migration `0008`.
  - "Signals" map from `company_events` (graceful when the table is absent) and a per-row
    "Run investigation" button calling `investigateBusiness`.
- **`src/routes/_authenticated/businesses.tsx`** (rebuilt) — "Leads": a no-website leads list for the
  original goal. Defaults to the `no_site` website filter, with search + province + industry filters
  and a per-row "Run investigation" button. (This file is untracked; the user's previous version
  could not be recovered from git.)

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 20 files / 108 tests passing (added `activity`, `service-match`, ranking §8 tests)
- `npm run build` — succeeded

### Open follow-ups
- Wire `activity.ts` into list-level filters / activity signals panel (library is ready + tested).
- Phase 5: pipeline/proposal integration + cost budgets.

## 2026-10-12 — Phase 4 ranking: extended §8 opportunity model

### Baseline before changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (7 pre-existing warnings)
- `npm test` — 20 files / 99 tests passing
- `npm run build` — succeeded

### Changes
- **`src/lib/ranking.ts`** — added an extended Rwanda ranking model without touching the existing
  `rankScore`/`explainRank`/`Opportunity`/`Weights` API:
  - `ExtraFactors` + `RankedOpportunity` — optional `signal_strength`, `affordability`,
    `contactability`, `recurring`, `competition`, `accessibility`, `risk` (unmeasured defaults to a
    neutral 0.5 so a missing factor never silently helps or hurts).
  - `FullWeights` + `DEFAULT_FULL_WEIGHTS` (renormalised to sum 1).
  - `rankOpportunity` returns `{ priority, confidence, needsVerification, factors, reasons }` —
    priority is the weighted sum of factor "goodness" (competition/risk inverted); confidence is the
    factual confidence kept separate; `needsVerification` is set when confidence < 0.6.
  - `compareRanked` — priority first, then confidence.
  - `weightsFromPreferences` — configurable owner preferences (remote / low-startup / local-only /
    online delivery) shift factor weights only, then renormalise. Never changes per-business evidence.
  - Deliberately excludes size/fame/hiring from scoring per spec §8.

### Non-breaking design decisions
- The original ranking API is unchanged; the extended model is additive and opt-in.
- Priority and factual confidence are separate outputs, so a high-priority lead with weak evidence is
  visibly flagged rather than hidden.
- Preferences adjust weights, not evidence, to avoid preference-driven false precision.

### Verification after changes
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (same 7 pre-existing warnings)
- `npm test` — 20 files / 108 tests passing (ranking §8 tests added)
- `npm run build` — succeeded

## How to use this log

Add a dated section for each change set with: the baseline results, the changes, any
non-breaking design decisions, and the results of the four verification commands.

