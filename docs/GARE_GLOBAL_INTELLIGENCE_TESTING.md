# GARE Global Intelligence Testing

## Commands

Run from the project root:

```powershell
npx tsc --noEmit
npm test
npm run build
```

Targeted checks used during this phase:

```powershell
npx vitest run src/lib/ai-usage.test.ts src/lib/prospect-intent.server.test.ts src/lib/prospect-intent.test.ts src/lib/prospect-lists.test.ts src/lib/prospect-queries.server.test.ts
npx eslint src/lib/ai-usage.ts src/lib/ai-usage.test.ts src/lib/prospect-intent.server.ts src/lib/prospect-intent.server.test.ts src/lib/prospect-intent.functions.ts src/lib/prospect-queries.server.ts src/lib/prospect-queries.server.test.ts src/test/prospect-rls.integration.test.ts
npx prettier --check docs/GARE_GLOBAL_INTELLIGENCE_ARCHITECTURE.md docs/GARE_GLOBAL_INTELLIGENCE_IMPLEMENTATION.md docs/GARE_GLOBAL_INTELLIGENCE_TESTING.md docs/GARE_REGRESSION_LOG.md
```

The live RLS integration test is opt-in and requires four environment variables. It never runs as
part of the default suite because it creates and deletes one temporary owner-scoped list:

```powershell
$env:TEST_SUPABASE_URL="https://<project>.supabase.co"
$env:TEST_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
$env:TEST_OWNER_ACCESS_TOKEN="<owner-access-token>"
$env:TEST_OTHER_ACCESS_TOKEN="<different-user-access-token>"
npx vitest run src/test/prospect-rls.integration.test.ts
```

The two tokens must belong to different users. Do not commit them.

## Current verification

| Check                           | Result                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `npx tsc --noEmit`              | clean                                                                               |
| AI usage limiter tests          | 1 file / 4 tests passing                                                            |
| AI orchestration fallback tests | 1 file / 4 tests passing                                                            |
| Prospect-query builder tests    | 1 file / 4 tests passing                                                            |
| Live RLS integration test       | 1 file / 1 test skipped without test credentials                                    |
| Full `npx vitest run`           | 60 files / 483 tests passing, 1 file / 1 test skipped                               |
| `npm run build`                 | successful; `/lists`, `/campaigns` and prospect-intent assets generated             |
| Targeted ESLint/Prettier        | clean                                                                               |
| `npm run lint` full repo        | not used as a gate; the repository has pre-existing lint issues outside this change |

The full test run emitted the known jsdom navigation warning from an unrelated test environment
path and took about 194 seconds. It did not fail the suite.

## Test files and coverage

### `src/lib/professional-intelligence.test.ts`

Covers:

- name, email, phone, URL and list normalisation;
- dedupe priority and weak name plus country behaviour;
- validation errors for missing name, bad email, bad phone, bad URL and confidence;
- confidence suggestion;
- completeness and missing fields;
- display labels and coverage summaries.

### `src/lib/compliance.test.ts`

Covers:

- suppression value normalisation;
- expiry and active checks;
- channel and scope matching;
- business/professional suppression matching;
- blocked eligibility for suppression and do-not-contact;
- review-required eligibility when confirmation is missing;
- owner confirmation and policy requirements;
- policy lookup by country code or name;
- compliance summaries.

### `src/lib/provider-registry.test.ts`

Covers:

- provider status mapping for Google and Geoapify configurations;
- LinkedIn blocked status;
- AI configured-unverified behaviour;
- unavailable providers without credentials;
- summary counts;
- truthful reasons.

### `src/lib/export-safe.test.ts`

Covers:

- formula-injection neutralisation for `=`, `+`, `-` and `@`;
- safe CSV headers and values;
- filename sanitisation;
- XLSX ZIP signature and XML escaping;
- dangerous text handling inside the workbook;
- boolean and numeric cells.

### `src/lib/campaign.test.ts`

Covers:

- template variables and whitespace cleanup;
- business/professional target rendering;
- automatic opt-out insertion without duplication;
- campaign and step validation bounds;
- eligibility-to-queue status mapping without auto-approval;
- explicit queue transitions;
- approval and manual-send gates;
- queue summaries and stable dedupe keys.

### `src/lib/prospect-lists.test.ts`

Covers:

- filter trimming and server-side length caps;
- clearing business-only and professional-only filters by audience;
- shared keyword and location filters for both audiences;
- malformed stored filter fallback;
- audience-safe chips and summaries;
- empty-filter detection;
- name/audience/filter validation;
- preview-row mapping and do-not-contact flags.

### `src/lib/prospect-intent.test.ts`

Covers:

