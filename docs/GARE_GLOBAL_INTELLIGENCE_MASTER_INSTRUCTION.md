# GARE Global Intelligence & Revenue Operating System — Master Instruction

You are working on an existing production application called GARE.

## 0. Primary objective

Build GARE into a global business and professional intelligence, opportunity discovery, AI prospecting, outreach, sales, relationship management, and revenue operations system.

The application must help the owner:

1. Discover businesses and professional people worldwide.
2. Understand each business and person using verified evidence.
3. Identify genuine business opportunities and buying intent.
4. Rank prospects by fit, evidence, urgency, value, and likelihood of conversion.
5. Create highly personalized outreach and proposals.
6. Manage leads, prospects, contacts, relationships, and clients.
7. Track follow-ups, conversations, campaigns, and outcomes.
8. Manage offers, pricing, proposals, invoices, payments, and revenue.
9. Understand which activities produce revenue.
10. Operate globally, not only in Rwanda.

The system must be commercially useful, truthful, safe, inspectable, and maintainable.

Do not produce a concept, mockup, plan, or documentation-only result. Implement the requested capabilities in the existing application.

---

## 1. Absolute engineering rules

1. Preserve all existing working functionality.
2. Do not rebuild the application from scratch.
3. Do not replace the current stack unless a proven blocker exists.
4. Inspect the existing code before changing it.
5. Reuse existing components, routes, database tables, services, hooks, and design patterns where appropriate.
6. Extend rather than duplicate.
7. Never invent business data.
8. Never invent professional/person data.
9. Never fabricate emails, phone numbers, names, job titles, social profiles, revenue, employee counts, technologies, or buying intent.
10. Clearly distinguish:
    - verified facts
    - public-source facts
    - user-provided facts
    - inferred attributes
    - hypotheses
    - unknown values
11. Every material conclusion must retain evidence and provenance.
12. Never expose API keys, service-role keys, private tokens, or secrets to browser code.
13. All external API calls must occur server-side.
14. Never bypass authentication, authorization, CAPTCHAs, paywalls, robots restrictions, platform terms, privacy laws, or rate limits.
15. Never scrape LinkedIn or any platform whose terms prohibit automated collection.
16. Do not auto-send email, WhatsApp, SMS, LinkedIn, or other external messages without explicit owner approval of both the message and the sending mechanism.
17. Do not automatically spend money on paid data providers, enrichment, advertising, or AI without clear limits and owner approval.
18. Do not run destructive database operations.
19. Do not delete production data as part of a migration.
20. Prefer additive, reversible database migrations.
21. Every table must be owner-scoped and protected with row-level security unless it is explicitly global reference data.
22. Paginate and filter large datasets server-side.
23. Do not load unbounded datasets into the browser.
24. Keep imports and dependencies minimal.
25. Do not add dependencies unless genuinely necessary.
26. Keep the application building, type-safe, lint-clean, and tested.
27. Add tests for critical business logic, especially filtering, scoring, deduplication, compliance, export, and revenue calculations.
28. Document what was implemented, what was not, and why.
29. Do not claim an integration works when credentials or permissions are missing.
30. Show configuration/provider status accurately.
31. Do not deploy automatically.
32. Preserve unrelated uncommitted work.
33. Create logical commits for completed implementation units when the repository workflow permits.
34. Do not rewrite published git history.
35. Do not remove useful existing features merely because the new design is different.

---

## 2. Operating procedure

For each feature:

1. Inspect the existing implementation.
2. Write or update the implementation checklist.
3. Identify reusable code and data.
4. Design the smallest safe extension.
5. Implement the database changes.
6. Implement server-side logic.
7. Implement the UI.
8. Add tests.
9. Run type checking, linting, tests, and build.
10. Fix failures.
11. Update documentation.
12. Record the result in the regression log.
13. Commit only stable, coherent work.
14. Continue to the next feature.

