# GARE Global Intelligence Implementation

## Status

Foundation and campaign phases are implemented in code and tests. The additive database
migrations are created but not yet applied to hosted Supabase because the Lovable MCP OAuth
refresh token was invalidated during this pass.

Verification completed:

- `npx tsc --noEmit` - clean
- `npm test` - 55 files / 448 tests passing
- `npm run build` - successful; `/professionals`, `/compliance`, `/providers`, `/exports` and
  `/campaigns` generated
- Targeted ESLint/Prettier on all new or changed files - clean

## What shipped

### 1. Professional intelligence

Files:

- `src/lib/professional-intelligence.ts`
- `src/lib/professional-intelligence.test.ts`
- `src/lib/professionals.functions.ts`
- `src/routes/_authenticated/professionals.tsx`

Capabilities:

- Professional type, verification, availability and relationship-stage taxonomies.
- Name, email, phone, URL and list normalisation.
- Strong-to-weak dedupe keys: profile URL, public email, public phone, name plus country.
- Validation for name, email, phone, URLs, confidence and evidence.
- Conservative suggested confidence and profile completeness.
- Owner-scoped list with search, country, type, verification, availability and stage filters.
- Summary counts for people, verified, open to work, email, phone and do-not-contact.
- Create, edit and delete with evidence/source fields.
- Business links with relationship type, role, confidence, verification and evidence.
- Missing-table setup mode instead of an opaque failure.

### 2. Compliance and suppression

Files:

- `src/lib/compliance.ts`
- `src/lib/compliance.test.ts`
- `src/lib/compliance.functions.ts`
- `src/routes/_authenticated/compliance.tsx`

Capabilities:

- Contact channels: email, WhatsApp, phone, SMS, LinkedIn and contact form.
- Suppression scopes: contact, email, phone, domain, business and professional.
- Suppression matching by channel, scope, normalised value and expiry.
- Country policy templates with owner-review-required flags.
- Eligibility result with blocked, review-required or allowed status, reasons and requirements.
- Suppression CRUD, summary and pagination.
- Business do-not-contact flag and reason.
- Policy lookup API for future outreach workflows.
- UI for ledger management, eligibility checks, business suppression and policy review.

### 3. Provider registry

Files:

- `src/lib/provider-registry.ts`
- `src/lib/provider-registry.test.ts`
- `src/routes/_authenticated/providers.tsx`

Capabilities:

- Catalogue entries for Places, Geoapify, Nominatim, website checks, AI, registries, public
  professional pages, Meta, LinkedIn, email verification and news feeds.
- Capabilities, coverage, cost model, credential keys, automation and compliance notes.
- Runtime status: available, configured unverified, unavailable, blocked or review required.
- LinkedIn explicitly blocked for automation.
- AI treated as configured but unverified; quota and billing are not proven.
- Provider page reads `getSystemStatus`; it does not call paid APIs.

### 4. Safe exports

Files:

- `src/lib/export-safe.ts`
- `src/lib/export-safe.test.ts`
- `src/routes/_authenticated/exports.tsx`
- `src/lib/export.ts`
- `src/lib/export.ts` backup list now includes all six new tables.

Capabilities:

- Formula-injection neutralisation for text starting with risky characters.
- Safe CSV with UTF-8 BOM.
- Dependency-free XLSX workbook built as an in-memory ZIP.
- Safe filenames and sheet names.
- Browser downloads for businesses, professionals and suppression.
- 5,000-row limit per dataset in the export page.

### 5. Outreach guard

File:

- `src/routes/_authenticated/proposals.$id.tsx`

Capabilities:

- Record outreach is disabled until the owner confirms lawful-basis review.
- The page calls `checkOutreachEligibility` for email, WhatsApp, phone, SMS and LinkedIn.
- Blocked suppression or do-not-contact results stop recording.
- In-person and other channels require manual confirmation because they cannot be matched
  automatically.
- The activity event stores compliance status, reasons, check time and owner confirmation.
- Existing proposal status, task completion and event logging are preserved.

### 6. Campaigns and manual review queue

Files:

- `src/lib/campaign.ts`
- `src/lib/campaign.test.ts`
- `src/lib/campaigns.functions.ts`
- `src/routes/_authenticated/campaigns.tsx`

Capabilities:

- Campaign statuses, audience kinds, sequence steps and review-queue states.
- Deterministic template rendering with supported variables, whitespace cleanup and an automatic
  opt-out line when one is missing.
- Campaign/step validation: name, daily review limit, step order, channel, delay, subject and
  body bounds.
- Explicit queue transitions; blocked items cannot be approved; approval requires owner
  confirmation; "mark sent" requires an approved item plus manual-send confirmation.
- Owner-scoped campaign list, detail, sequence save, queue build, queue update and delete.
- Audience builder over existing businesses or professionals with bounded 1-50 row runs.
- Suppression ledger, business do-not-contact and professional do-not-contact are evaluated for
  every queued target. Missing email/phone for the selected channel becomes blocked.
- Drafts are generated locally from owner-authored templates. No AI, provider or sending API is
  called.
- UI exposes campaign settings, sequence editor, queue filters, summary counts, draft preview,
  approval, skip, mark-sent and remove actions.
- Missing-table setup mode points at the outreach campaign migration.

### 7. Navigation

File:

- `src/routes/_authenticated/route.tsx`

New entries: Professionals, Compliance, Providers, Exports and Campaigns.

## Database migrations

Files:

- `supabase/migrations/20261109000000_global_intelligence_foundation.sql`
- `supabase/migrations/20261111000000_outreach_campaigns.sql`

They create:

- `professionals`
- `professional_business_links`
- `suppression_entries`
- `outreach_campaigns`
- `outreach_campaign_steps`
- `outreach_queue_items`
- owner indexes, unique keys, grants and RLS policies
- a PostgREST schema reload notification

The migrations are additive and do not rewrite existing rows.

## Apply steps

1. Restore a valid Lovable MCP token or use an authorised SQL runner.
2. Apply both migrations in a transaction if the runner supports it.
3. Verify the tables, indexes and RLS policies exist.
4. Open `/professionals`, `/compliance`, `/exports` and `/campaigns` with the owner session.
5. Add a test professional, suppression entry and business link; confirm the owner can read and
   delete only their own rows.
6. Create a campaign with one step, build a small queue, and confirm items are review/blocked and
   never sent.
7. Run the check in `/compliance` and confirm a suppression match returns blocked.
8. Run the full test and build commands again.

## Remaining work

- Apply and verify the migrations in hosted Supabase.
- Add navigation badge counts for new records if useful.
- Add more tests for server functions and UI flows once a test database pattern exists.
- Integrate eligibility into any other outreach logging paths that may be added later.
- Expand source coverage and global discovery only after provider terms and quotas are reviewed.
- Add a retention/cleanup workflow for suppression and professional records.
- Campaign scheduling, sending, delivery tracking and reply ingestion remain future work; the
  current queue is intentionally manual.
- Complete the legal/compliance review with a qualified adviser.

## Rollback

The migrations only add tables. Before production data exists, rollback is:

```sql
DROP TABLE IF EXISTS public.outreach_queue_items;
DROP TABLE IF EXISTS public.outreach_campaign_steps;
DROP TABLE IF EXISTS public.outreach_campaigns;
DROP TABLE IF EXISTS public.professional_business_links;
DROP TABLE IF EXISTS public.professionals;
DROP TABLE IF EXISTS public.suppression_entries;
```

After production data exists, export first and use a reviewed migration rather than dropping
tables.
