# GARE — Implementation Plan

Principles: never replace the stack, never delete working features, never fake data,
respect owner RLS on every table, keep paid Maps usage bounded, and make AI interpret
evidence rather than invent it.

Effort key: S = small, M = medium, L = large. Priority: P0 safety → P4 intelligence.

## Done (this pass)

| # | Item | Priority | Effort | Notes |
| --- | --- | --- | --- | --- |
| 1 | Activity / closure signals for discovery | P1 | M | migration 0003, `places.server.ts`, badges in discover + business detail |
| 2 | Skip auto-proposal for permanently-closed leads | P0 | S | `discovery.functions.ts`; closure rule in `investigate.server.ts` |
| 3 | Pricing floors (enforced server-side) | P0 | M | `src/lib/pricing.ts`, `createProposal`, unit tests |
| 4 | Settings page (owner pricing + integration status) | P1 | M | `/settings`, `getSystemStatus`, nav + account menu |
| 5 | Tasks upgraded to real follow-ups | P2 | M | create / due date / priority / overdue / complete / reopen |
| 6 | Dashboard alerts + "continue where you left off" | P2 | S | failed runs, overdue, `last_opened_at` on business open |
| 7 | Test + tooling hygiene | P0 | S | `pricing.test.ts`; `.prettierrc` `endOfLine: auto`; lint `any` cleanup |
| 8 | Offer catalog CRUD (replaces static `OFFER_LIST`) | P1 | M | migration 0004 `offers`, `src/lib/offers.ts`, `offers.hooks.ts`, Settings editor, proposal dropdown |
| 9 | Database migration runbook | P1 | S | `docs/GARE_DB_RUNBOOK.md` |
| 10 | Manual outreach log per proposal | P2 | S | `src/lib/outreach.ts`, outreach panel in `proposals.$id`, threads into `business_activity_events` |
| 11 | Channel-aware, copy-paste-ready drafting | P2 | S | `src/lib/channels.ts` per-channel format rules fed into `proposals.server.ts`; channel list + hint in Proposal Studio |
| 12 | Proposal outcomes + win rate | P2 | S | `src/lib/outcomes.ts`; outcome reason capture in `proposals.$id`; win-rate card on the dashboard |

## Next (recommended order)

### P2 — Revenue
1. Invoicing-lite: generate a from-proposal document, mark paid/unpaid, no payment provider. (M)

### P3 — Delivery
2. Orders: promote an accepted proposal into an order with status and due date. (L)
3. Delivery checklist per order (reuse `tasks` scoped to the order). (M)
4. Analytics: time-series of leads, proposals and wins (weekly/monthly). (M)

### P4 — Intelligence
5. Cost/budget view: count discovery runs, investigations and AI calls per period. (M)
6. Learning loop: feed proposal outcomes back into offer recommendation. (L)
7. Automation: scheduled discovery with strict caps (requires a worker/cron). (L)

## Explicitly out of scope (by design)

- Payment processing — nothing is charged; the app records intent only.
- Email/WhatsApp sending automation — no provider is configured; sends are logged manually.
- Multi-user/roles — the app is single-owner private with `owner_id = auth.uid()` RLS.

## Definition of done for each item

- `npx tsc --noEmit` clean, `npm run lint` clean, `npm test` passing, `npm run build` succeeding.
- No secrets in the repo. Owner RLS respected. No fabricated data in the UI.
- A regression note added to `docs/GARE_REGRESSION_LOG.md`.