Do not ask routine implementation questions. Only stop for true blockers, such as missing credentials for a paid integration, irreversible production risk, or conflicting instructions.

---

## 3. Required documentation

Create and maintain:

- `docs/GARE_GLOBAL_INTELLIGENCE_ARCHITECTURE.md`
- `docs/GARE_GLOBAL_INTELLIGENCE_IMPLEMENTATION.md`
- `docs/GARE_GLOBAL_INTELLIGENCE_DATABASE.md`
- `docs/GARE_GLOBAL_INTELLIGENCE_PROVIDERS.md`
- `docs/GARE_GLOBAL_INTELLIGENCE_COMPLIANCE.md`
- `docs/GARE_GLOBAL_INTELLIGENCE_TESTING.md`
- `docs/GARE_REGRESSION_LOG.md`

Each document must accurately distinguish implemented, partial, blocked, and planned functionality.

---

## 4. Product scope

GARE must support:

### 4.1 Global business discovery

- Countries, regions, cities, and worldwide searches.
- Businesses by category, keyword, geography, language, source, and status.
- Official APIs first.
- Public directories and registries where permitted.
- Website-based discovery.
- Social business profiles through permitted APIs or manual entry.
- Maps and local business sources.
- Import and enrichment.

### 4.2 Professional people intelligence

A professional person may include:

- founder
- owner
- executive
- director
- manager
- consultant
- freelancer
- creator
- engineer
- designer
- marketer
- salesperson
- investor
- partner
- other relevant roles

Track professionals independently from businesses, with relationships to businesses.

### 4.3 Evidence-based enrichment

For each business or person, support:

- official website
- domain
- contact pages
- public emails
- public phone numbers
- addresses
- countries and cities
- social profiles
- professional profiles
- company size, only if sourced
- industry/category
- technologies detected from public pages
- languages
- operating status
- review signals
- hiring signals
- recent public activity
- funding/public announcements
- regulatory or registry identifiers
- source URLs
- timestamps
- confidence
- verification status

### 4.4 Opportunity intelligence

Identify opportunities based on verified evidence, for example:

- no website
- broken website
- slow website
- outdated website
- poor mobile experience
- missing contact path
- weak online presence
- inconsistent identity
- outdated information
- poor conversion path
- no booking flow
- missing ecommerce
- manual process
- weak local visibility
- poor social presence
- misaligned offer
- expansion potential
- partnership potential
- hiring or growth signal
- funding or launch signal
- customer demand signal
- competitor weakness

Every opportunity must include:

- what was observed
- where it was observed
- when it was observed
- evidence confidence
- limitations
- why it matters
- recommended offer/action
- estimated effort
- estimated value only when assumptions are explicit
- uncertainty

### 4.5 AI prospecting

Support natural-language commands such as:

- "Find independent dental clinics in Kigali with outdated websites."
- "Find marketing agencies in London that may need white-label delivery."
- "Find fintech startups in Singapore that recently raised funding."
- "Find professional web developers in Nairobi interested in subcontract work."
- "Find hotels in Cape Town with weak booking experiences."

Convert natural language into structured filters.

Show the interpreted filters to the user before or alongside results.

Never invent matching prospects.

### 4.6 Ranking and prioritization

Rank prospects using transparent factors such as:

- service fit
- evidence quality
- severity of need
- buying intent
- urgency
- estimated value
- probability of conversion
- relationship strength
- recency
- geographic practicality
- competition/overflow capacity
- risk
- compliance constraints

Scores must be explainable. Do not present arbitrary scores as facts.

### 4.7 Contact and relationship management

Support:

- leads
- prospects
- qualified prospects
- contacted
- replied
- meeting
- proposal
- negotiation
- won
- lost
- dormant
- not qualified
- do not contact

Support relationships between:

- people and businesses
- people and people
- businesses and businesses
- referrers and referrals
- partners and handoffs

### 4.8 Outreach

Support drafting and management of:

