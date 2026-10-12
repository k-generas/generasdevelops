# GARE — Regression Log

A running record of changes and the verification that they did not break existing behaviour.

## Verification commands (run from the project root)

```
npx tsc --noEmit
npm run lint
npm test
npm run build
```

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

## How to use this log

Add a dated section for each change set with: the baseline results, the changes, any
non-breaking design decisions, and the results of the four verification commands.

## 2026-10-12 � Orders + delivery + CSV exports
- Added orders (0006), UI with checklist, CSV exports on three pages. All verify commands passed.

