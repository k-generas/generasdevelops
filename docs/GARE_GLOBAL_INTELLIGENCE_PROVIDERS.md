# GARE Global Intelligence Providers

## Principles

- A provider is never shown as working unless the current server runtime proves it is configured.
- Configured does not mean verified. AI billing and quota can still fail.
- No provider is called merely to prove it exists.
- Paid providers stay off until the owner activates billing and limits.
- LinkedIn automation is blocked.
- No scraping behind logins, CAPTCHAs or paywalls.
- Only the minimum necessary data is sent to AI providers.

## Runtime source of truth

`src/lib/system.functions.ts` returns booleans for credential presence:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`
- `LOVABLE_API_KEY`
- `GEOAPIFY_API_KEY`
- `LOVABLE_API_KEY` plus `GOOGLE_MAPS_API_KEY` for Google Places through the connector
- detected places provider: Google, Geoapify or none

It never returns key values.

`src/lib/provider-registry.ts` maps this configuration to provider status.

## Status meanings

| Status | Meaning |
| --- | --- |
| `available` | Configured and enabled for bounded use. |
| `configured_unverified` | Credentials exist, but quota/billing is not proven. Used for AI. |
| `unavailable` | Missing credentials or not enabled. |
| `blocked` | Prohibited for automation. Currently LinkedIn. |
| `review_required` | Terms, API access or owner decision is still needed. |

## Provider catalogue

### Places and geography

- **Google Places API** - paid, official Places API, bounded to 20 results per run and deduped by
  `place_id`. Requires `LOVABLE_API_KEY` and `GOOGLE_MAPS_API_KEY`.
- **Geoapify / OpenStreetMap** - free-with-limits fallback for local development with
  `GEOAPIFY_API_KEY`. Respect quotas and attribution.
- **OpenStreetMap Nominatim** - not wired. Public endpoint has strict usage policy.

### Website intelligence

- **Direct public website check** - available. Bounded timeout and response size. Public pages
  only. Checks reachability, HTTPS, mobile viewport, contact signals and copyright year.

### AI

- **OpenAI Responses** - paid; evidence interpretation and structured JSON.
- **Google Gemini** - paid; evidence interpretation and structured JSON.
- **Lovable AI gateway** - paid; quota and credits can be exhausted.

All AI providers are shown as configured-unverified when their key exists. AI must not invent
facts.

### Professional people

- **Public professional pages (manual review)** - available. The owner records what they can
  lawfully view, with the public source URL.
- **LinkedIn** - blocked for automation. Manual use only.

### Registries

- **Official company registries** - review required. No API or reuse terms are enabled.

### Social

- **Meta Graph API** - unavailable until app review, page permissions and credentials exist.

### Verification

- **Email verification provider** - unavailable. Local syntax and domain checks remain possible,
  but no deliverability provider is configured.

### News and signals

- **Public news / announcement feeds** - review required. Prefer official feeds and APIs; do not
  scrape paywalled content.

## Activation checklist

Before enabling any provider:

1. Confirm the provider's terms allow the intended use.
2. Confirm data protection and retention obligations.
3. Confirm billing limits and alerting.
4. Add the credential to the server environment only.
5. Add bounded retry, timeout and result limits.
6. Record the provider in the registry with truthful capability and coverage.
7. Update `/providers` status resolution.
8. Add tests for the status mapping and failure handling.
9. Never expose the credential to the browser.

## Places constraints

Existing discovery rules still apply:

- maximum 20 results per run;
- dedupe by `place_id`;
- calls go through authenticated server functions;
- provider failures must degrade gracefully;
- no paid API calls from the status page.

## Provider page

`/providers` shows:

- category grouping;
- runtime status;
- reason;
- capabilities;
- coverage;
- cost model;
- credential key names only;
- compliance notes;
- documentation links when available.

It does not perform a live health check against paid services.

## Current gaps

- Google Places and AI quota are not verified in this environment.
- Geoapify is only a local fallback.
- Global registries and news feeds need per-country and per-source review.
- Meta requires app review and permissions.
- Professional automation remains intentionally disabled.
