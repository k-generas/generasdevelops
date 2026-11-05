# GARE Social Commerce Audit

Last reviewed: 2026-11-05

## Existing API Inventory and Integration Readiness

### Scope and evidence

This section inventories the APIs already present in the repository and the evidence that they work in production. It does **not** recommend creating integrations or changing credentials, and it does not change application code.

Evidence used:

- Source inspection of Google Places, Maps JavaScript, AI, website verification, social scanning, and social-leads code.
- Production read-only database checks through the Lovable database connector.
- Local environment-key inventory only. Secret values are not reproduced here.
- Google Cloud project settings, API enablement, quotas, billing, and key restrictions were **not** accessible from the repository and remain an external verification item.

### API inventory

| API | Used by | Purpose | Configuration | Status |
| --- | --- | --- | --- | --- |
| Google Places API (New) — Text Search | `src/lib/places.server.ts` | Find up to 20 businesses per query, including identity, contact, rating, status, coordinates, reviews, and hours | Lovable connector `https://connector-gateway.lovable.dev/google_maps` with `LOVABLE_API_KEY` + `GOOGLE_MAPS_API_KEY`; direct `https://places.googleapis.com/v1/places:searchText` with only `GOOGLE_MAPS_API_KEY` | **Operational in production** based on 2,420 stored Google place IDs and successful discovery runs |
| Google Places API (New) — Place Details | `src/lib/website-finder.server.ts` | Re-check `websiteUri` before declaring a business website-less | Same Lovable gateway or direct Places API | **Configured and used on demand**; production success is not separately instrumented |
| Google Maps JavaScript API | `src/components/OpportunityMap.tsx` | Render the Radar opportunity map, radius circle, and markers | Browser key `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` loaded from `https://maps.googleapis.com/maps/api/js` | **Configured**; page rendering was not independently verified in a headless/browser session |
| Geoapify Geocoding | `src/lib/places.server.ts` | Free Places fallback when Google is absent, mainly local development | `GEOAPIFY_API_KEY` | **Configured locally; not used in production data** (0 stored `geoapify:` place IDs) |
| Geoapify Place Details | `src/lib/website-finder.server.ts` | Website lookup fallback for Geoapify-sourced places | `GEOAPIFY_API_KEY` | **Configured locally; not exercised by production data** |
| Gemini API | `src/lib/ai.server.ts` | Structured AI investigation and interpretation | `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` | Existing provider; not the subject of this Maps audit |
| OpenAI Responses API | `src/lib/ai.server.ts` | Structured AI investigation and fallback | `OPENAI_API_KEY` | Existing provider; not the subject of this Maps audit |
| Lovable AI gateway | `src/lib/ai.server.ts` | Final AI fallback | `LOVABLE_API_KEY` | Existing provider; not the subject of this Maps audit |
| Meta Graph API | `src/lib/social-leads.server.ts` | Instagram hashtag search, recent media, and business discovery | `META_ACCESS_TOKEN`, `IG_USER_ID`, optional `META_GRAPH_VERSION` | **Not configured**; `social_leads` currently has 0 rows |
| Supabase/PostgREST | `src/integrations/supabase/*` | Persistence, auth, and owner-scoped RLS | Supabase project secrets | Operational |

No general web-search API (Bing, Google Custom Search, SerpAPI, etc.) is present. Existing external discovery is limited to Google Places, direct fetches of known public URLs, the optional Geoapify fallback, AI providers, and Meta Graph.

### Production evidence

Read-only production checks found:

- 2,420 businesses, all with `source = 'google_places'`.
- 2,420 of 2,420 `place_id` values have the Google `ChIJ...` shape; 0 are Geoapify-prefixed.
- 1,658 businesses have a website recorded.
- 215 discovery runs: 204 completed, 3 failed, and 8 left in `running` state.
- Latest completed discovery run: 2026-11-03 10:18:04 UTC.
- Latest business activity/update: 2026-11-03 23:38 UTC.
- Business statuses: 2,276 `discovered`, 144 `investigated`.
- `source_scans` exists for estimated scan-cost bookkeeping, but cost totals and failed-run messages were not re-queried after the database connector hit its free-plan action limit.

