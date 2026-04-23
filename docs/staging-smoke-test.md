# Staging Smoke Test

## RC1 Cloud Staging Preflight

- Attempt date: 2026-04-23
- Current main: `576f94b5cb5be3bc9a9b06875c8d1b3289e36dad`
- Backend Vercel project: `multi-millionaire-api-staging`
- Backend project ID: `prj_YygiIoNfVrCIPAgo8niV981tDypb`
- Backend deployment config: prepared through `server/api/index.ts` and `server/vercel.json`
- Frontend project: `dist`
- Frontend preview access strategy: keep Vercel Authentication enabled for now.

RC1 cloud staging is blocked before deployment because the Vercel Neon
Marketplace integration requires terms acceptance before a Postgres resource can
be provisioned. No persistent cloud database was created, no cloud migrations
were executed, and no real cloud staging smoke test was run.

Required manual action:

1. Accept Neon Marketplace terms for team `348421501-qqcoms-projects`:
   `https://vercel.com/348421501-qqcoms-projects/~/integrations/accept-terms/neon?source=cli`
2. Retry Neon provisioning from `server/`:
   `npm exec --yes vercel -- install neon --name multi-millionaire-staging-db -m region=iad1 -m auth=false -e preview --scope 348421501-qqcoms-projects --format json`
3. Pull env vars, run migrations and seed against the cloud `DATABASE_URL`, deploy backend, rebuild frontend with `VITE_API_BASE_URL` pointing to the backend URL, then rerun the full smoke test.

## RC0 Environment

- Repository: `tii-mom/multi-millionaire`
- Release marker: `staging-rc0-20260423`
- Commit: `2ae4ee61ec71f18dd1bac2bb4dd8f800804f360c`
- Frontend staging preview: `https://dist-8fikii6do-348421501-qqcoms-projects.vercel.app`
- Frontend deployment ID: `dpl_AeKNDvNeN6mrJ4Z21d7zPgx2ZcNv`
- Backend smoke URL: `http://127.0.0.1:4100`
- Database: local PostgreSQL on port `5432`
- Database name: `mm_staging_rc0`
- Runtime: `NODE_ENV=staging`
- High-risk threshold for this run: `5000`

The Vercel frontend preview was deployed successfully and reported `Ready`, but
the team project has Vercel Authentication enabled. Unauthenticated requests to
the preview URL return `401`. The full API smoke test was therefore executed
against the staging backend URL above.

## Migration Result

Migrations were applied in strict numeric order through `npm run migrate:up`:

1. `server/migrations/001_init.sql`
2. `server/migrations/002_squads.sql`
3. `server/migrations/003_rewards.sql`
4. `server/migrations/004_risk.sql`

Verification from `schema_migrations`:

- `001_init.sql`
- `002_squads.sql`
- `003_rewards.sql`
- `004_risk.sql`

Seed result:

- `npm run seed:dev` completed successfully.
- Seeded users: `admin@example.com`, `member@example.com`, `risk@example.com`.
- Baseline seed counts: `users=3`, `waves=1`, `price_rounds=1`.

## Smoke Test Accounts

- Captain: `rc0-captain-1776947153866@example.com`
- Member: `rc0-member-1776947153866@example.com`
- Risk member: `rc0-risk-1776947153866@example.com`
- Admin: `admin@example.com`

## Smoke Test Steps

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Health check | `200`, service status `ok` | `200`, status `ok` | Pass |
| Readiness check | `200`, database status `ok` | `200`, status `ready`, database `ok` | Pass |
| Register | `201` and JWT returned | Captain/member/risk users registered with `201` | Pass |
| Login | `200` and JWT returned | Captain and admin login returned `200` | Pass |
| Claim pass | `200` and pass record returned | Captain claimed wave `1` pass | Pass |
| Create squad | `201`, creator becomes captain | `201`, `squadId=1`, captain member row created | Pass |
| Join squad | `201` and membership created | Member joined squad `1` as `joined_pending` | Pass |
| Confirm referral | `200`, member bound to captain inviter | Member referral saved as `pending` | Pass |
| Deposit precheck | `200`, wave live and price available | `200`, `ok=true` | Pass |
| Deposit | `201`, off-chain position recorded | `201`, amount `1000`, qualifying position recorded | Pass |
| Squad activation | Joined member becomes activated after qualifying deposit | Squad leaderboard showed `activated_member_count >= 1`, `total_locked=1000` | Pass |
| Referral reward generate | Approved direct referral reward appears for captain | Approved ledger created with `final_amount=10` | Pass |
| Reward summary/list | Approved reward visible | Summary `approved_amount=10`; approved list returned one ledger | Pass |
| Reward claim | `200`, reward status becomes `claimed` | First reward claimed successfully | Pass |
| Risk flag trigger | High-value qualifying first lock creates risk flag | Risk member deposit `10000` created `high_value_first_lock` flag | Pass |
| Risk block | Open risk blocks related reward claim | Claim returned `409` with `RISK_REVIEW_REQUIRED` | Pass |
| Risk resolve | Admin resolves flag | `PATCH /v1/risk/flags/:id` returned status `resolved` | Pass |
| Claim again | Claim allowed after risk resolution | Blocked reward claimed successfully; final claimed amount `110` | Pass |

## Result IDs

- Squad: `1`
- First reward ledger: `ae8401d9-cf82-471f-bdfb-8b90da353a13`
- Risk-blocked reward ledger: `d8daedd7-e66e-4bbc-8b52-1a3fca9651ac`
- High-value risk flag: `16aa57ff-c01d-4dc1-9bf1-7f07c131bca5`

## Problem Record

1. The frontend preview deployment is protected by Vercel Authentication.
   - Impact: unauthenticated browser/curl access to the preview URL returns `401`.
   - Result: deployment status is `Ready`; API smoke was completed against the staging backend URL.

2. The Codex fallback deployment endpoint no longer returns claimable preview URLs.
   - Impact: fallback script returned guidance to use the Vercel CLI instead of a preview URL.
   - Result: deployed with authenticated Vercel CLI and explicit `--target preview`.

## Boundary Notes

- No real chain lock occurred in this smoke run.
- `POST /v1/waves/:waveId/deposit` remains an off-chain recorded deposit stub.
- `POST /v1/rewards/:ledgerId/claim` remains an off-chain status update stub.
- Risk blocking and release are verified through `risk_flags` state, not on-chain settlement.
