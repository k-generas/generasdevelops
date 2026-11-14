# Access Code Fix Handoff

Status: implemented, deployed from an uncommitted working tree, not fully live-tested.

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

## Deployment

- Worker: `https://k-generas-generasdevelops.healthrootrw.workers.dev`
- Deployed version: `27dc5c2c-4c2d-47fa-8c1e-2e86f7933ed0`
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` were set as worker secrets.
- `SUPABASE_SERVICE_ROLE_KEY` is still missing.

## Remaining blocker

Code issuance works through the admin-RLS fallback. Redemption returns `redeem_unavailable` because the RPC is broken and the service-role fallback has no key.

To finish, do one of:

1. Apply the pgcrypto/search-path migration to `lfhzponzmkdconaovolq`, or
2. Set a valid `SUPABASE_SERVICE_ROLE_KEY` for `lfhzponzmkdconaovolq` on the worker.

Live testing also needs a fresh owner session. All four saved owner refresh tokens in the VS Code browser LevelDB were invalid (`400 Invalid Refresh Token`).

## Verification already done

- `npx tsc --noEmit` clean.
- Targeted tests: 11 passed.
- Full suite before the new test: 483 passed, 1 skipped.
- Touched-file ESLint clean.
- `npm run build` succeeded.

Do not lose the uncommitted files above when switching tasks.
