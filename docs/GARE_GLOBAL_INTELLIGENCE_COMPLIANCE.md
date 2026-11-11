# GARE Global Intelligence Compliance

## Important

This document and the in-app policy templates are operational checklists, not legal advice.
Laws, platform terms and data-protection obligations depend on the sender, recipient, country,
channel and message. The owner must obtain qualified advice before outreach at scale.

## Scope

The compliance layer covers:

- suppression and do-not-contact;
- outreach eligibility checks;
- country policy templates;
- audit details for manually logged outreach;
- safe handling of exports.

It does not send messages, automate prospecting or guarantee lawful outreach.

## Channels

Supported contact channels:

- email
- WhatsApp
- phone
- SMS
- LinkedIn
- contact form

LinkedIn is treated as manual-only. Automated collection, connection requests and messages are
prohibited.

## Suppression ledger

Table: `suppression_entries`.

Scopes:

- `contact` - any contact with the person or entity;
- `email` - normalised email address;
- `phone` - normalised phone number;
- `domain` - normalised website domain;
- `business` - business UUID;
- `professional` - professional UUID.

Each entry has:

- channel: `all`, `email`, `whatsapp`, `phone`, `sms`, `linkedin` or `contact_form`;
- a required reason;
- optional source, country and expiry.

Rules:

- Expired entries stay visible but do not block outreach.
- `all` blocks every channel.
- Suppression always wins over commercial interest.
- Entries are owner-scoped with RLS.
- Deleting an entry is an owner action and is not automatic.

## Business do-not-contact

Existing `businesses.contact_suppressed` blocks every channel for the whole business.
`businesses.suppression_reason` records why.

The compliance page can set this flag. The flag is checked by the eligibility function.

## Eligibility logic

Function: `outreachEligibility` in `src/lib/compliance.ts`.

Inputs:

- channel;
- optional country;
- email, phone, domain, business ID and/or professional ID;
- suppression entries;
- business and professional do-not-contact flags;
- owner confirmation;
- current time for expiry checks.

Blocked when:

- an active suppression entry matches;
- the business is marked do-not-contact;
- the professional is marked do-not-contact.

Review required when:

- the country/channel lawful basis is unknown or requires consent;
- policy owner review is required;
- owner confirmation is missing;
- LinkedIn is selected;
- the channel is restricted.

Requirements returned to the owner can include:

- clear opt-out/unsubscribe route;
- clear sender identity;
- no automation without recorded consent;
- retention review;
- destination-country and channel-terms review.

## Country templates

Templates currently cover a global baseline plus Rwanda, Kenya, Nigeria, South Africa, the United
Kingdom, England/Wales, the United States, Canada, Australia, the UAE, Singapore, India, Brazil
and the EU.

Every template is marked owner-review-required. The templates intentionally use conservative
values and do not assert that outreach is permitted.

## Outreach recording

`src/routes/_authenticated/proposals.$id.tsx` now:

1. requires an owner confirmation checkbox;
2. maps the selected channel to a compliance channel;
3. calls the authenticated eligibility function with the proposal's business ID;
4. stops on blocked;
5. allows review-required recording only after confirmation;
6. stores compliance status, reasons, check time and confirmation in the activity event;
7. keeps existing proposal, task and event updates.

In-person and other channels cannot be matched automatically and require manual confirmation.

## Campaign review queue

`/campaigns` builds templates and a review queue, not a sending engine:

1. every queued target is checked against the suppression ledger and the business/professional
   do-not-contact flag;
2. a target with no email or phone for the selected channel is marked blocked;
3. everything else starts as needs-review, even when the policy result is allowed;
4. approval requires an owner confirmation that the lawful basis, suppression result and channel
   terms were reviewed;
5. "mark sent" requires an approved item and a second confirmation that the owner sent it manually
   outside GARE;
6. no SMTP, WhatsApp, LinkedIn or other sending integration exists on the page.

## Privacy and retention

- Collect the minimum personal data needed for a legitimate business purpose.
- Do not store sensitive data that is not necessary.
- Keep source URLs and evidence.
- Do not send personal data to unapproved AI tools or public spreadsheets.
- Delete exports when the purpose is complete.
- Review retention periodically; the prototype templates suggest 24 months but this must be
  confirmed.
- Suppression entries should be retained as needed to honour the request.

## Safe exports

`src/lib/export-safe.ts` neutralises cells that begin with formula characters and writes safe CSV
and XLSX. This reduces spreadsheet injection risk but does not anonymise data.

## Prohibited behaviour

- Scraping LinkedIn or login-walled platforms.
- Bypassing CAPTCHAs, paywalls or access controls.
- Automated connection requests or messages.
- Outreach to suppressed contacts or businesses.
- Claiming legal clearance from the app's templates.
- Inventing consent, lawful basis or relationship evidence.

## Review checklist

Before outreach:

- [ ] The contact is relevant to a lawful business purpose.
- [ ] The destination country and channel rules were reviewed.
- [ ] The platform terms allow the intended contact.
- [ ] The suppression ledger was checked.
- [ ] The business is not marked do-not-contact.
- [ ] Sender identity and opt-out are clear.
- [ ] No automation is used unless prior consent is recorded.
- [ ] Retention and deletion are planned.
- [ ] A qualified adviser was consulted where required.
