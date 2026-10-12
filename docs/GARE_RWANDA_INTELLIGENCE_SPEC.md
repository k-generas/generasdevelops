# GARE — RWANDA BUSINESS INTELLIGENCE & OPPORTUNITY DISCOVERY

## Safe Integration Specification for OpenCode

### Mission

Extend the existing GENERAS AUTONOMOUS REVENUE ENGINE (GARE) with a Rwanda-wide Business Intelligence capability.

The system should progressively discover, organize, verify, enrich, monitor and analyze publicly available information about companies, factories, service businesses, institutions, and other legitimate commercial organizations operating in Rwanda.

Its main purpose is not to create the largest possible contact list. Its purpose is to help the owner understand the Rwandan business landscape and identify the most realistic, profitable and evidence-supported opportunities for the services the owner can actually deliver.

**First inspect the existing repository. Do not begin by rebuilding the application.**

Preserve all working features, existing data, architecture, routes, integrations, database relationships, permissions and user workflows.

---

### 1. REQUIRED PRE-IMPLEMENTATION AUDIT

Inspect the actual repository, database schema, migrations, API routes, frontend pages, background workers, scheduled jobs, source integrations, tests and existing GARE intelligence modules.

Determine which capabilities already exist, which are incomplete, which are duplicated and which are genuinely missing.

Reuse existing implementations wherever possible, including:

- Business profiles and company records
- Global opportunity discovery
- Hiring intelligence
- Source registry and evidence records
- Website investigation and auditing
- Opportunity scoring and ranking
- Search history and scheduled scans
- AI research and proposal generation
- CRM, sales pipeline and follow-ups
- Activity logs, notifications and system monitoring
- Cost controls, owner settings and analytics

Do not create a second company database, a second opportunity engine, a duplicate source registry or another competing background-job system.

Before changing code, document the implementation plan and establish a regression baseline. Preserve uncommitted user changes.

### 2. RWANDA BUSINESS DISCOVERY ENGINE

Build a reusable discovery capability that can progressively identify businesses across all four provinces and the City of Kigali.

Support relevant business categories, including:

- Factories and manufacturers
- Wholesalers, distributors and retailers
- Agriculture, food processing and agribusiness
- Construction, engineering and property businesses
- Transport, logistics and mobility companies
- Hotels, restaurants and tourism businesses
- Clinics, hospitals and healthcare organizations
- Schools, universities and training institutions
- Financial services and insurance companies
- Technology companies and digital agencies
- Professional services and consultancies
- Importers, exporters and trading companies
- Energy, mining and industrial businesses
- Other relevant commercial sectors discovered from reliable sources

Support searches by province, district, sector, company size, business activity, location, website availability, hiring status and opportunity type.

Use official open datasets, permitted APIs, public business directories, company websites, public career pages, permitted map/business sources and other legitimate sources.

Do not claim that the system has found every business in Rwanda. Record the actual sources covered, scan dates, coverage limitations, errors and estimated data completeness.

Where an official source offers a downloadable dataset or authorized API, prefer that over unnecessary scraping.

Do not bypass CAPTCHAs, login restrictions, paywalls, technical access controls or explicit collection restrictions.

### 3. COMPREHENSIVE BUSINESS PROFILE

Extend the existing business entity or create a migration only if the current schema genuinely lacks the required fields.

Each business profile should support the following information where available:

**Identity and registration**
- Canonical company name
- Alternative names and trading names
- Registration identifier only when lawfully available and appropriate
- Registration status and registration date, where verifiable
- Legal structure and ownership information, only when publicly available and relevant
- Parent organization, subsidiaries and branches, where verified
- Company description and business activities

**Industry and commercial model**
- Primary and secondary industries
- Products and services
- Manufacturing or operational capabilities
- Target customer groups
- Business-to-business, business-to-consumer or other relevant model
- Supply-chain role, distributors and suppliers where evidenced
- Geographic markets served and export activity where evidenced

**Location**
- Province, district, sector and cell where available
- Public business address
- Headquarters, factory, warehouse and branch locations
- Map coordinates only when supported by a reliable source
- Location verification status

**Contacts**
- Public business phone numbers
- Public business email addresses
- Official website and contact page
- Official social media and professional pages
- Publicly listed professional contact names and roles when relevant
- Preferred legitimate business contact channel

Do not harvest private personal contact information or infer private contact details. Keep personal and business information appropriately separated.

**Workforce and history**
- Reported employee count or employee range
- Whether the count is verified, estimated or outdated
- Source and observation date
- Original founding date, if available
- Business age calculated from a verified or clearly qualified founding date
- Public hiring history
- Announced expansions, new branches, product launches, investments and significant operational changes

