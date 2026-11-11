# GARE Global Intelligence Database

## Migrations

- `supabase/migrations/20261109000000_global_intelligence_foundation.sql`
- `supabase/migrations/20261111000000_outreach_campaigns.sql`

Status: applied to hosted Supabase on 2026-11-11. Verification confirmed all six tables exist,
RLS is enabled, each table has one owner-scoped policy using `owner_id = auth.uid()`, expected
indexes are present, and `authenticated` has select grants.

The migrations are additive. They do not alter existing tables or rewrite existing data.

## Ownership and RLS

All new tables include:

```sql
owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
```

Each table:

- revokes privileges from `PUBLIC`, `anon` and `authenticated`;
- grants `SELECT, INSERT, UPDATE, DELETE` to `authenticated`;
- grants all to `service_role`;
- enables row-level security;
- has a `FOR ALL` policy using `owner_id = auth.uid()`.

## `professionals`

Purpose: a private, evidence-based directory of professional people.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `owner_id` | uuid | owner and RLS key |
| `full_name` | text | required |
| `headline` | text | public role/headline |
| `professional_type` | text | check-constrained taxonomy |
| `country`, `region`, `city` | text | optional location |
| `languages` | text[] | normalised list |
| `expertise`, `skills` | text[] | normalised list |
| `website`, `public_email`, `public_phone`, `profile_url` | text | public contact/profile |
| `source_name`, `source_url` | text | provenance |
| `evidence` | jsonb | evidence array, default `[]` |
| `confidence` | numeric | 0 to 1 |
| `verification_status` | text | unverified, observed, corroborated, owner-confirmed |
| `availability_status` | text | unknown, open, limited, unavailable |
| `relationship_stage` | text | research through won/lost/do-not-contact |
| `do_not_contact` | boolean | hard stop |
| `notes` | text | owner notes |
| `last_verified_at` | timestamptz | optional |
| `dedupe_key` | text | unique per owner |
| `created_at`, `updated_at` | timestamptz | timestamps |

Unique key:

```sql
UNIQUE (owner_id, dedupe_key)
```

Indexes:

- `(owner_id, relationship_stage, updated_at DESC)`
- owner/country
- owner/professional type

## `professional_business_links`

Purpose: relationships between people and existing businesses.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `owner_id` | uuid | owner and RLS key |
| `professional_id` | uuid | references professionals, cascade delete |
| `business_id` | uuid | references businesses, cascade delete |
| `relationship_type` | text | works_at, founder_of, owner_of, advisor_to, partner_with, client_of, prospect_for, other |
| `role` | text | optional role at the business |
| `confidence` | numeric | 0 to 1 |
| `verified` | boolean | owner-confirmed relationship |
| `evidence` | jsonb | evidence array |
| `created_at`, `updated_at` | timestamptz | timestamps |

Unique key:

```sql
UNIQUE (owner_id, professional_id, business_id, relationship_type)
```

Indexes:

- `(owner_id, professional_id, updated_at DESC)`
- `(owner_id, business_id, updated_at DESC)`

## `suppression_entries`

Purpose: contacts or entities that must not receive outreach.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `owner_id` | uuid | owner and RLS key |
| `scope` | text | contact, email, phone, domain, business, professional |
| `value` | text | normalised matching value |
| `channel` | text | all, email, whatsapp, phone, sms, linkedin, contact_form |
| `reason` | text | required reason |
| `source` | text | where the request was recorded |
| `country` | text | optional |
| `expires_at` | timestamptz | optional expiry |
| `created_at`, `updated_at` | timestamptz | timestamps |

Unique key:

```sql
UNIQUE (owner_id, scope, value, channel)
```

Indexes:

- `(owner_id, scope, value)`
- `(owner_id, channel, expires_at)`

## `outreach_campaigns`

Purpose: owner-authored outreach campaign definition.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `owner_id` | uuid | owner and RLS key |
| `name` | text | required |
| `objective` | text | optional desired outcome |
| `status` | text | draft, ready, running, paused, completed, archived |
| `audience_kind` | text | business or professional |
| `daily_limit` | integer | 1 to 500 review limit |
| `notes` | text | owner notes |
| `created_at`, `updated_at` | timestamptz | timestamps |

## `outreach_campaign_steps`

Purpose: ordered sequence steps. Steps contain templates only; they do not send.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `owner_id` | uuid | owner and RLS key |
| `campaign_id` | uuid | references outreach_campaigns, cascade delete |
| `step_order` | integer | positive, unique per campaign |
| `channel` | text | email, whatsapp, phone, sms, linkedin, contact_form |
| `delay_days` | integer | 0 to 90 |
| `subject_template` | text | required by application validation for email/contact form |
| `body_template` | text | required |
| `requires_approval` | boolean | defaults true |
| `active` | boolean | defaults true |

Unique key:

```sql
UNIQUE (owner_id, campaign_id, step_order)
```

## `outreach_queue_items`

Purpose: the manual review queue for one campaign step and one target.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `owner_id` | uuid | owner and RLS key |
| `campaign_id`, `step_id` | uuid | references campaign and step, cascade delete |
| `business_id`, `professional_id` | uuid | optional target references, cascade delete |
| `channel` | text | channel snapshot at queue time |
| `recipient_name`, `recipient_email`, `recipient_phone`, `recipient_domain`, `country` | text | target snapshot |
| `status` | text | draft, needs_review, blocked, approved, sent, skipped |
| `eligibility` | jsonb | compliance result snapshot |
| `draft_subject`, `draft_body` | text | rendered owner template |
| `approved_at`, `sent_at` | timestamptz | manual review timestamps |
| `owner_note` | text | optional review note |
| `dedupe_key` | text | stable target plus step key |

Unique key:

```sql
UNIQUE (owner_id, campaign_id, step_id, dedupe_key)
```

Indexes:

- `(owner_id, campaign_id, status, updated_at DESC)`
- `(owner_id, step_id, status)`

No queue row is sent by the database or server. `sent` only records the owner's manual action.

## `businesses` contact fields

The existing `businesses` table does not have a `country` or `city` column. It has `district`,
`province`, `address`, latitude/longitude and markets. Compliance checks therefore use the
caller-supplied country or the professional country, not a business country column.

Existing fields used by the compliance layer:

- `contact_suppressed`
- `suppression_reason`
- `emails`
- `phone`
- `website`

## Backup coverage

`src/lib/export.ts` now includes:

- `professionals`
- `professional_business_links`
- `outreach_campaigns`
- `outreach_campaign_steps`
- `outreach_queue_items`
- `suppression_entries`

Missing tables are treated as empty with an error entry in the backup file, so older databases
do not abort the whole backup.

## Apply and verify

After applying the migration, verify:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'professionals', 'professional_business_links', 'suppression_entries',
    'outreach_campaigns', 'outreach_campaign_steps', 'outreach_queue_items'
  );

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'professionals', 'professional_business_links', 'suppression_entries',
    'outreach_campaigns', 'outreach_campaign_steps', 'outreach_queue_items'
  );
```

Then test with an authenticated owner session:

- insert a professional;
- insert a suppression entry;
- link the professional to a business;
- confirm the rows are visible only to that owner;
- confirm deleting a professional removes its links.

## Notes

- No database trigger currently updates `updated_at`; server functions set it explicitly.
- Do not store sensitive personal data that is not necessary for the commercial purpose.
- Suppression entries may contain personal data and must be exported and stored securely.
