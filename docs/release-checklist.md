# Release Checklist

## Pre-Deploy Checklist

- Confirm the target branch is up to date with the staging baseline.
- Confirm environment variables are set:
  - `NODE_ENV`
  - `PORT`
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `ADMIN_EMAILS`
  - `HIGH_RISK_DEPOSIT_THRESHOLD`
  - `CORS_ALLOWED_ORIGINS`
  - `CHAIN_ID`
  - `CHAIN_RPC_URL` or compatibility `RPC_URL`
  - `TOKEN_ADDRESS`
  - `LOCK_VAULT_ADDRESS`
  - `ORACLE_ADDRESS`
  - `REWARD_DISTRIBUTOR_ADDRESS`
  - `WALLET_BINDING_ENABLED`
  - `WALLET_BINDING_MESSAGE_DOMAIN`
  - `RECEIPT_VERIFICATION_ENABLED`
  - `CHAIN_RECEIPT_VERIFIER`
  - `CHAIN_MAINLINE_WRITES_ENABLED`
- Confirm database connectivity and backup coverage.
- Confirm the frontend build passes.
- Confirm the backend build and test suite pass.
- Confirm no staging-only secrets are checked into the repo.
- Confirm the release branch still states that legacy deposit and reward claim endpoints are off-chain stubs unless the chain receipt/reward claim production gates are explicitly enabled.

## Migration Order

Run migrations strictly in numeric order:

1. `server/migrations/001_init.sql`
2. `server/migrations/002_squads.sql`
3. `server/migrations/003_rewards.sql`
4. `server/migrations/004_risk.sql`
5. `server/migrations/005_production_chain_ops.sql`

Use `npm run migrate:up` for normal rollout. Use `npm run migrate:reset` only in local or staging environments.

## Smoke Test Checklist

- `GET /health`
- `GET /ready`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/waves/:waveId/passes`
- `POST /v1/waves/:waveId/deposit-precheck`
- `POST /v1/waves/:waveId/deposit`
- `POST /v1/waves/:waveId/squads`
- `POST /v1/waves/:waveId/squads/:squadId/join`
- `GET /v1/rewards/summary`
- `GET /v1/rewards?status=approved`
- `POST /v1/rewards/:ledgerId/claim`
- `GET /v1/risk/flags`
- `POST /v1/risk/flags`
- `PATCH /v1/risk/flags/:flagId`

Expected staging outcome:

- deposits remain off-chain recorded stubs,
- reward claims remain off-chain status updates,
- risk flags can block or release reward claims,
- squad activation still follows qualifying deposits.

## Rollback Plan

- If the release is still in pre-cutover staging, stop the deploy and restore the previous build.
- If migrations have not been consumed by production traffic, restore from the latest database snapshot and rerun the previous app version.
- If a database migration fails during staging validation, use `npm run migrate:reset` only in local or staging and reapply the migrations cleanly.
- There are no down migrations in Sprint 1, so production rollback should rely on snapshot restore and app rollback rather than reverse SQL.

## Post-Deploy Observation Points

- `GET /health` returns `200`.
- `GET /ready` returns `200`.
- Backend logs show request and error lines.
- Database logs show query failures, if any.
- Auth requests stay within rate limits.
- Deposit requests stay within rate limits.
- Admin risk endpoints stay within rate limits.
- Squad activation, reward generation, and claim blocking still work as expected.

## Sprint 1 / Sprint 2 Boundary

Sprint 1 owns the data-driven MVP baseline only.

Still not implemented in Sprint 1:

- real on-chain deposit locking,
- real reward distribution,
- on-chain reward claim verification,
- production wallet signature verification,
- real chain receipt verification beyond fail-closed/test verifier mode,
- chain event ingestion beyond receipt submission/database apply scaffolding.

Sprint 2 is where those chain-backed paths should be connected.