Conclusion: **Google Places Text Search is operational in production.** The database proves successful Google-sourced searches and persistence. It does not prove which transport mode is active (Lovable connector vs direct key); the Settings page is the authoritative in-app indicator. The Maps JavaScript API and Place Details path are configured in code, but their runtime health is not separately monitored.

### Key handling and security

- Server Google credentials are read only from server-side environment variables. Connector mode sends `LOVABLE_API_KEY` as bearer auth and `GOOGLE_MAPS_API_KEY` in the `X-Connection-Api-Key` header to the Lovable gateway.
- Direct mode sends `GOOGLE_MAPS_API_KEY` as `X-Goog-Api-Key`; the key is never sent to the browser by this code.
- The Maps JavaScript browser key is intentionally public through `VITE_...`. It must be restricted in Google Cloud to the production and permitted development origins, and limited to the Maps JavaScript API. Referrer/API restrictions could not be verified from the repository.
- `.env` contains the public browser Maps key, not a server Places key. Local `.env.local` contains Geoapify and AI keys. `vercel_env.txt` contains a Supabase service-role secret and is untracked; it must not be committed.
- Google error bodies are truncated to 300 characters before being surfaced. No API keys are included deliberately, but provider error text can still contain project or request details.
- Search text, business data, locations, reviews, and website evidence are stored in Supabase under owner-scoped RLS.

### Quotas, billing, fields, and usage limits

- Text Search is capped at 20 results per query. There is no pagination, so each run is one page request.
- Text Search sends a field mask. Base fields cover ID, name, address, phones, website, Google Maps URL, category, rating, review count, business status, and location. Activity fields add `places.reviews`, `places.regularOpeningHours`, and `places.currentOpeningHours`.
- If Google rejects the activity fields with HTTP 400, the code retries with base fields only. This can add a second request.
- `places.reviews` is reduced to the five most recent returned reviews. Review and opening-hours fields affect Google's billing SKU, so the hard-coded estimate of **USD 0.032 per query** may not match actual Text Search SKU pricing.
- Place Details calls use only the `websiteUri` field. These calls are additional billable requests and are **not included** in the per-query cost estimate.
- Query-count caps:
  - Discovery form: 20 results per run.
  - Discovery batch: up to 12 areas per batch, one paid request each.
  - Rwanda scan: hard cap of 10 queries per run.
  - Radar daily/manual scan: 10 queries.
  - Website verification inside discovery: 15-second shared budget, concurrency 4, up to 6 domain candidates and 4 free-host candidates per business.
- There is no server-enforced daily or monthly Google spend cap, no quota dashboard, and no automatic circuit breaker. Caps are request-count caps only.
- `source_scans` records an estimated cost, but the estimate is not tied to Google's actual SKU billing or reconciled against invoices.
- No explicit network timeout exists around Google Places search or Place Details fetches. A stalled gateway/API call can therefore run until the hosting platform times out.
- There is no retry/backoff for HTTP 429 or 5xx. HTTP 403 is surfaced with a dedicated message; other failures use a generic error. There is no `Retry-After` handling.
- The Google-to-Geoapify fallback is configuration-based only. A Google quota, billing, or outage failure does **not** automatically fall back to Geoapify.
- Maps JavaScript uses the legacy `google.maps.Marker` API. It is still functional but deprecated in favor of `AdvancedMarkerElement`; migration would require a Map ID and is not required for current readiness.

### Reuse for Social Commerce Intelligence

Existing Google data can be reused without new Google APIs:

- Business identity and contact: name, address, phone, website, Google Maps URL.
- Demand and activity signals: category, rating, review count, business status, open-now state, opening hours, `reviews_last_90d`, recent reviews, last activity.
- Geography: latitude/longitude, plus existing district/province fields after enrichment.
- Web and social evidence: website verification result, discovered social links, emails, investigation findings.
- Cross-link support: `social_leads` already has a nullable `business_id`, and `businesses` stores website/social/contact evidence.

