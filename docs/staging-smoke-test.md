# Staging Smoke Test

## Current Cloudflare RC1 Evidence

- Repository: `tii-mom/multi-millionaire`
- Date: `2026-04-24`
- Backend staging URL: `https://multi-millionaire-api-staging.348421501.workers.dev`
- Frontend staging URL: `https://staging.multi-millionaire-staging.pages.dev`
- Database route: `Hyperdrive -> Neon Postgres`
- Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive name: `rc1-staging-postgres`
- Hyperdrive origin host:
  `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- Hyperdrive caching: `disabled`
- Smoke run id: `cf-20260424-neon-rc1`
- Smoke status: `pass`
- Runtime: `NODE_ENV=staging`
- High-risk threshold used in smoke: `1000000`

The current smoke supersedes the earlier historical
`cf-20260424-rc1-final` smoke because it ran after the live data plane moved
from the local tunnel-backed origin to Neon Postgres.

## Current Live Smoke Status

As of `2026-04-24`, the current live backend is smokeable and healthy:

- `GET /health`: `200`
- `GET /ready`: `200`
- readiness database status: `ok`
- frontend `GET /`: `200`
- Hyperdrive origin: Neon direct/unpooled Postgres, `sslmode=require`
- local Postgres plus Cloudflare Tunnel dependency: none
- current complete Cloudflare smoke: pass

Cloudflare API tokens and the Neon `DATABASE_URL` were not written to
repository files, documentation, or commits.

## Real Cloudflare Smoke Result

Command used:

```bash
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=cf-20260424-neon-rc1 \
npm run smoke
```

Top-level result:

- `status: pass`
- `started_at: 2026-04-24T02:27:44.918Z`
- `finished_at: 2026-04-24T02:27:59.983Z`
- `duration_ms: 15065`

## Real Cloudflare Smoke Steps

| Step | Actual Result | Status |
| --- | --- | --- |
| Health check | `GET /health` returned `200`, `status=ok` | Pass |
| Readiness check | `GET /ready` returned `200`, `status=ready`, `database=ok` | Pass |
| Register | Captain/member/risk users registered | Pass |
| Login | Captain and admin login returned `200` | Pass |
| Claim pass | Captain claimed wave `1` pass | Pass |
| Create squad | `201`, `squad_id=1`, initial squad status `open` | Pass |
| Join squad | Member joined squad as `joined_pending` | Pass |
| Confirm referral | Member referral saved as `pending` | Pass |
| Deposit precheck | `200`, `ok=true`, wave status `live` | Pass |
| Deposit | `201`, qualifying position `2c9ac27b-c64a-4c74-97d6-df9a0b6e823d` created | Pass |
| Squad activation | Verified through the qualifying deposit path and downstream reward availability | Pass |
| Referral reward generate | Verified by approved reward ledger `26d65278-c9d0-413f-9655-0a45869b6e48` | Pass |
| Reward summary/list | Summary returned `approved_amount=10`; approved reward list contained the new ledger | Pass |
| Reward claim | First reward claim returned `200`, status became `claimed` | Pass |
| Risk trigger | High-value deposit `2000000` created risk position `eb1281d5-ca40-4a38-abc3-a05278fa6eac` | Pass |
| Risk block | Claim returned `409` with `RISK_REVIEW_REQUIRED` while flag was open | Pass |
| Risk resolve | Admin resolved risk flag `77e56da8-7cad-42ff-8720-fd1d5b78c70b` | Pass |
| Claim retry after risk resolve | Previously blocked reward claim returned `200`, status became `claimed` | Pass |

## Real Cloudflare Smoke IDs

- Wave: `1`
- Squad: `1`
- Standard reward ledger: `26d65278-c9d0-413f-9655-0a45869b6e48`
- Risk position: `eb1281d5-ca40-4a38-abc3-a05278fa6eac`
- Risk flag: `77e56da8-7cad-42ff-8720-fd1d5b78c70b`
- Risk-blocked reward ledger: `43bd5b45-4fc4-4d56-b68a-bba2e693c36d`

## Root Cause Fixed Before This Smoke

The earlier tunnel-backed Cloudflare smoke uncovered a read-after-write issue:

- `register`: pass
- immediate `login`: fail with `401 INVALID_CREDENTIALS`

Root cause:

- Hyperdrive caching was enabled
- register path first queried `findByEmail(email)` and cached the empty result
- immediate login queried the same email and hit that stale empty lookup

Fix retained for the Neon cutover:

- staging Hyperdrive caching remains `disabled`

## RC1 Classification

- Internal RC1 candidate: `yes`
  - reason: the current live backend is healthy and a complete Cloudflare smoke
    passed against the deployed staging backend
- Sustainable RC1 environment: `yes`
  - reason: the current live Hyperdrive origin is Neon Postgres, not local
    Postgres plus Cloudflare Tunnel

## Boundary Notes

- No real chain lock occurred in this smoke.
- `POST /v1/waves/:waveId/deposit` remains an off-chain recorded deposit stub.
- `POST /v1/rewards/:ledgerId/claim` remains an off-chain status update stub.
- Risk blocking and release are verified through `risk_flags` state, not
  on-chain settlement.
