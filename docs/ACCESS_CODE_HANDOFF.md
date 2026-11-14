# Access Code Fix Handoff

Status: implemented and deployed, not fully live-tested.

## What changed

- `src/lib/access-codes.ts` - pure code generation, SHA-256 hashing, code normalization, and pgcrypto/search-path error detection.
- `src/lib/access-codes.server.ts` - service-role fallback for issuing and redeeming codes; best-effort audit/attempt logging.
- `src/lib/access.functions.ts` - `redeemAccessCode` server function with a JWT-only middleware that does not require approved access.
- `src/lib/admin.functions.ts` - `issueAccessCode` now falls back to a direct `access_codes` insert when the hosted RPC still uses the broken pgcrypto search path.
- `src/lib/access.ts` - client error mapping, including `redeem_unavailable`.
- `src/components/AccessGate.tsx` - redeems through the new server function.
- `src/lib/access-codes.test.ts` - targeted helper tests.

## Database fix

Unapplied files:

- `supabase/migrations/20261113000000_fix_access_code_pgcrypto.sql`
- `drizzle/migrations/0031_fix_access_code_pgcrypto.sql`
- `drizzle/migrations/meta/_journal.json`

Correct function bodies are also in `docs/APPLY_PENDING_MIGRATIONS.sql`. Root cause: hosted Supabase project `lfhzponzmkdconaovolq` has the old functions pinned to `SET search_path = public`, while pgcrypto is installed in `extensions`.

## Discovery quotas

- `supabase/migrations/20261114000000_discovery_quotas.sql` adds per-profile daily/cooldown/max-results limits, `api_request_logs`, the admin run-log policy, and the atomic `claim_discovery_run` RPC.
- `drizzle/migrations/0032_discovery_quotas.sql` mirrors it for the Drizzle path.
- Discovery claims quota before calling Places, caps results to the admin maximum, and logs every Google/Geoapify search attempt, including failed retries.
- Rwanda scans use the same request logging and still create `discovery_runs` rows that count toward the daily limit.
- Admin has quota controls per user plus recent API usage.
- This migration is **not applied** to `lfhzponzmkdconaovolq` yet; without it the app uses default limits and request logging is skipped.

## Deployment

- Worker: `https://k-generas-generasdevelops.healthrootrw.workers.dev`
- Deployed version: `e50c0f4d-7552-43f7-b2e7-27d93ed03fd8`
- Deployed from commit `2065887` (`feat: add access-code recovery and discovery quotas`).
- HTTP 200, title `GARE - Generas Autonomous Revenue Engine`.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set as worker secrets.
- `SUPABASE_SERVICE_ROLE_KEY` is still missing.

## Remaining blocker

Code issuance works through the admin-RLS fallback. Redemption returns `redeem_unavailable` because the RPC is broken and the service-role fallback has no key.

To finish, do one of:

1. In Lovable, open **More → Database → Manage → SQL editor**, paste all of `docs/APPLY_PENDING_MIGRATIONS.sql`, and run it. That file now includes both the access-code function fixes and the discovery quota migration.
2. Or set a valid `SUPABASE_SERVICE_ROLE_KEY` for `lfhzponzmkdconaovolq` on the worker. That fixes redemption but not the quota migration.

Live testing also needs a fresh owner session. All four saved owner refresh tokens in the VS Code browser LevelDB were invalid (`400 Invalid Refresh Token`).

## Verification already done

- `npx tsc --noEmit` clean.
- Targeted access-code/quota tests: 13 passed.
- Full suite: 496 passed, 1 skipped.
- Touched-file ESLint and Prettier clean.
- `npm run build` succeeded.
- Worker deployed and returns HTTP 200.
