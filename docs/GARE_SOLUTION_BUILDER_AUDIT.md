# GARE Solution Builder - Phase 7 Audit

Date: 2026-11-05
Status: implemented, deployed and verified in production on 2026-11-05.

## Objective

Turn investigation evidence and evidence-backed opportunity gaps into concrete solution
recommendations, implementation requirements and copy-ready platform prompts. The builder
must be conservative: it may only interpret recorded evidence and must never manufacture a
business problem, fact, price, integration or maintenance commitment.

## Existing system audited

- `src/lib/investigate.server.ts` probes a business website and asks AI to interpret the
  collected findings. It already stores `investigations.findings` and `investigations.report`.
- `src/lib/business-intel.ts` derives observed problems from measured website checks and the
  double-checked no-website state. It does not infer beyond the measurements.
- `src/lib/opportunity-engine.ts` produces reviewable opportunities from usable gaps, keeps
  hypothesis evidence labelled and maps gaps to service fits.
- `src/lib/opportunity.functions.ts` owns the opportunity lifecycle, manual outreach and
  proposal drafting.
- `src/components/BusinessIntelModal.tsx` is the existing **View Full Report** experience
  launched from the business list and detail pages.
- `src/lib/ai.server.ts` is the shared provider layer for OpenAI, Gemini and Lovable, with
  provider fallback and strict JSON schema calls.
- Supabase tables already cover businesses, investigations, opportunities, proposals, tasks,
  business audits and activity events.
- No solution recommendation, platform prompt or maintenance record table existed.

## Product gaps found

1. Opportunity qualification ended at a service fit; it did not produce build requirements.
2. The investigation report explained problems but did not turn them into a scoped solution.
3. There was no reusable way to brief OpenCode, Lovable, Google AI Studio or a human developer.
4. There was no persisted prompt history or prompt quality gate.
5. There was no maintenance record, so "maintenance" could only ever be a promise.
6. Accepting or dismissing a recommendation was not an explicit owner decision.

## Design decisions

- Add a pure, testable recommendation engine instead of putting rules in UI or AI prompts.
- Use AI only for prose prompt generation. Recommendation selection and evidence labelling are
  deterministic.
- Persist recommendations, validated prompt versions and maintenance records in new owner-scoped
  tables. Existing tables are not rewritten.
- Reuse the existing report modal and opportunity data; do not create a parallel business report.
- Keep solution types explicit: new website, ordering/e-commerce, booking/appointments, website
  repair, maintenance, custom system, automation and other.
- Require a double-checked `none_found` website state before recommending a new website.
- Require a real site issue or report problem before recommending a website repair.
- Label category-based ordering, booking and maintenance suggestions as hypotheses.
- Generate all four prompts in one AI call and validate each independently.
- Only display prompts with `status = ready`; failed prompts remain stored for diagnosis but are
  never presented as successful.
- Preserve earlier prompt versions when regenerating.
- Require a dated completion note before a maintenance record can be completed.

## Evidence rules

- `verified_fact`: directly recorded business data or a completed website check.
- `evidence_backed_finding`: a measured probe result, report problem or recorded opportunity gap.
- `hypothesis`: category-based fit, owner-intent assumption or unconfirmed workflow suggestion.

Every recommendation stores its evidence array. Every prompt stores evidence references and a
quality result. Missing evidence produces no recommendation rather than a generic one.

## Non-goals

- No automatic outreach or message sending.
- No pricing, budget or deadline invention.
- No automatic acceptance of maintenance work.
- No Google Places or other paid scan added by this phase.
- No redesign of the existing investigation or opportunity flows.
- No removal of existing tables, routes or server functions.

## Risks and limitations

- AI prompt prose can still be weak or omit a required section. The validator blocks failed
  prompts from the ready state, but it does not rewrite them.
- Prompt validation is rule-based and deliberately strict; it can require regeneration rather
  than silently accepting a partial prompt.
- Recommendations are built per investigation, so a new investigation may create a new
  recommendation of the same solution type with newer evidence.
- Live AI prompt generation was not exercised in this environment because no application
  database/session is available. The pure engine, validator and build were verified locally.
- The production schema and application are deployed. `/maintenance`, the solution-builder
  route chunk and the report integration chunk responded successfully. A live prompt-generation
  run still requires an authenticated owner session.

## Acceptance mapping

| Requirement | Implementation |
| --- | --- |
| Evidence-based recommendations | `buildSolutionRecommendations` plus stored evidence |
| Report integration | `SolutionBuilderPanel` inside `BusinessIntelModal` |
| Implementation requirements | Grouped must/should/could requirements with acceptance criteria |
| Four prompt targets | OpenCode, Lovable, Google AI Studio, developer spec |
| Prompt quality validation | `validatePromptQuality` and stored quality JSON |
| Prompt versioning | `solution_prompts` version per recommendation/platform |
| Accept/dismiss | `setSolutionRecommendationStatusFn` |
| Maintenance lifecycle | `maintenance_records` and `/maintenance` |
| Completion evidence | Required `completion_note` before completion |
| Owner-scoped security | RLS on all three new tables and authenticated server functions |