Never invent employee counts, founding dates, registration status, revenue, budgets or other company facts.

If a field cannot be verified, mark it unknown. If different sources disagree, preserve the conflict and source information instead of silently choosing a convenient answer.

### 4. SOURCE PROVENANCE AND VERIFICATION

Every material company fact must retain its provenance.

Store or reuse the existing equivalent of:

- Source name and source type
- Original source URL or dataset reference
- Date first discovered
- Date last checked
- Date last successfully verified
- Collection method
- Relevant evidence excerpt or factual summary, where permitted
- Verification status
- Confidence level and reason
- Conflicting evidence, if any
- Source freshness and expiration rules

Distinguish clearly between:

- Officially verified
- Confirmed by multiple credible sources
- Reported by one credible source
- AI-generated inference
- Estimated
- Outdated
- Conflicting
- Unverified
- Unknown

AI-generated summaries must never become verified facts simply because the AI produced them.

Do not treat a failed scan as proof that a company or website no longer exists.

### 5. WEBSITE AND DIGITAL PRESENCE INTELLIGENCE

Reuse the existing website investigation and audit system.

Where permitted, assess whether a business has:

- An official website
- A working domain and accessible pages
- Mobile-friendly pages
- Clear service and product information
- Visible business contact information
- Inquiry, booking, ordering or payment functionality
- Customer-support channels
- Signs of outdated content or broken links
- Relevant digital workflows that could potentially be improved

Identify observable issues and store evidence, severity, confidence and date checked.

Do not conclude that a company needs a website merely because no website was found. Verify the company identity, search coverage and available alternatives first.

Generate service opportunities only when there is a credible connection between an observable issue and a service the owner can deliver.

### 6. COMPANY ACTIVITY AND HIRING MONITORING

Integrate with the existing Hiring Intelligence capability.

Monitor permitted public sources for:

- New vacancies and changed job listings
- Repeated recruitment for similar roles
- New branches or facilities
- Factory expansion announcements
- New products or services
- New contracts and publicly announced partnerships
- Public tenders and supplier requests
- Investment or expansion announcements
- Changes in company services, pricing or operating locations

Track first-seen date, last-seen date, source date, current status and change history.

Deduplicate records across sources. Distinguish a newly discovered old vacancy from a genuinely new vacancy.

Use explicit statuses such as active, closed, expired, removed, unverified and unknown.

A hiring signal may suggest growth or a possible operational need, but it does not prove that the company has a budget or wants to purchase the owner's services.

### 7. SERVICE-TO-COMPANY MATCHING

Build on the owner's existing service profile and opportunity-ranking engine.

Use only services the owner has confirmed they can offer, including applicable categories such as:

- Website creation and redesign
- Website maintenance and technical troubleshooting
- Website performance and usability improvements
- Business workflow automation
- Custom business software
- Dashboards and reporting tools
- Lead management and customer follow-up systems
- Booking, ordering or payment workflow improvements
- Practical AI integration
- Digital operations consulting within the owner's actual competence
- Other services explicitly approved by the owner

Use actual project evidence, including DukaLinka and ClinicOS, where relevant. Treat them as projects and product-building evidence, not fabricated employment or proof of commercial outcomes.

Do not promise capabilities, certifications, client results, team size or delivery capacity that have not been verified.

For every proposed match, explain:

1. What the company does.
2. What specific problem or buying signal was observed.
3. The supporting evidence and its freshness.
4. Which service could address that problem.
5. Why the service is relevant to this company's industry and size.
6. Who the likely business decision-maker or appropriate contact role is, if publicly identifiable.
7. The best legitimate next action.
8. The confidence level and important uncertainties.
9. Estimated effort, costs and delivery requirements.
10. Why this opportunity ranks above or below comparable opportunities.

Clearly label hypotheses as hypotheses. Do not turn a weak signal into an asserted company need.

### 8. RWANDA OPPORTUNITY RANKING

Create a configurable ranking model that prioritizes opportunities according to:

- Evidence of a real need
- Match with the owner's actual capabilities
- Strength and freshness of buying signals
- Likely ability and willingness to pay, based on evidence
- Ease of reaching an appropriate business contact
- Estimated time to first payment
- Delivery effort and direct costs
- Potential profit rather than revenue alone
- Potential for recurring work
- Competitive pressure
- Geographic accessibility and delivery constraints
- Confidence in the available information
- Legal, operational and reputational risks

Avoid false precision. Show the factors, reasoning and confidence behind each ranking.

Separate opportunity priority from factual confidence. A high-priority lead with weak evidence must be visibly marked as requiring verification.

Support configurable owner preferences, including remote work, low startup costs, local delivery, online delivery, preferred districts, target industries and desired service types.

Do not rank a business highly simply because it is large, famous or hiring.

