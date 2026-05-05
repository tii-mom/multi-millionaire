# Release Checklist

## Pre-Deploy Checklist

- Confirm the target branch is up to date with the staging baseline.
- Run `npm run check:prelaunch` from the repository root. Treat any blocker as
  release-blocking unless a named operator explicitly records why it is safe for
  a non-production diagnostic run.
- Run `npm run audit:release-scope` and resolve every unknown or
  review-required path before creating a release tag.
- Archive `npm run check:prelaunch -- production --json` with the release
  evidence when preparing a release candidate.
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
  - `DEPOSIT_VAULT_ADDRESS` or compatibility `LOCK_VAULT_ADDRESS`
  - `ORACLE_ADDRESS`
  - `REWARD_DISTRIBUTOR_ADDRESS` only when `REWARD_CLAIM_MODEL=distributor`
  - `WALLET_BINDING_ENABLED`
  - `WALLET_BINDING_MESSAGE_DOMAIN`
  - `RECEIPT_VERIFICATION_ENABLED`
  - `CHAIN_RECEIPT_VERIFIER`
  - `DEPOSIT_VAULT_ADDRESS` must be explicit for goal deposits; do not rely on
    the legacy `LOCK_VAULT_ADDRESS` alias for DepositVault payloads.
  - `WALLET_SIGNATURE_MODE`
  - `REWARD_CLAIM_MODEL=merkle`
  - `MERKLE_CLAIM_VERIFIER`
  - `DEPOSIT_VAULT_JETTON_WALLET_ADDRESS` or compatibility `LOCK_VAULT_JETTON_WALLET_ADDRESS`
  - `REWARD_JETTON_WALLET_ADDRESS`
  - `CHAIN_MAINLINE_WRITES_ENABLED`
- Confirm `PRODUCTION_PUBLIC_LAUNCH_ENABLED=false` unless real-funds,
  Merkle-claim, anti-sybil, support, and rollback gates are approved.
- Confirm `ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED=true` before any public production
  launch; closed beta may keep public launch disabled and rely on canary
  allowlists/limits.
- Keep `PRODUCTION_PUBLIC_LAUNCH_ENABLED=false` unless an external oracle path has
  been approved; owner staged price remains testnet/canary-only.
- Confirm database connectivity and backup coverage.
- Confirm the frontend build passes.
- Confirm the backend build and test suite pass.
- Confirm no staging-only secrets are checked into the repo.
- Confirm the release branch still states that legacy deposit and reward claim endpoints are off-chain stubs unless the chain receipt/reward claim production gates are explicitly enabled.
- Confirm DepositVault receipt verification has recorded getter evidence for
  `supportedTarget`, `derivedDepositKey`, and `userState` against the exact V3
  contract address configured for the environment.
- Confirm streak reward ledgers are not announced as claimable until a Merkle
  batch/proof rehearsal has been completed for those ledger rows.
- Review `docs/gray-launch-communications.md` before any user-facing
  announcement, poster, screenshot, or support macro is published.

## Migration Order

Run migrations strictly in numeric order:

1. `server/migrations/001_init.sql`
2. `server/migrations/002_squads.sql`
3. `server/migrations/003_rewards.sql`
4. `server/migrations/004_risk.sql`
5. `server/migrations/005_production_chain_ops.sql`
6. `server/migrations/006_merkle_rewards.sql`
7. `server/migrations/007_deposit_streaks.sql`

Use `npm run migrate:up` for normal rollout. Use `npm run migrate:reset` only in local or staging environments.

For `007_deposit_streaks.sql`, validate staging first:

- backup or disposable staging branch is available before the migration,
- one active streak goal per user is enforced,
- duplicate streak reward `source_ref` entries are idempotent,
- exhausted reward pool does not mark a weekly/monthly streak complete,
- 7-day and 30-day simulated streak ledgers can be drafted into a Merkle batch
  before any user-facing claimable status is shown.

## Staging Mutating Smoke Checklist

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
- `GET /v1/admin/controls`
- `PATCH /v1/admin/controls/:key`
- `GET /v1/admin/audit-logs`
- `GET /v1/admin/chain-events?apply_status=applied`
- `GET /v1/admin/ops`
- `GET /v1/admin/merkle/batches`
- `POST /v1/admin/merkle/batches/draft`
- `GET /v1/admin/merkle/proofs`

Expected staging outcome:

- deposits remain off-chain recorded stubs,
- reward claims remain off-chain status updates,
- risk flags can block or release reward claims,
- squad activation still follows qualifying deposits.
- emergency controls can be toggled and restored by an admin operator,
- control changes create admin audit log entries,
- chain event, wallet signature, Merkle claim, contract config, and receipt
  verifier diagnostics are visible to admins.
- Merkle draft batch/proof generation is visible to admins, and claim receipt
  submission remains fail-closed until the real chain verifier is configured.

## Production GET-Only Smoke Checklist

Production smoke must stay non-mutating by default. The infrastructure canary
profile is limited to:

- `GET /health`
- `GET /ready`
- `GET /v1/app/bootstrap`

The restricted gray-launch profile also requires:

- `GET /v1/waves/current`
- `GET /v1/season-war/current`

Run the gray profile only after production active/upcoming wave and Season War
data are configured.

Do not run the staging mutating smoke, admin control toggles, reward claims,
deposits, risk mutations, or Merkle draft creation against production unless a
named operator, canary account, amount, and rollback window have been approved.

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
- Admin control, audit-log, chain-event, and ops diagnostic endpoints are
  reachable by admins and rejected for non-admins.
- Squad activation, reward generation, and claim blocking still work as expected.

## Required Operator Evidence

For the next staging release record, capture:

- smoke run id
- commit SHA
- control key toggled
- restored control state
- audit log id/action for the control update
- chain-events query result count and `apply_status` filter used
- `/v1/admin/ops` receipt verifier mode/status
- `/v1/admin/ops` wallet signature verifier, Merkle claim verifier, and
  contract integration diagnostic status
- latest Merkle batch id/root/proof count, if reward claim rehearsal is in scope
- DepositVault V3 ABI/getter source path, configured vault address, and one
  testnet receipt apply result that proves `supportedTarget`,
  `derivedDepositKey`, and `userState` agreed with the submitted receipt
- streak reward rehearsal ledger ids, Merkle batch id/root, and claim proof
  status for both 7-day and 30-day reward types when streak rewards are in
  scope
- confirmation that production smoke remained GET-only unless a separate
  mutating canary approval was recorded

## Sprint 1 / Sprint 2 Boundary

Sprint 1 owns the data-driven MVP baseline only.

Still not implemented in Sprint 1:

- real on-chain deposit locking,
- real reward distribution,
- on-chain reward claim verification,
- production wallet signature verification,
- production chain receipt verification beyond tested DepositVault/LockVault
  getter verification and approved canary evidence,
- chain event ingestion beyond receipt submission/database apply scaffolding.

Sprint 2 is where those chain-backed paths should be connected.
