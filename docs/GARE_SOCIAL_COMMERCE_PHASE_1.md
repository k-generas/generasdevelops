# GARE Social Commerce Intelligence — Phase 1

Date: 2026-11-05
Status: implemented and verified locally; production migration applied.

## Objective

Connect existing Google Places business records with existing public social leads so the
owner can review evidence-backed candidates, confirm or reject links, and see conservative
opportunity and solution hypotheses. Phase 1 does not scrape social platforms, bypass
access controls, send outreach, merge businesses, or invent customer/revenue facts.

## What was built

- **Pure matching engine** — `src/lib/social-business-match.ts` compares existing records
  only and returns candidates with status, confidence, signals, evidence, opportunity gaps
  and solution fits.
- **Authenticated server functions** — `src/lib/social-business-match.functions.ts` lists
  matches, runs a bounded matching scan, and records owner confirm/reject decisions.
- **Additive schema** — `supabase/migrations/20261105000000_social_business_matches.sql`
  adds account classification fields to `social_leads` and a dedicated
  `social_business_matches` review table. Drizzle parity is in
  `drizzle/migrations/0027_social_business_matches.sql`.
- **Review UI** — `src/components/SocialBusinessMatchPanel.tsx` is shown on business detail
  and in the social-lead detail dialog. It displays evidence, confidence, account type,
  gaps, solution hypotheses and review actions.
- **Generated types** — `src/integrations/supabase/types.ts` includes the new columns and
  table.

## Data model

`social_leads` gains:

- `account_type` — `confirmed_business`, `probable_business`, `individual_seller`, `unknown`
- `account_type_evidence` — evidence array supporting the classification
- `match_checked_at` — last time the lead was compared with business records

`social_business_matches` stores one row per owner, social lead and business candidate:

- `status` — `high_confidence`, `possible`, `conflicting`, `confirmed`, `rejected`
- `confidence` — numeric from 0 to 1
- `signals`, `evidence`, `opportunity_gaps`, `solution_fits` — JSONB evidence payloads
- `reason`, `review_note`, `matched_at`, `reviewed_at`, timestamps
- unique constraint on `(owner_id, social_lead_id, business_id)`

All rows are owner-scoped by RLS using `auth.uid() = owner_id`. No existing business or
social-lead rows are rewritten by the migration.

## Matching rules

- Phone match is strong independent evidence after normalisation.
- Website domain match excludes social platforms, link hubs, WhatsApp links and other
  shared hosts.
- Name similarity is supporting evidence only and cannot link a profile by itself.
- Location supports a candidate but never proves identity.
- High confidence requires independent contact evidence plus compatible identity evidence,
  or a unique strong combination of signals.
- Conflicting contact evidence produces `conflicting` even when names or locations look
  similar.
- Auto-link is allowed only when exactly one high-confidence candidate exists, there is no
  conflict, and the social lead is not already linked.
- Existing owner-confirmed or owner-rejected rows are preserved during rescans. Rejected
  rows are not silently recreated as pending candidates.
- A social lead linked to another business cannot be confirmed for a second business until
  the existing link is rejected.

## Account classification

Classification is conservative and evidence-based:

- `confirmed_business` — explicit business language plus compatible business evidence.
- `probable_business` — business-like naming/description but incomplete identity evidence.
- `individual_seller` — personal seller language without business indicators.
- `unknown` — insufficient evidence.

The original platform, handle, profile URL, biography, contact fields, website status,
store status and related profile data remain intact.

## Opportunity gaps and solution fits

Gaps are created only from recorded evidence, for example missing website, dead website,
link-hub-only presence, weak contact information or an unverified store path. Each gap keeps
its evidence, source, verification status, confidence and last-checked timestamp. Missing
evidence remains unknown; the system does not claim lost revenue, customer counts, owner
budget, order volume or manual process use.

Solution hypotheses may include `DukaLinka`, `GENERAS Digital`, `GENERAS Systems` or
`Custom software`. Multiple fits are allowed. Each includes the reasoning, confidence and
unverified assumptions.

## API usage and cost

Matching uses records already stored in Supabase. It makes no Google Places, Meta Graph,
website-fetch or AI calls, so a matching scan adds no API cost. Existing discovery and
website-verification flows are unchanged and stay bounded.

Meta live discovery remains unavailable until the production Meta credentials and
permissions are configured. The matcher works with imported or previously discovered
public profiles.

## Security and privacy

- Every table read/write goes through authenticated owner-scoped RLS.
- Server functions require the existing `requireSupabaseAuth` middleware.
- No credentials, tokens or service-role keys are exposed to the client.
- No scraping, CAPTCHA bypass, login-wall access, rate-limit bypass or automated outreach
  was added.
- Review decisions are explicit and reversible.

## How to use

1. Apply the additive migration:
   `supabase/migrations/20261105000000_social_business_matches.sql` (or `npm run db:migrate`
   with the configured database credentials).
2. Open a business detail page and use **Find matches** in the social business matches
   panel, or open a social lead and run matching for that profile.
3. Review the recorded signals, evidence, gaps and confidence.
4. Confirm the correct link or reject the candidate. Confirming links the social lead to the
   business; rejecting a linked candidate unlinks it.

If the table is missing, the panel shows the setup message instead of failing silently.

## Verification

- `npx tsc --noEmit` — clean after implementation.
- `npm test` — 46 test files / 341 tests passing.
- Targeted matcher tests — 17 passing.
- `npm run build` — succeeded.
- Targeted ESLint/Prettier check on all touched files — clean.
- Full `npm run lint` still reports pre-existing CRLF/Prettier errors in untouched files
  (hundreds of line-ending errors); no new errors remain in the files changed here.

## Production rollout notes

- The additive migration has been applied to production, and the new columns and table were
  verified in the production schema.
- Production currently has no social leads or matches, so the review flow still needs
  exercising with real owner data once discovery/import produces candidates.
- Do not enable live Meta discovery until the Meta app credentials and permissions are
  configured and reviewed.
- No existing business, social-lead or source records were deleted or merged.

## Limitations

- Matching quality depends on the completeness of recorded phone, website, name and
  location data.
- Names alone are not sufficient, so some real matches will remain `possible` rather than
  auto-linked.
- Social profile coverage is limited to profiles already imported or discovered through
  supported flows.
- Opportunity and solution outputs are hypotheses, not verified business facts.
- The full matching scan is bounded to 1,000 social leads per request. Use business-scoped
  or lead-scoped scans for targeted reviews.

## Rollback

The migration can be rolled back without affecting existing business or social-lead data:

```sql
DROP TABLE IF EXISTS public.social_business_matches;
ALTER TABLE public.social_leads
  DROP COLUMN IF EXISTS match_checked_at,
  DROP COLUMN IF EXISTS account_type_evidence,
  DROP COLUMN IF EXISTS account_type;
```

Rollback removes only matching data and classification columns. Confirm any auto-created
`social_leads.business_id` links first if they should not remain.
