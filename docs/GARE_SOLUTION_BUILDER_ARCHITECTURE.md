# GARE Solution Builder - Phase 7 Architecture

Date: 2026-11-06

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
solution_recommendations (owner-scoped, intent + requested deliverable)
        |
        +--> accept / dismiss / reset
        |
        +--> optional client request override
                 |
                 v
        classifySolutionRequest (pure)
                 |
                 +--> CREATE / REPAIR / IMPROVE / MAINTAIN / ANALYZE / AUTOMATE
                 +--> requested deliverable + ambiguity check
                 |
                 v
        buildSolutionPromptSet (deterministic templates)
                 |
                 +--> OpenCode brief
                 +--> Lovable brief
                 +--> Google AI Studio brief
                 +--> Developer specification
                 |
                 v
        validatePromptQuality (pure)
                 |
                 +--> all four must pass before any version is saved
                 +--> previous valid versions remain untouched on failure
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

- Defines solution types, intents, requested deliverables, prompt platforms, recommendation
  statuses and maintenance statuses.
- Builds recommendations from a business, investigation findings/report, opportunity and
  observation date.
- Classifies the requested outcome, with an explicit client request taking priority over the
  AI/rule recommendation.
- Produces evidence arrays, requirements, assumptions and unknowns.
- Validates prompt structure, evidence, requirements, measurable acceptance, security, platform
  fit, intent/deliverable alignment and scope contradictions.
- Selects the latest prompt version per platform.
- Has no I/O and is covered by unit tests.

### Deterministic prompt builder: `src/lib/solution-prompts.ts`

- Turns the stored evidence package into copy-ready platform prompts without an AI call.
- Uses the required A-L website brief when the deliverable is a website or website repair.
- Uses the general implementation brief for analysis, maintenance, automation and internal
  business-system deliverables.
- Selects relevant website pages from the solution type and category, while keeping every
  unconfirmed product, price, stock, hours, policy and brand fact as missing information.
- Includes explicit guardrails against audit applications, BI dashboards, compliance checkers,
  prompt generators, reporting tools and internal GARE features when the requested deliverable is
  a website.
- Generates platform-specific execution instructions for OpenCode, Lovable, Google AI Studio and a
  human developer.

### Server orchestration: `src/lib/solution.server.ts`

- Loads the requested investigation or the latest investigation for the business.
- Loads the latest opportunity for the same business.
- Persists missing recommendations with intent, requested deliverable, owner scope and dedupe keys.
- Applies an optional client request override, classifies it and persists the resulting intent.
- Builds all four prompts deterministically and validates them before saving.
- Inserts a complete new version set only when every prompt passes; a failed set never replaces
  the previous valid version.
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
- show the selected intent and requested deliverable
- show verified facts, evidence, assumptions and missing information
- show grouped requirements and acceptance criteria
- accept, dismiss or reset a recommendation
- capture an optional client request override before prompt generation
- generate, regenerate and copy prompts
- switch platform and inspect prompt version, quality and validation results
- create a maintenance record from a maintenance recommendation

### Maintenance workspace: `src/routes/_authenticated/maintenance.tsx`

- active, completed and all filters
- business link and record source
- lifecycle transitions
- cadence and next due date editing
- completion note required before completion
- completed date and completion evidence display

## Recommendation rules

| Solution               | Trigger                                                                     | Evidence posture                       |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| `website_new`          | No website plus `website_check.confidence = none_found`                     | Verified fact                          |
| `website_repair`       | Existing website plus a measured site issue or investigation report problem | Evidence-backed finding                |
| `ordering_ecommerce`   | Retail/food category, reachable site and no detected online shop            | Hypothesis                             |
| `booking_appointments` | Appointment-like category, reachable site and no detected booking           | Hypothesis                             |
| `custom_system`        | Opportunity service matches system/automation and usable gaps exist         | Hypothesis until opportunity confirmed |
| `maintenance`          | A repair recommendation exists for an existing website                      | Hypothesis plus verified site fact     |
| `automation`           | Reserved solution type for later workflow evidence                          | Not generated yet                      |
| `other`                | Requirement template available for future evidence                          | Not generated yet                      |

Opportunity evidence alone cannot trigger a website repair. A healthy site with only an
unrelated workflow gap remains a system recommendation.

Permanently closed businesses produce no recommendations.

## Prompt generation and validation

Prompt generation is deterministic. It does not call an AI provider and does not require provider
credits. The model is used for investigation interpretation elsewhere; prompt structure and scope
come from the stored evidence package and templates.

Before generation, the server classifies the request into one intent: `CREATE`, `REPAIR`,
`IMPROVE`, `MAINTAIN`, `ANALYZE` or `AUTOMATE`. An explicit client request overrides the
recommendation type. If the request is ambiguous, generation is rejected with a clarification
message instead of guessing.

Website deliverables (`business_website`, `online_ordering_website`, `booking_website` and
`website_repair`) use the required A-L website brief:

1. A. Build objective
2. B. Business context
3. C. Verified information
4. D. Customer problem and website purpose
5. E. Website structure
6. F. Functional requirements
7. G. Design requirements
8. H. Administration
9. I. Technical requirements
10. J. Missing information
11. K. Build execution instructions
12. L. Acceptance criteria

Google AI Studio website prompts explicitly ask for the complete website implementation and state
that the public website must not depend on an AI model, API key, structured output, RAG or model
evaluation unless the client separately requests it. They must not turn the request into an AI
auditing application, BI dashboard, compliance checker, prompt generator, reporting tool or
internal GARE feature.

Non-website deliverables use the general implementation brief with objective, business context,
verified facts, problem and evidence, users, requirements, pages/components, journeys, data,
frontend, integrations, security, responsive design, error states, tests, acceptance, deployment
and assumptions/unknowns.

Validation checks:

- all required sections for the selected deliverable are present
- intent and requested-deliverable lines match the stored classification
- non-hypothesis evidence exists
- at least four requirements and four acceptance criteria
- at least one measurable acceptance signal
- security/privacy/authorisation language present
- platform-specific workflow terms present
- website prompts build/repair the requested website and do not drift into another product
- non-website prompts do not drift into a website build
- no repair prompt that asks for a rebuild or destructive replacement
- no new-website prompt that assumes an existing site to preserve

All four prompts must pass before any version is inserted. A failed validation leaves the previous
valid prompt versions untouched.

## Data model

### `solution_recommendations`

- owner and business scope
- optional investigation, opportunity and audit links
- solution type, intent and requested deliverable
- title, summary and rationale
- confidence and hypothesis flag
- evidence, requirements, assumptions and unknowns as JSONB
- maintenance flag, source, status and dedupe key

Unique key: `(owner_id, business_id, dedupe_key)`.

### `solution_prompts`

- owner and recommendation scope
- platform, prompt text and version
- ready/failed status
- quality result and evidence references
- template model marker (`solution-prompt-v2`) and error detail

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
- Prompt generation does not use AI keys, so no provider secret is involved.
- Supplied evidence is quoted into a deterministic template, not executed as instructions.
- No service-role key, external scan or automatic outreach was added.

## Cost and failure behaviour

- Recommendation building reads stored rows and costs no AI or Maps request.
- Prompt generation is local template assembly: no AI call, provider credits or Maps request.
- Regeneration creates new versions instead of overwriting history.
- If validation fails, no new version is saved and the previous valid prompts remain available.
- Missing investigation, empty evidence or invalid prompt returns a clear error rather than a
  fabricated recommendation.
- Existing prompts remain available when a later generation fails because no partial version set
  is written.