- email
- WhatsApp
- LinkedIn manual message
- SMS
- phone script
- contact form message
- proposal
- follow-up
- campaign sequence

Outreach must be personalized using verified evidence. Do not fabricate familiarity.

### 4.9 Campaigns

Support:

- campaign name
- objective
- audience filters
- source constraints
- countries
- languages
- offer
- channels
- message templates
- sequence steps
- schedule
- daily/weekly limits
- stop conditions
- reply handling
- outcome tracking

### 4.10 Sales operations

Support:

- pipeline
- stages
- tasks
- follow-ups
- meetings
- proposals
- invoices
- payments
- recurring revenue
- referrals
- handoffs
- customer records
- lifecycle

### 4.11 Finance

Support:

- offers
- pricing
- proposals
- invoices
- payments
- expenses
- currencies
- recurring revenue
- outstanding balances
- profit
- unit economics
- provider costs
- campaign costs
- AI costs
- budget limits

Do not combine currencies without explicit conversion and rates.

### 4.12 Analytics

Support:

- discovery volume
- enrichment coverage
- opportunity counts
- qualification rates
- outreach volume
- reply rates
- meeting rates
- proposal rates
- win rates
- revenue
- cost
- profit
- source performance
- country performance
- category performance
- campaign performance
- offer performance
- professional relationship performance

---

## 5. Global compliance and safety

Build a compliance layer.

Support country/region policies for:

- lawful basis for business-to-business contact
- consent requirements
- legitimate interest where applicable
- unsubscribe/suppression
- do-not-contact
- data minimization
- retention
- deletion
- purpose limitation
- cross-border data considerations
- platform terms
- source terms
- robots restrictions
- rate limits

Never provide legal advice as fact. Show policy status and require owner review.

Implement suppression lists and do-not-contact checks.

Prevent outreach to suppressed contacts.

Do not automate prohibited collection.

---

## 6. Data model

Inspect the existing schema first.

Extend it only when necessary.

Expected core entities may include:

- businesses
- business_locations
- business_contacts
- business_sources
- professionals
- professional_profiles
- professional_business_links
- professional_contacts
- professional_sources
- discovery_campaigns
- discovery_sources
- discovery_source_runs
- opportunities
- opportunity_evidence
- opportunity_scores
- prospect_qualifications
- relationships
- conversations
- messages
- outreach_campaigns
- outreach_steps
- outreach_events
- suppression_entries
- compliance_policies
- provider_configs
- provider_usage
- budgets
- exports
- ai_runs
- audit_events

Reuse existing equivalents where they already exist.

Do not create duplicate concepts.

Every owner-scoped table needs:

- `id`
- `owner_id`
- `created_at`
- `updated_at`
- indexes for common queries
- RLS policies
- reduced grants where appropriate

Use foreign keys and ownership checks.

Use JSONB only for genuinely flexible evidence or metadata, not as a substitute for a queryable schema.

---

## 7. Provider architecture

Create a provider abstraction.

Support, where credentials and terms permit:

- official business registries
- Google Places
- OpenStreetMap
- Geoapify
- company enrichment providers
- website intelligence
- email verification
- professional data providers
- news/announcement sources
- social APIs
- AI providers

Each provider must declare:

- name
- category
- countries supported
- capabilities
- cost model
- credential status
- terms/compliance notes
- rate limits
- enabled/disabled
- last success
- last failure
- usage
- data retention constraints

The app must degrade gracefully when a provider is unavailable.

Never fake provider availability.

---

## 8. AI architecture

AI may:

- interpret evidence
- summarize evidence
- classify
- rank with explicit inputs
- draft messages
- suggest next actions
- convert natural language into filters
- explain scores

AI may not:

- invent facts
- invent sources
- invent contacts
- invent intent
- claim an action happened
- claim an integration works
- send external messages automatically

Keep prompts and JSON schemas versioned.

Record AI usage and cost when available.

Validate structured output.

Provide deterministic fallbacks.