Recommended reuse pattern:

1. Use stored Google Places data to qualify a social seller by location, category, website/store gap, review activity, and contactability.
2. Match social profiles to businesses by normalized website domain, phone, and name plus district. Do not match on name alone.
3. Attach the resulting business ID to the social lead and preserve the evidence trail.
4. Treat Google data as business-context evidence, not proof that a social account belongs to that business.

Current gap: social-lead discovery does not call Google Places and does not perform this cross-link. It uses Meta Graph plus direct website probing. The schema supports the link, but the enrichment job does not yet exist.

### Existing Facebook/Instagram discovery capability

- Meta Graph integration exists for Instagram hashtag search (`ig_hashtag_search`), `recent_media`, and `business_discovery`.
- It is limited to 5 hashtags and 20 leads per run, with up to 12 media items per profile.
- Instagram hashtag search requires the Instagram API with Facebook Login, a connected professional account, and approved public-content permissions. Arbitrary keyword or account search is not available.
- `business_discovery` enriches a **known** Instagram professional username; it is not a general account-search endpoint.
- Facebook Page discovery is not implemented. No TikTok, LinkedIn, or X discovery API is implemented.
- The existing Social Presence scanner fetches known public profile URLs and reads Open Graph/title metadata. It is best-effort, capped at 8 profiles, and commonly blocked by login walls or rate limits.
- Production currently has no Meta token/IG user ID configured, so live Instagram discovery is not operational.

### Multi-provider architecture

- **Places:** provider abstraction exists for Google connector, direct Google, and Geoapify. Selection is first-configured-wins, not health-based. There is no parallel querying, cross-checking, or automatic failover on Google errors.
- **AI:** multi-provider fallback exists across Gemini, OpenAI, and Lovable, with transient-error retries for Gemini.
- **Social discovery:** effectively single-provider. Meta Graph is the only live discovery source; manual import and public-page probing are supporting paths. There is no second social discovery provider.

### Minimum API set: essential vs optional

Essential for the current product:

- Google Places API (New) — Text Search.
- Google Places API (New) — Place Details.
- Google Maps JavaScript API.
- Meta Graph API only if social-commerce lead discovery is in scope.
- Supabase for persistence and auth.

Optional, only if a concrete requirement appears:

- Google Geocoding API — useful for normalizing addresses/districts, but coordinates already come from Places.
- Google Places API (New) — Nearby Search — useful for true radius/browse workflows; current Text Search has no explicit location bias or radius.
- Places Autocomplete — useful for operator UX, not required for backend discovery.
- Place Photos — useful for visual qualification, not required for lead scoring.

Not currently justified:

- Adding another paid general web-search provider before the existing Places and Meta evidence is fully reused.
- Adding additional social-network APIs before Meta access and the cross-link workflow are proven.

### Complexity and cost assessment

- **Google Places readiness:** low implementation complexity because the integration already works. Main gaps are operational: timeout handling, 429/5xx backoff, cost reconciliation, quota telemetry, and optional Geoapify failover on Google failure.
- **Social Commerce Intelligence reuse:** low-to-medium complexity. It is primarily matching, enrichment, and evidence presentation over data already stored. It requires no new Google API.
- **Live Facebook/Instagram discovery:** medium-to-high complexity. The gating items are Meta app review, professional-account access, permission approval, rate limits, and compliance with public-content rules. Code alone does not unlock it.
- **Cost control:** current request caps bound the number of calls, but they do not bound actual Google spend. Activity fields and Place Details can raise the SKU/cost above the USD 0.032 estimate. A production budget should add a hard spend cap and record provider SKU/usage, not only an estimated per-search cost.
- **Recommended minimum:** keep the existing three Google APIs and use stored Places data for social-commerce enrichment. Add Google Geocoding or Nearby Search only when a specific normalization or radius workflow requires them. Treat approved Meta public-content access as the real dependency for social discovery.