- business and professional audience detection;
- location extraction without treating "interested in" as a place;
- keyword compaction for natural-language prompts;
- business stage and professional type/availability parsing;
- unsupported-condition reporting for website, hiring and funding requests;
- AI result validation and unsupported taxonomy rejection;
- empty-prompt rejection.

### `src/lib/ai-usage.test.ts`

Covers:

- per-minute burst limit and retry timing;
- rolling daily cap;
- burst-window reset without losing the daily count;
- daily reset after a rolling day;
- separate counters per owner;
- truthful limit messages.

### `src/lib/prospect-intent.server.test.ts`

Covers:

- injectable AI call with the expected instructions, prompt, function name and schema;
- validated AI output with unsupported conditions preserved;
- provider failure falling back to deterministic rules;
- malformed JSON falling back to deterministic rules;
- long provider errors being truncated in `fallbackReason`.

### `src/lib/prospect-queries.server.test.ts`

Covers:

- owner scoping on business and professional target queries;
- business location search across district, province and address;
- professional location search across country, region and city;
- keyword and taxonomy filters;
- empty-filter queries still scoped to the owner;
- removal of PostgREST syntax characters from free-text filters.

### `src/test/prospect-rls.integration.test.ts`

Opt-in against a real Supabase project. Covers:

- an owner can create and read a saved list with a location filter;
- a different authenticated user cannot read, update or delete it;
- a different authenticated user cannot insert a list with the owner's `owner_id`;
- cleanup removes the temporary test list.

## Not yet covered

- Running the opt-in RLS integration test in CI requires four test credentials and two users.
- Persistent AI usage accounting across isolates and deploys.
- Browser end-to-end flows for the six new routes.
- Campaign queue build and status-transition server tests.
- Saved-list preview/export tests against a real database.
- Campaign queue build from a saved list and audience-mismatch rejection.
- Authenticated AI prompt interpretation against a live provider, including failure fallback.
- Manual visual checks at mobile and desktop breakpoints.
- Authenticated owner smoke checks against the hosted database.
- Provider quota/billing failure paths.
- Full legal/compliance review.

## Recommended next tests

1. Run the opt-in RLS test in CI and extend owner isolation to all seven new tables.
2. Add route-level tests for the professionals CRUD and business link flow.
3. Add an outreach guard test that proves blocked suppression prevents an activity insert.
4. Add campaign queue tests for suppression blocking, dedupe, approval and mark-sent gates.
5. Add a backup test that includes the new tables.
6. Add a durable owner-scoped AI usage table if spend accounting must survive deploys.
7. Add responsive smoke tests for the new routes.
8. Apply the migrations in a staging project and repeat the full suite.

## Regression expectations

The change must not:

- remove or rename existing tables, columns, routes or functions;
- block existing discovery, investigation, proposal, task or finance flows;
- call a paid provider from a status page;
- expose provider keys;
- allow outreach recording without owner confirmation;
- send messages automatically or claim a message was sent by the app;
- weaken RLS on existing tables.

## Manual smoke checklist

After applying the migration:

- [ ] Sign in as the owner.
- [ ] Open `/professionals`; add and edit a person.
- [ ] Add a business link.
- [ ] Open `/compliance`; add a suppression entry.
- [ ] Check eligibility for the suppressed email; expect blocked.
- [ ] Mark a business do-not-contact; expect blocked.
- [ ] Open a proposal; confirm outreach is disabled until the checkbox is selected.
- [ ] Record outreach and verify the compliance details in the activity event.
- [ ] Open `/providers`; confirm statuses match the server environment.
- [ ] Open `/exports`; download CSV and XLSX for a populated dataset.
- [ ] Open `/lists`; create a business list and confirm the live count and preview.
- [ ] Describe an audience, confirm the interpreted filters and warnings, then apply it.
- [ ] Ask for an unsupported condition such as outdated websites; confirm it appears under "Not
      applied" and is not used as a filter.
- [ ] Optionally enable AI interpretation; if AI is unavailable, confirm the rule-based fallback
      message is shown.
- [ ] Enable AI repeatedly; confirm the per-minute message appears after five calls and rules are
      still returned.
- [ ] Export the list as CSV and XLSX.
- [ ] Open `/campaigns`; create a campaign and one sequence step.
- [ ] Build a queue from the saved list; confirm the filters are applied.
- [ ] Build a small queue; confirm suppression/DNC items are blocked and the rest need review.
- [ ] Approve one item only after checking the lawful-basis box.
- [ ] Confirm "mark sent" stays disabled until approval plus manual-send confirmation.
- [ ] Run a JSON backup and confirm the new tables are included.
- [ ] Confirm another user cannot read the owner's new rows.