---

## 9. User experience

The application should have clear areas for:

- Dashboard / command center
- Global discovery
- Businesses
- Professionals
- Opportunities
- Prospect lists
- Campaigns
- Outreach
- Conversations
- Pipeline
- Proposals
- Invoices
- Payments
- Revenue
- Analytics
- Providers
- Compliance
- Settings

Keep the existing visual language.

Prioritize usability on desktop and mobile.

Use progressive disclosure for advanced filters.

Show evidence, confidence, freshness, and limitations.

Never hide uncertainty behind polished UI.

---

## 10. Performance and scalability

- Server-side pagination.
- Indexed filtering.
- Avoid N+1 queries.
- Batch enrichment.
- Deduplicate by canonical identifiers.
- Cache safely.
- Rate-limit providers.
- Bound concurrent jobs.
- Respect quotas.
- Support large datasets without loading everything into memory.
- Generate exports server-side or in bounded batches.

---

## 11. Security

- Server-side authorization.
- RLS on owner data.
- No secrets in client bundles.
- Input validation.
- Output encoding.
- SSRF-safe website fetching.
- URL allowlists where appropriate.
- Timeouts.
- Size limits.
- Content-type checks.
- Formula-injection protection in CSV/Excel exports.
- Audit sensitive actions.
- Safe error messages.
- Never log secrets.

---

## 12. Testing

Add tests for:

- filters
- scoring
- ranking
- deduplication
- geography
- professional matching
- evidence confidence
- compliance
- suppression
- outreach eligibility
- campaign limits
- revenue math
- currency separation
- exports
- CSV injection
- AI schema validation
- provider fallback
- permission boundaries where testable

Run:

- type check
- lint
- tests
- production build

---

## 13. Migration strategy

- Inspect current migrations.
- Add new migrations, do not rewrite applied ones.
- Use additive changes.
- Backfill safely.
- Add indexes concurrently where supported.
- Guard against duplicate data.
- Keep RLS enabled.
- Document applied vs pending migrations.
- Verify the hosted database separately from local tests.

---

## 14. Definition of done

A feature is complete only when:

- database changes are applied or clearly documented as pending
- server logic exists
- UI is wired
- authorization is enforced
- errors degrade gracefully
- tests pass
- type check passes
- lint passes
- build passes
- docs are updated
- regression log is updated
- no fabricated data or integrations are present
- provider/compliance limitations are visible

---

## 15. Execution order

Proceed in this order unless existing code makes a different order safer:

### Phase 1 — Foundation

- architecture audit
- provider registry
- compliance foundation
- canonical business/professional models
- source/provenance model
- global geography
- campaign/filter foundation

### Phase 2 — Enrichment

- website intelligence
- contact extraction and verification
- professional profiles
- source-backed enrichment
- evidence freshness

### Phase 3 — Opportunity intelligence

- deterministic rules
- scoring
- ranking
- qualification
- explainability

### Phase 4 — Prospecting and data operations

- natural-language prospecting
- saved prospect lists
- global filtering
- exports
- deduplication

### Phase 5 — Professional intelligence

- professionals
- relationships
- expertise
- availability
- partnership/subcontract matching

### Phase 6 — Outreach and campaigns

- campaign builder
- sequences
- message drafting
- compliance checks
- manual approval queue
- outreach tracking

### Phase 7 — Sales and revenue operations

- pipeline
- conversations
- proposals
- finance
- analytics

### Phase 8 — Scale and optimization

- monitoring
- budgets
- provider health
- experiments
- learning loop
- performance
- documentation

---

## 16. Final instruction

Start by auditing the existing application and documenting the true current state.

Then implement the missing capabilities phase by phase.

Do not stop at analysis.

Do not merely produce a plan.

Build, test, verify, document, and continue.

When a provider, credential, or legal requirement prevents full implementation, implement the safe abstraction, configuration, status, and fallback, and clearly mark the remaining blocker.
