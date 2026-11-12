# GARE Global Intelligence Architecture

## Purpose

GARE is being extended from a Rwanda-focused business discovery and revenue workspace into a
global business and professional intelligence system. The system helps the owner:

- find and qualify businesses and professional people;
- keep evidence, provenance and confidence with every record;
- understand relationships between people and businesses;
- decide whether outreach is lawful and permitted;
- log outreach without automating sends;
- export and back up the owner's data safely.

The existing CRM, discovery, proposal, finance, task, AI investigation and export features remain
the system of record. Global intelligence is additive.

## Core rules

1. Every owner-scoped table uses RLS with `owner_id = auth.uid()`.
2. AI may interpret collected evidence; it may not invent facts, intent, metrics or availability.
3. Paid and third-party providers are never shown as working unless the runtime proves they are
   configured. Configuration is not the same as verified quota or billing.
4. LinkedIn automation is blocked. No scraping behind logins, CAPTCHAs or paywalls.
5. Outreach is manual. The app records what the owner did; it does not send messages.
6. Suppression and do-not-contact always win over commercial interest.
7. Compliance content is a checklist, not legal advice. Owner review is required.
8. Exports neutralise spreadsheet formulas and stay owner-scoped.

## Layers

### Data layer

- Existing tables such as `businesses`, `proposals`, `business_activity_events`, `tasks` and
  `discovery_runs` remain unchanged.
- New tables: `professionals`, `professional_business_links`, `suppression_entries`,
  `outreach_campaigns`, `outreach_campaign_steps`, `outreach_queue_items`, `prospect_lists`.
- Migrations: `supabase/migrations/20261109000000_global_intelligence_foundation.sql`,
  `supabase/migrations/20261111000000_outreach_campaigns.sql` and
  `supabase/migrations/20261112000000_prospect_lists.sql`.
- All new tables are owner-scoped with RLS and authenticated grants.

### Domain logic

Pure, testable modules with no network or database access:

- `src/lib/professional-intelligence.ts` - taxonomies, normalisation, dedupe, validation,
  confidence, completeness and display labels.
- `src/lib/compliance.ts` - channels, policy templates, suppression normalisation/matching,
  expiry, outreach eligibility and summaries.
- `src/lib/provider-registry.ts` - provider catalogue, runtime status resolution and summaries.
- `src/lib/export-safe.ts` - formula sanitisation, safe CSV and dependency-free XLSX writing.
- `src/lib/campaign.ts` - campaign statuses, template rendering, validation, queue transitions,
  approval gates and summaries.
- `src/lib/prospect-lists.ts` - saved-list filter normalisation, validation, preview rows and
  audience-safe chips.
- `src/lib/prospect-intent.ts` - deterministic natural-language prompt interpretation, AI result
  validation and unsupported-condition reporting.
- `src/lib/ai-usage.ts` - per-owner burst/day AI usage limiter and truthful limit messages.

### Server functions

Authenticated TanStack server functions:

- `src/lib/professionals.functions.ts` - professional list/summary/save/delete and
  professional-business links.
- `src/lib/compliance.functions.ts` - suppression CRUD, summary, outreach eligibility check,
  policy lookup and business do-not-contact flag.
- `src/lib/campaigns.functions.ts` - campaign CRUD, sequence save, bounded audience queue build
  from ad-hoc filters or a saved list, queue status updates and queue deletion.
- `src/lib/prospect-lists.functions.ts` - saved-list CRUD, live counts, previews and bounded
  export rows.
- `src/lib/prospect-intent.functions.ts` - authenticated prompt interpretation; deterministic
  rules by default, optional per-owner rate-limited AI with validated output and rule-based
  fallback.
- `src/lib/prospect-intent.server.ts` - AI schema/instructions and orchestration with an injectable
  provider caller for fallback tests.
- `src/lib/prospect-queries.server.ts` - owner-scoped business/professional filter queries shared
  by lists and campaign queue builds.
- `src/lib/system.functions.ts` - runtime provider configuration status without exposing keys.

Server functions read the caller through `requireSupabaseAuth` and always filter by owner.

### UI

Authenticated pages under `src/routes/_authenticated/`:

- `/professionals` - evidence-based professional directory with filters, edit dialog, confidence,
  completeness and business links.
- `/lists` - saved business/professional prospect filters, natural-language audience
  interpretation, live preview and safe exports.
- `/compliance` - suppression ledger, eligibility checker, business do-not-contact and policy
  checklists.
- `/providers` - truthful provider availability and compliance notes.
- `/exports` - safe CSV/XLSX downloads for businesses, professionals and suppression.
- `/campaigns` - sequence builder and manual review queue with no sending integration.
- `/proposals/$id` - outreach logging now requires owner confirmation and runs the compliance
  check before recording an event.

