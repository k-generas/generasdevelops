# GARE — Rwanda Business Intelligence: Implementation Plan & Regression Baseline

Spec: `docs/GARE_RWANDA_INTELLIGENCE_SPEC.md`
Audit date: 2026-10-12
Rule followed: this plan describes only capabilities that exist in the repo, and reuses them. No parallel engine is created.

## 1. What already exists (reused, not rebuilt)

| Capability in spec | Existing implementation | Reuse decision |
| --- | --- | --- |
| Business records | `public.businesses` (migrations 0000–0003, 0007) | Extend with Rwanda profile columns (0008). Do NOT create a second company DB. |
| Global opportunity discovery | `runDiscovery` in `src/lib/discovery.functions.ts` | Keep Maps path. Add Rwanda source adapters behind the same server-function boundary. |
| Source registry shape | `src/lib/sources.ts` (`Source` type + `scanHealth`, tested) | Extend into a typed, tested registry with access status. No new table needed initially. |
| Evidence / freshness | `src/lib/evidence.ts` (`EvidenceItem`, `freshnessDays`, `isStale`, `normalizeConfidence`, tested) | Extend with verification status + provenance. |
| Website investigation | `investigate.server.ts` (`probeWebsite`, `computeVisibility`), `website-finder.server.ts` (`verifyWebsite`) | Reuse as-is for §5. |
| Opportunity ranking | `src/lib/ranking.ts` (`rankScore`, `explainRank`, tested) | Extend factors per §8; keep explainability. |
| Validation planner | `src/lib/validation.ts` + migration 0007 | Reuse for qualification (Phase 4). |
| Proposals / outcomes | `proposals.server.ts`, `proposals.functions.ts`, `outcomes.ts`, `proposal_versions` | Reuse for §7/§9. |
| CRM-lite / pipeline | `tasks`, `business_notes`, `business_activity_events`, `/tasks`, dashboard | Reuse; no new CRM. |
| Offers catalog | `offers` (0004), `offers.ts` | Reuse as the owner's sellable services. |
| Cost controls | `getSystemStatus` (booleans only) | Extend for budgets (Phase 5+). |
| Auth / RLS | `requireSupabaseAuth`, every table owner-scoped | Follow exactly. |
| CSV export | `src/lib/csv.ts` (tested) | Reuse for authorized export (§9). |

Genuinely **missing** today: Rwanda-specific location/industry taxonomy, canonical business identity + cross-source dedupe, provenance records, a permitted source registry with access status, scheduled/durable jobs, cost/budget accounting.

## 2. Regression baseline (measured before changes)

- `npm test`: **13 files / 47 tests passed** (pre-existing jsdom navigation warning only).
- `npx tsc --noEmit`: **2 errors — both in the untracked `src/routes/_authenticated/businesses.tsx`** (array-of-arrays passed to `rowsToCsv`). Committed code typechecks clean.
- `npm run lint`: **18 errors — all in the untracked `businesses.tsx`** (Prettier only). Committed code is lint-clean.
- Uncommitted user changes preserved: `src/routes/_authenticated/businesses.tsx` (new, WIP), `src/routes/_authenticated/route.tsx` (nav adds "Businesses"), `src/routeTree.gen.ts` (generated).
- Known pre-existing defect (committed): `drizzle/migrations/0006_orders_delivery.sql` contains leftover merge-conflict markers. Not edited here (already-applied migration); recorded for a follow-up.

## 3. Phased plan

**Phase 1 — Foundation (DONE 2026-10-12).** Reusable pure libraries + safe additive migration + fix the WIP page.
- `src/lib/rwanda.ts` — provinces/districts/industry taxonomy, location parsing & filtering helpers.
- `src/lib/company-identity.ts` — canonical name normalization + cross-source dedupe key.
- `src/lib/provenance.ts` — verification statuses, confidence labels, freshness, conflict-preserving merge, "unknown" handling.
- `src/lib/source-registry.ts` — typed registry of permitted sources with access status, legality + cost notes; blocked sources recorded with reasons.
- `drizzle/migrations/0008_rwanda_intelligence.sql` — additive Rwanda profile columns + provenance/source tables, RLS + indexes.
- Update `src/integrations/supabase/types.ts` for the new columns/tables.
- Fix `businesses.tsx` (type + lint) and add province/district/industry/website filters backed by the new libs.
- Tests for every pure library.

**Phase 2 — Bounded Maps scan (DONE 2026-10-12).** User chose "Google Maps only for now" instead of adding new sources.
- `src/lib/rwanda-scan.ts` — pure scan planner / cost controller (industry terms, national/province/district scope, hard caps `20 results × 10 queries`, `$0.032/query`, budget truncation).
- `src/lib/rwanda-discovery.functions.ts` — `runRwandaScan` server fn: bounded Maps searches, `source_scans` record, `dedupeBusinesses`, new-business writes with pre-`0008` fallback, `search_run_results` linking.
- `src/routes/_authenticated/discover.tsx` — "00 · Rwanda scan presets" panel (industry + scope + live cost preview + run + result).
- `types.ts` extended for the `0008` columns/tables.

**Phase 3 — Profiles, geo/industry filters, website + hiring integration (PARTIAL 2026-10-12).**
- Geo/industry filters done in Phase 1 (`businesses.tsx`).
- `src/lib/activity.ts` — explicit activity/hiring statuses (active/closed/expired/removed/unverified/unknown), new-vs-oldly-discovered detection, `diffActivity` change tracking, conservative `signalStrength`, and an explicit hiring disclaimer. Pure + tested.
- Website intelligence reuses the existing investigate/audit pipeline; not duplicated.

**Phase 4 — Service matching + evidence-backed ranking + comparisons (DONE 2026-10-12).**
- `src/lib/service-match.ts` — evidence-backed matching from observed problems → owner-confirmed services only; produces the §7 explanation (problem, evidence+freshness, relevance, suggested contact role, next action, confidence, uncertainties) and marks weak/AI-derived matches as explicit hypotheses. `buildServiceCatalog` maps active offer names to observable problem keys. Pure + tested.
- `src/lib/ranking.ts` — extended for §8: `rankOpportunity` adds signals, affordability, contactability, recurring, competition, accessibility and risk factors; keeps priority separate from factual confidence; `needsVerification` flag; `compareRanked` for comparisons; `weightsFromPreferences` for configurable owner preferences. Existing `rankScore`/`explainRank` unchanged.
- UI: dedicated `rwanda.tsx` ("Rwanda Intel") page — scan presets, companies table with geo/industry/website filters, and per-row investigation. Kept OFF the existing `discover.tsx` / `businesses.$id.tsx` pages (those were reverted to committed state). `businesses.tsx` rebuilt as a no-website leads list.

**Phase 5 — Pipeline/proposal/follow-up integration + cost budgets.**

**Phase 6 — Expand monitoring only when current sources are reliable and cheap.**

## 4. Safety rules encoded in this plan

- Additive-only SQL. No dropped/renamed columns, no data loss. New columns nullable/defaulted.
- Everything owner-scoped via `owner_id = auth.uid()` with the same policy pattern.
- No fabrication: fields that cannot be verified are stored as `unknown`; conflicts are preserved with sources.
- Discovery never triggers outreach automatically.
- Paid sources stay behind authenticated server functions with bounded run sizes.
