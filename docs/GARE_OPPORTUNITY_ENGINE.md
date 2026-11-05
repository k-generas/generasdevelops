# GARE Opportunity Engine — Phases 2–6

Date: 2026-11-05
Status: implemented and verified locally; additive migrations applied to production.

## Objective

Turn recorded social matches and business-audit evidence into reviewable opportunities,
with explainable scoring, evidence-backed solution fits, conservative stage rules, manual
outreach logging and proposal drafting. The engine interprets existing evidence only. It does
not scrape, contact anyone, merge businesses, invent customer/revenue/budget facts or set a
price automatically.

## What was built

- **Pure opportunity engine** — `src/lib/opportunity-engine.ts` builds opportunities from
  usable gaps, scores them through the existing ranking module, maps gaps to the solution
  catalogue, merges refreshed evidence, converts audit findings into gaps, enforces stage
  transitions and summarises the workspace.
- **Authenticated server functions** — `src/lib/opportunity.functions.ts` lists, generates,
  refreshes, updates, logs outreach for and drafts proposals from owner-scoped opportunities.
- **Additive schema** — `supabase/migrations/20261106000000_opportunities_engine.sql`
  extends `opportunities` and links `proposals.opportunity_id`. Drizzle parity is in
  `drizzle/migrations/0028_opportunities_engine.sql`.
- **Workspace UI** — `src/routes/_authenticated/opportunities.tsx` adds summary cards, stage /
  priority / source / validation filters, generation from confirmed or high-confidence
  social matches, evidence refresh, stage moves, problem confirmation, qualification,
  outreach logging and proposal drafting. The page is linked from the authenticated nav.
- **Generated types** — `src/integrations/supabase/types.ts` includes `opportunities`,
  `opportunity_signals`, the new opportunity columns and `proposals.opportunity_id`.

## Data model

`opportunities` gains:

- Source and evidence — `source` (`social_match`, `business_audit`, `manual`, `signal`),
  `source_status`, `source_confidence`, `social_lead_id`, `social_match_id`
- Scoring — `priority`, `score` (0–100), `score_factors`, `score_reasons`
- Evidence — `gaps`, `solution_fits`, `solution_details`, `last_verified_at`
- Delivery hypothesis — `estimated_effort`, `recurring`
- Owner workflow — `last_outreach_at`, `last_response_at`, `outreach_count`,
  `owner_notes`, `dismissed_reason`, `dedupe_key`

`proposals` gains `opportunity_id` with `ON DELETE SET NULL`, so removing an opportunity
does not delete proposal history.

Indexes support owner score ordering, priority and source filters, social-lead lookup and
proposal lookup. A partial unique index on `(owner_id, dedupe_key)` keeps regeneration
idempotent while allowing legacy rows with no dedupe key. All owner tables keep
`auth.uid() = owner_id` RLS. Nothing is deleted or rewritten by the migration.

## Opportunity lifecycle

Stages reuse `opportunity-qualification.ts`:

`DISCOVERED → RESEARCHING / NEEDS_VALIDATION / VALIDATION_IN_PROGRESS → QUALIFIED →
READY_TO_PROPOSE → PROPOSAL_SENT → WON / LOST`, plus `DISQUALIFIED`.

- Confirmed problem is required for `QUALIFIED`, `READY_TO_PROPOSE`, `PROPOSAL_SENT` and
  `WON`.
- Confirming the problem while the opportunity is still `DISCOVERED` is rejected; move it
  into validation first.
- `DISCOVERED` can move directly to `VALIDATION_IN_PROGRESS` when the owner has evidence.
- Stage changes are recorded as `business_activity_events`; `QUALIFIED` and
  `READY_TO_PROPOSE` create deduped follow-up tasks.
- `WON` / `LOST` update the business outreach stage.
- Terminal stages are `WON`, `LOST` and `DISQUALIFIED`; reopening is explicit through the
  allowed transition map.

## Scoring and evidence rules

- Only usable gaps count: non-empty key and evidence, confidence at least 0.3 and a
  verification status other than `unknown`.
- Scores are produced by the existing explainable `rankOpportunity` module; the stored score
  is the priority value rounded to 0–100 and the reasons include the ranker output plus
  explicit uncertainties.
- Confidence is capped by source status: `confirmed` 0.9, `high_confidence` 0.75, otherwise
  0.6, and is combined from gap confidence (70%) and source confidence (30%).
- Stale or non-factual evidence lowers signal strength and marks the opportunity as needing
  verification.
- No usable evidence means no opportunity; missing data stays unknown rather than being
  turned into a claimed loss.

## Solution mapping

The solution catalogue covers `DukaLinka`, `GENERAS Digital`, `GENERAS Systems` and
`Custom software`. Recorded gaps map to one or more fits with deliverables, effort, recurring
flag, limitation, confidence and unverified assumptions. `Custom software` is only added as a
hypothesis when at least two usable gaps span presence, selling or contact handling. Every fit
keeps its gap keys so the recommendation can be traced back to evidence.

## Evidence refresh

`refreshOpportunityEvidence` can re-score from stored gaps and optionally run a fresh bounded
website check and business audit:

- Website verification reuses the existing website finder.
- Website probing and audit generation reuse the existing investigation/audit modules.
- Audit findings are converted into gaps only when the check is observed or inferred and the
  severity is medium or higher.
- New gaps are merged by key, keeping the stronger evidence.
- The owner's stage, validation decision and notes are preserved.
- The audit and an activity event are recorded; `audit_id` links the latest audit.

## Outreach and proposals