Navigation lives in `src/routes/_authenticated/route.tsx`.

## Data flow

### Professional record

1. Owner records a person from a lawful public source.
2. Input is normalised and validated in `professional-intelligence.ts`.
3. A dedupe key prioritises profile URL, then public email/phone, then name plus country.
4. The server function upserts with an owner-owned `dedupe_key`.
5. Evidence and source URLs stay on the record; completeness and confidence are conservative.

### Business link

1. Owner selects a business and relationship type.
2. The link stores role, confidence, verification and evidence.
3. Unique owner/professional/business/type key prevents duplicate links.
4. Deleting a professional cascades links.

### Outreach guard

1. Owner selects a proposal and outreach channel.
2. Record is disabled until the owner confirms lawful-basis review.
3. The server checks the suppression ledger, business do-not-contact flag, channel and owner
   confirmation.
4. A blocked result stops the record. Review-required results can be recorded only with the
   explicit owner confirmation.
5. The compliance result is stored in the activity event details for auditability.

### Saved prospect list

1. Owner saves a name, audience kind and filter object.
2. Filters are normalised for the audience and stored as live query criteria, not fixed members.
3. Preview and export run the same owner-scoped filter query used by campaign queue builds.
4. A campaign can select a matching list; list filters replace ad-hoc filters and mismatched
   audience kinds are rejected.
5. Every preview, export and queue build remains subject to compliance checks at queue time.

### Natural-language prospect interpretation

1. Owner describes an audience in plain language on `/lists`.
2. The authenticated server function interprets it with deterministic rules by default.
3. Optional AI is used only when the owner enables it; each owner is limited to a short burst and
   a daily cap, and AI output is schema-validated and then checked against the same supported
   filter taxonomies before it can be applied.
4. Provider failure, invalid AI output or a reached limit falls back to deterministic rules with a
   truthful reason; the owner still gets usable filters.
5. Unsupported conditions, such as website quality, hiring, funding or buying intent, are
   returned as "not applied" warnings and are never turned into fabricated filters.
6. The interpreted audience, filters and warnings are shown for review; nothing changes until the
   owner clicks "Apply to list".

The AI limiter is an in-process burst guard keyed by owner, not durable billing accounting. Its
counters reset on isolate restart or deploy; a persistent owner-scoped usage table would be needed
for that.

### Campaign queue

1. Owner creates a campaign and ordered steps with owner-authored templates.
2. A bounded audience query selects 1-50 existing businesses or professionals.
3. Each target is checked against suppression, do-not-contact and contact completeness.
4. The template is rendered locally and an opt-out line is added when missing.
5. Queue rows are inserted with a dedupe key; duplicates are skipped.
6. Blocked rows cannot be approved. Review rows require owner compliance confirmation.
7. "Mark sent" only records a manual action; no send API is called.

### Provider status

1. `getSystemStatus` reports boolean credential presence and detected places provider.
2. `providerStatuses` maps configuration to available, configured-unverified, unavailable,
   blocked or review-required.
3. The UI never calls a provider to prove it works.

### Export

1. The owner opens `/exports`.
2. The browser reads rows through the authenticated Supabase client and RLS.
3. CSV/XLSX cells are sanitised against formula injection.
4. The XLSX is a dependency-free ZIP workbook.
5. Backups include the new tables in `BACKUP_TABLES`.

## Security and privacy

- RLS is mandatory on new tables.
- No service-role key is exposed to the browser.
- Provider pages show credential keys by name only, never values.
- AI prompts must use minimum necessary evidence.
- Suppression values and contact exports are personal data and must stay private.
- The app does not merge businesses or people automatically.

## Current limitations

- Both migrations were applied to hosted Supabase on 2026-11-11; table, index and RLS checks
  passed.
- Provider credentials and billing are not verified.
- The policy templates are not legal advice.
- Professional data is manual/evidence-based; automated professional discovery is intentionally
  not enabled.
- Campaign sequences have no scheduler, SMTP, WhatsApp or LinkedIn integration. Sending remains
  manual by design.
- The existing source registry remains Rwanda-centric; global source expansion is a later phase.

## Related documents

- `GARE_GLOBAL_INTELLIGENCE_MASTER_INSTRUCTION.md`
- `GARE_GLOBAL_INTELLIGENCE_IMPLEMENTATION.md`
- `GARE_GLOBAL_INTELLIGENCE_DATABASE.md`
- `GARE_GLOBAL_INTELLIGENCE_PROVIDERS.md`
- `GARE_GLOBAL_INTELLIGENCE_COMPLIANCE.md`
- `GARE_GLOBAL_INTELLIGENCE_TESTING.md`
