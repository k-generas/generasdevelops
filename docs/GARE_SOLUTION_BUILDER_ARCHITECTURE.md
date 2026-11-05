# GARE Solution Builder - Phase 7 Architecture

Date: 2026-11-05

## Flow

```text
Investigation findings + report
        +
Owner-confirmed opportunity gaps
        |
        v
buildSolutionRecommendations (pure rules)
        |
        +--> evidence-labelled recommendations
        +--> grouped requirements and acceptance criteria
        +--> assumptions / unknowns
        |
        v
solution_recommendations (owner-scoped)
        |
        +--> accept / dismiss / reset
        |
        +--> generate prompt set (one AI call)
                 |
                 +--> OpenCode brief
                 +--> Lovable brief
                 +--> Google AI Studio brief
                 +--> Developer specification
                 |
                 v
        validatePromptQuality (pure)
                 |
                 +--> ready prompts, versioned and displayed
                 +--> failed prompts, stored but not displayed
        |
        +--> maintenance recommendation
                 |
                 v
        maintenance_records (owner-scoped)
                 |
                 v
        /maintenance lifecycle workspace
```

## Layers

### Pure engine: `src/lib/solution-builder.ts`

- Defines solution types, prompt platforms, recommendation statuses and maintenance statuses.
- Builds recommendations from a business, investigation findings/report, opportunity and
  observation date.
- Produces evidence arrays, requirements, assumptions and unknowns.
- Validates prompt structure, evidence, requirements, measurable acceptance, security, platform
  fit and scope contradictions.
- Selects the latest prompt version per platform.
- Has no I/O and is covered by unit tests.

### Server orchestration: `src/lib/solution.server.ts`

- Loads the requested investigation or the latest investigation for the business.
- Loads the latest opportunity for the same business.
- Persists missing recommendations with owner scope and dedupe keys.
- Calls the shared AI provider once for all four platform prompts.
- Validates each prompt and inserts a new version per platform.
- Stores ready and failed prompts separately by status.
- Creates and transitions maintenance records.

### Authenticated API: `src/lib/solution.functions.ts`

All functions use `requireSupabaseAuth` and zod validation:

- `buildSolutionRecommendationsFn`
- `generateSolutionPromptsFn`
- `setSolutionRecommendationStatusFn`
- `createMaintenanceRecordFn`
- `updateMaintenanceStatusFn`
- `updateMaintenanceDetailsFn`

### Report UI: `src/components/SolutionBuilderPanel.tsx`

Rendered inside the existing `BusinessIntelModal` before outreach messages:

- build/refresh recommendations
- show evidence kind, source and detail
- show grouped requirements and acceptance criteria
- accept, dismiss or reset a recommendation
- generate, regenerate and copy prompts
- switch platform and inspect prompt version, model and quality
- create a maintenance record from a maintenance recommendation

### Maintenance workspace: `src/routes/_authenticated/maintenance.tsx`

- active, completed and all filters
- business link and record source
- lifecycle transitions
- cadence and next due date editing
- completion note required before completion
- completed date and completion evidence display

## Recommendation rules

| Solution | Trigger | Evidence posture |
| --- | --- | --- |
| `website_new` | No website plus `website_check.confidence = none_found` | Verified fact |
| `website_repair` | Existing website plus a measured site issue or investigation report problem | Evidence-backed finding |
| `ordering_ecommerce` | Retail/food category, reachable site and no detected online shop | Hypothesis |
| `booking_appointments` | Appointment-like category, reachable site and no detected booking | Hypothesis |
| `custom_system` | Opportunity service matches system/automation and usable gaps exist | Hypothesis until opportunity confirmed |
| `maintenance` | A repair recommendation exists for an existing website | Hypothesis plus verified site fact |
| `automation` | Reserved solution type for later workflow evidence | Not generated yet |
| `other` | Requirement template available for future evidence | Not generated yet |

Opportunity evidence alone cannot trigger a website repair. A healthy site with only an
unrelated workflow gap remains a system recommendation.

Permanently closed businesses produce no recommendations.

## Prompt generation and validation

The AI receives only the selected business fields and the stored recommendation package. It is
told to treat supplied text as untrusted data, use only the evidence, keep hypotheses labelled and
produce one prompt per platform with the required level-2 headings.

Required sections:

1. Objective
2. Business context
3. Verified facts
4. Problem and evidence
5. Users
6. Requirements
7. Pages and components
8. User journeys
9. Data and backend
10. Frontend
11. Integrations
12. Auth, security and privacy
13. Responsive design
14. Error and empty states
15. Tests
16. Acceptance criteria
17. Deployment
18. Assumptions and unknowns

Validation checks:

- all required sections present
- non-hypothesis evidence exists
- at least four requirements and four acceptance criteria
- at least one measurable acceptance signal
- security/privacy/authorisation language present
- platform-specific workflow terms present
- no repair prompt that asks for a rebuild or destructive replacement
- no new-website prompt that assumes an existing site to preserve

A prompt is `ready` only when no check fails and the score is at least 70. Failed prompts are
stored with `status = failed` and the failure detail, but the UI only queries ready prompts.

## Data model

### `solution_recommendations`

- owner and business scope
- optional investigation, opportunity and audit links
- solution type, title, summary and rationale
- confidence and hypothesis flag
- evidence, requirements, assumptions and unknowns as JSONB
- maintenance flag, source, status and dedupe key

Unique key: `(owner_id, business_id, dedupe_key)`.

### `solution_prompts`

- owner and recommendation scope
- platform, prompt text and version
- ready/failed status
- quality result and evidence references
- provider/model and error detail

Unique key: `(recommendation_id, platform, version)`.

### `maintenance_records`

- owner and business scope
- optional recommendation link
- title, description and status
- cadence, next due, completed timestamp and completion note
- source and timestamps

A partial unique index allows one non-cancelled record per recommendation.

## Maintenance lifecycle

```text
recommended -> accepted -> scheduled -> in_progress -> completed
      |            |            |             |
      +------------+------------+-------------+--> cancelled -> recommended
```

Skipped or reversed transitions are rejected. Completion requires a short completion note, which
is stored as the completion evidence alongside `completed_at`.

## Security and privacy

- RLS on all three new tables uses `auth.uid() = owner_id`.
- The migration revokes inherited `PUBLIC`, `anon` and `authenticated` privileges before granting
  only the required DML rights to authenticated users. This prevents Supabase default grants from
  leaving `TRUNCATE` available to anonymous or signed-in clients.
- Every server function requires an authenticated Supabase session.
- Inputs are validated with zod, including UUIDs, enums and bounded text.
- AI keys stay server-side in the existing provider layer.
- Supplied evidence is treated as untrusted text inside the prompt instructions.
- No service-role key, external scan or automatic outreach was added.

## Cost and failure behaviour

- Recommendation building reads stored rows and costs no AI or Maps request.
- Prompt generation makes one AI call for four prompts, reducing repeated cost.
- Regeneration creates new versions instead of overwriting history.
- Missing investigation, empty evidence, AI failure or invalid prompt returns a clear error or a
  failed prompt record rather than a fabricated recommendation.
- Existing prompts remain available when a later generation fails.