- Outreach is recorded manually with channel, time, response flag and note. It updates the
  opportunity counters, adds a timeline event and moves the business to `messaged` or
  `replied` unless the opportunity is terminal.
- No message is sent by the system.
- Proposal drafting requires a confirmed problem and a stage of `QUALIFIED`,
  `READY_TO_PROPOSE` or `PROPOSAL_SENT`.
- The proposal prompt includes the recorded problem, recommended solution and gap evidence,
  and explicitly forbids inventing prices, metrics or commitments.
- Price stays `null` and currency is `USD`; the owner sets commercial terms in the existing
  proposal editor.
- The created proposal is linked through `proposals.opportunity_id` and the opportunity moves
  to `READY_TO_PROPOSE`.

## API usage and cost

Generation from social matches reads stored Supabase rows only and reports
`requestCostUsd: 0`. Evidence refresh reuses the existing bounded website verification and
audit flows already used elsewhere in the app. Google Maps usage is unchanged and no paid
social API is called. Meta live discovery remains unavailable until credentials and
permissions are configured.

## Security and privacy

- Every read and write uses the authenticated Supabase client and owner-scoped RLS.
- Server functions use `requireSupabaseAuth` and validate inputs with zod.
- No service-role or API keys are exposed to the client.
- No scraping, login-wall access, CAPTCHA/rate-limit bypass or automated outreach was added.
- Stage, confirmation, outreach and proposal actions remain explicit owner decisions.

## How to use

1. Confirm the additive migrations are applied:
   `20261105000000_social_business_matches.sql` and
   `20261106000000_opportunities_engine.sql`.
2. Review and confirm social matches first. Generation only reads `confirmed` and
   `high_confidence` matches with recorded gaps.
3. Open **Opportunities** and choose **Generate**.
4. Open an opportunity to review gaps, solution fits, evidence and uncertainty reasons.
5. Move it into validation, confirm or deny the problem, then qualify it.
6. Optionally refresh evidence to run a new audit and re-score.
7. Log manual outreach, then draft a proposal once the opportunity is qualified.

If the table or migrations are missing, the server functions return clear setup messages and
the page shows an empty state instead of failing silently.

## Verification

- `npx tsc --noEmit` — clean after implementation.
- `npm test` — 47 test files / 353 tests passing.
- Targeted engine and matcher tests — 29 passing (12 engine tests).
- `npm run build` — succeeded; generated the `/opportunities` route.
- Targeted ESLint/Prettier on all changed/new files — clean.
- Production schema verified after applying both migrations: new columns, indexes, RLS and
  `proposals.opportunity_id` are present.
- Full `npm run lint` still reports pre-existing CRLF/Prettier errors in untouched files.

## Production rollout notes

- Both additive migrations have been applied to production.
- Production currently has no social leads, social matches or opportunities, so generation
  and the full workspace flow still need exercising with real owner data once available.
- No existing business, social-lead, proposal or opportunity rows were deleted or merged.
- Do not enable live Meta discovery until credentials and permissions are configured.

## Limitations

- Generation quality depends on recorded social-match gaps and business evidence.
- Audit-derived gaps are limited to the checks the audit actually performs.
- Scores are prioritisation aids, not forecasts of revenue or willingness to buy.
- Owner interest, budget, process and authority stay unverified until the owner records
  them.
- The workspace lists up to 1,000 opportunities per read and 300 after filters; generation
  scans at most 1,000 eligible matches per request.
- Proposal drafting uses the existing AI provider configuration; when no provider is
  available it reports the existing configuration error.

## Rollback

The migration is additive and can be rolled back without touching existing business,
social-lead or proposal data:

```sql
DROP INDEX IF EXISTS public.idx_proposals_opportunity;
DROP INDEX IF EXISTS public.idx_opportunities_social_lead;
DROP INDEX IF EXISTS public.idx_opportunities_owner_source;
DROP INDEX IF EXISTS public.idx_opportunities_owner_priority;
DROP INDEX IF EXISTS public.idx_opportunities_owner_score;
DROP INDEX IF EXISTS public.uq_opportunities_owner_dedupe;

ALTER TABLE public.proposals
  DROP COLUMN IF EXISTS opportunity_id;

ALTER TABLE public.opportunities
  DROP COLUMN IF EXISTS dedupe_key,
  DROP COLUMN IF EXISTS dismissed_reason,
  DROP COLUMN IF EXISTS owner_notes,
  DROP COLUMN IF EXISTS outreach_count,
  DROP COLUMN IF EXISTS last_response_at,
  DROP COLUMN IF EXISTS last_outreach_at,
  DROP COLUMN IF EXISTS last_verified_at,
  DROP COLUMN IF EXISTS recurring,
  DROP COLUMN IF EXISTS estimated_effort,
  DROP COLUMN IF EXISTS solution_details,
  DROP COLUMN IF EXISTS solution_fits,
  DROP COLUMN IF EXISTS gaps,
  DROP COLUMN IF EXISTS score_reasons,
  DROP COLUMN IF EXISTS score_factors,
  DROP COLUMN IF EXISTS score,
  DROP COLUMN IF EXISTS priority,
  DROP COLUMN IF EXISTS social_match_id,
  DROP COLUMN IF EXISTS social_lead_id,
  DROP COLUMN IF EXISTS source_confidence,
  DROP COLUMN IF EXISTS source_status,
  DROP COLUMN IF EXISTS source;
```

Rollback removes new evidence, scoring and workflow fields. Existing opportunity rows,
stages and owner decisions remain; generated rows are not deleted automatically.