### 9. USEFUL INTERFACE INTEGRATION

Reuse existing GARE pages where possible. Add only genuinely missing views and controls.

The owner should be able to:

- Search and filter businesses across Rwanda
- Browse businesses by district, province and industry
- Open a complete company intelligence profile
- View locations and available branch information
- Filter by website status, hiring activity and business growth signals
- See source evidence and last verification dates
- Compare companies and opportunities
- Identify companies that match each available service
- Save, shortlist, dismiss or mark a business as unsuitable
- Record why an opportunity was accepted or rejected
- Move a qualified prospect into the existing opportunity and sales pipeline
- Generate an evidence-based proposal using the existing Proposal Studio
- Track contact attempts, replies, follow-ups and outcomes
- Export appropriately authorized business records when useful
- Review scan history, failures, source freshness and coverage limitations

Do not create a separate page for every data field or source. Keep the workflow coherent and avoid unnecessary dashboards and charts.

### 10. MONITORING, DEDUPLICATION AND COST CONTROL

Use the existing scheduler and durable job infrastructure.

Implement or reuse:

- Scheduled incremental scans
- On-demand company research
- Retry and backoff policies
- Idempotent job execution
- Deduplication and canonical business identity
- Rate limits and per-source controls
- Source-specific scan intervals
- Change detection and historical records
- Scan cancellation and error recovery
- Configurable API and AI budgets
- Usage and cost monitoring
- Source health and coverage reports

Prioritize free or low-cost reliable sources before paid services.

Do not repeatedly rescan unchanged records without a reason. Do not create duplicate jobs, records, notifications or outreach messages after retries.

Do not describe scheduled scanning as real-time monitoring. Display last successful scan and the actual update mechanism for each source.

### 11. PRIVACY AND OUTREACH SAFETY

Collect only relevant business information through permitted means.

Respect source terms, applicable Rwandan law, privacy requirements and opt-out requests. Store contact provenance and suppression status.

Discovery and research must not automatically trigger sales outreach.

Use the existing GARE approval and automation controls for any outbound messages or actions that require authorization. Do not send unsolicited bulk messages, impersonate people or fabricate personalizations, business relationships or claims.

Never use discovered company information to bypass security controls or access private systems.

### 12. TESTS AND REGRESSION PROTECTION

Add tests appropriate to the actual repository for:

- Business deduplication across sources
- Missing, conflicting and outdated company information
- Evidence provenance and confidence labels
- Registration and employee-count uncertainty
- Source failures and rate limits
- Hiring status and change detection
- Location and industry filtering
- Website audit evidence
- Service matching and ranking explanations
- Cost budgets and retry behavior
- Authorization and privacy controls
- Export permissions
- Existing opportunity, proposal, outreach, payment and delivery workflows

Use mocked source responses in automated tests. Never represent test fixtures as real discovered companies.

Run the relevant existing and new tests, type checks, linting and builds where available. Fix regressions introduced by this change.

Do not report a test, scan, integration or feature as successful unless it was actually executed and verified.

### 13. IMPLEMENTATION ORDER

Implement in small, safe, reviewable phases.

**Phase 1:** Audit and reuse existing models; establish the source registry, provenance, canonical business records and safe migrations.

**Phase 2:** Integrate a small number of reliable, permitted Rwanda business data sources. Validate data quality and deduplication.

**Phase 3:** Complete company profiles, geographic and industry filters, website intelligence and hiring/activity integration.

**Phase 4:** Implement service matching, evidence-backed opportunity scoring, comparisons and qualification workflows.

**Phase 5:** Integrate qualified prospects with existing proposals, sales pipeline, follow-ups and outcome tracking.

**Phase 6:** Expand source coverage and monitoring only when the current sources are reliable, affordable and demonstrably useful.

Do not attempt to activate every possible source at once. Do not add an integration that cannot be legally or technically accessed. Record blocked integrations and provide a clear reason.

### 14. COMPLETION REPORT

At the end, report:

- Existing capabilities reused
- New capabilities implemented
- Files and components changed
- Database migrations and indexes added
- Data sources integrated and their actual access status
- Tests, type checks and builds actually executed
- Results and regressions found
- Security, privacy and reliability considerations
- Current source coverage and known limitations
- API and AI costs or configured budget limits
- Features remaining blocked or incomplete
- Exact instructions for running and verifying the implementation

Keep all existing GARE functionality working.

**Final objective:** GARE should progressively build a reliable, evidence-backed intelligence map of Rwanda's business landscape and help the owner focus on the companies most likely to benefit from services the owner can genuinely deliver. Prioritize trustworthy data, actionable opportunities, low operating costs and conversion into real business — not maximum record counts or unnecessary features.
