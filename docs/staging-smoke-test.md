# Staging Smoke Test

## Cloudflare RC1 Evidence

- Repository: `tii-mom/multi-millionaire`
- Date: `2026-04-24`
- Backend staging URL: `https://multi-millionaire-api-staging.348421501.workers.dev`
- Frontend staging URL: `https://staging.multi-millionaire-staging.pages.dev`
- Database route: `Hyperdrive -> VPC Service -> Tunnel -> existing local Postgres`
- Smoke run id: `cf-20260424-rc1-final`
- Smoke status: `pass`
- Runtime: `NODE_ENV=staging`
- High-risk threshold used in smoke: `1000000`

This document separates:

1. Real Cloudflare smoke evidence against the deployed Cloudflare backend URL
2. Earlier local rehearsal evidence against the prepared origin database

Only the first one counts as Cloudflare RC1 evidence.

## Real Cloudflare Smoke Result

Command used:

```bash
cd server
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=cf-20260424-rc1-final \
npm run smoke
```

Top-level result:

- `status: pass`
- `started_at: 2026-04-23T16:47:57.134Z`
- `finished_at: 2026-04-23T16:48:16.492Z`
- `duration_ms: 19358`

## Real Cloudflare Smoke Steps

| Step | Actual Result | Status |
| --- | --- | --- |
| Health check | `GET /health` returned `200`, `status=ok` | Pass |
| Readiness check | `GET /ready` returned `200`, `status=ready`, `database=ok` | Pass |
| Register | Captain/member/risk users registered with `201` | Pass |
| Login | Captain and admin login returned `200` | Pass |
| Claim pass | Captain claimed wave `1` pass | Pass |
| Create squad | `201`, `squad_id=2`, initial squad status `open` | Pass |
| Join squad | Member joined squad `2` as `joined_pending` | Pass |
| Confirm referral | Member referral saved as `pending` | Pass |
| Deposit precheck | `200`, `ok=true`, wave status `live` | Pass |
| Deposit | `201`, qualifying position `2417b2a7-8e9a-4422-b95c-a62e47582bee` created | Pass |
| Squad activation | Verified indirectly through the qualifying deposit path completing and the downstream reward path becoming available | Pass |
| Referral reward generate | Verified by approved reward `e10a63d3-11c7-47a5-a8b6-c2b2c31ce477` appearing after the qualifying deposit | Pass |
| Reward summary/list | Summary returned `approved_amount=10`; approved reward list contained the new ledger | Pass |
| Reward claim | First reward claim returned `200`, status became `claimed` | Pass |
| Risk trigger | High-value deposit `2000000` created risk position `f0df2d35-e92a-43e0-887c-0b354dff8716` | Pass |
| Risk block | Claim returned `409` with `RISK_REVIEW_REQUIRED` while flag was open | Pass |
| Risk resolve | Admin resolved risk flag `ded87b81-298b-4d8c-9f4c-e8da207a8730` | Pass |
| Claim retry after risk resolve | Previously blocked reward claim returned `200`, status became `claimed` | Pass |

## Real Cloudflare Smoke IDs

- Wave: `1`
- Pass: `a8960ae2-80b9-4c17-bef9-d232acbdb655`
- Squad: `2`
- Standard reward ledger: `e10a63d3-11c7-47a5-a8b6-c2b2c31ce477`
- Risk position: `f0df2d35-e92a-43e0-887c-0b354dff8716`
- Risk flag: `ded87b81-298b-4d8c-9f4c-e8da207a8730`
- Risk-blocked reward ledger: `6304f74c-2c28-4ab8-8aeb-944fcee523ee`

## Root Cause Fixed During This Thread

The first Cloudflare smoke attempt failed after registration:

- `register`: pass
- immediate `login`: fail with `401 INVALID_CREDENTIALS`

Root cause:

- Hyperdrive caching was enabled
- register path first queried `findByEmail(email)` and cached the empty result
- immediate login queried the same email and hit that stale empty lookup

Fix:

- staging Hyperdrive caching was changed to `disabled`

After that update, login and the rest of the real Cloudflare smoke passed.

## Local Rehearsal Evidence

Before the final Hyperdrive binding, the prepared Postgres origin was also
verified locally. This remains useful evidence but is not counted as the
Cloudflare smoke run:

- local backend URL: `http://127.0.0.1:4100`
- migrations `001 -> 004`: pass
- `seed:dev`: pass
- local smoke result: pass

## RC1 Classification

- Internal RC1 candidate: `yes`
  - reason: real Cloudflare smoke `cf-20260424-rc1-final` passed against the
    deployed Cloudflare backend URL
- Sustainable RC1 environment: `no`
  - reason: the staging database origin still depends on the local PostgreSQL
    process plus the local Cloudflare Tunnel on this machine

## Boundary Notes

- No real chain lock occurred in this smoke.
- `POST /v1/waves/:waveId/deposit` remains an off-chain recorded deposit stub.
- `POST /v1/rewards/:ledgerId/claim` remains an off-chain status update stub.
- Risk blocking and release are verified through `risk_flags` state, not on-chain settlement.
