# Production Launch Runbook

This runbook tracks the work required before RC1 can become a real chain-backed
production launch.

## Release Baseline

- Start from the RC1 release tag: `rc1-cloudflare-neon-20260424`.
- Keep staging available for closed beta and chain integration regression.
- Create production resources separately from staging:
  - Cloudflare Worker
  - Cloudflare Pages project
  - Hyperdrive config
  - Neon Postgres database/branch
  - secrets and admin accounts

Do not reuse staging seed users, staging database data, test admin emails, or
test risk thresholds in production.

## Production Resource Checklist

- Cloudflare Worker/API service for production, with production routes only.
  Current status: `server/wrangler.jsonc` defines
  `multi-millionaire-api-production`; production deploy completed on
  2026-04-25 with version id `574b636e-49d6-40c2-8412-651df4a4c4`.
  Production API URL:
  `https://api.mm.72h.lol`. Fallback Worker URL:
  `https://multi-millionaire-api-production.348421501.workers.dev`.
- Cloudflare Pages project or production frontend deployment, with production
  API origin configured. Current status: Pages project
  `multi-millionaire-production` exists; custom domain `mm.72h.lol` is still
  pending because the current token cannot create DNS records. Production Pages
  deployment completed with `VITE_API_BASE_URL=https://api.mm.72h.lol`:
  `https://production.multi-millionaire-production.pages.dev`; deployment URL:
  `https://29f929d8.multi-millionaire-production.pages.dev`.
- Hyperdrive config or direct database connection for the production API.
  Current status: production Hyperdrive
  `multi-millionaire-production-postgres` exists with id
  `92267e746955420d80eb707f4cf23e17`.
- Neon production project/branch/database, with backups and point-in-time
  restore enabled before traffic. Current status: production migrations ran
  successfully against the supplied Neon production connection string.
- Production database migrations applied through the current migration set.
- Production secrets in the deployment platform: database URL, JWT secret,
  admin email allowlist, CORS origins, chain feature flags, and provider
  endpoints. Do not store secret values in this repository.
- Production admin accounts provisioned deliberately; do not run dev seed in
  production.
- DNS records, TLS certificates, cache rules, rate limits, and WAF/firewall
  rules for the public domains. Current status: the current API token can deploy
  Workers/Pages, list Hyperdrive, and attach `api.mm.72h.lol`. Direct DNS
  record reads/writes still return authentication errors, so `mm.72h.lol`
  cannot activate until the required DNS CNAME is created. Zone-level Worker
  route creation for `api.72h.lol/*` also returned an authentication error;
  `api.72h.lol` is already assigned to another Worker.
- Log drain or observability sink for API logs, deploy events, and audit events.
- Incident contacts and escalation channel for release lead, backend, frontend,
  database, chain/contracts, and customer support.

## Required Production Gates

- Current production deployment is an infrastructure canary, not a real
  chain-backed launch. Chain writes, wallet binding, receipt verification,
  indexer, and read-only chain integration are all disabled.
- `ADMIN_OPERATIONS_ENABLED=false` and `RISK_REVIEW_ENABLED=false` are the
  intended no-manual-review production posture. This removes admin/risk review
  from the product path; it does not make undeployed contracts or unverified
  receipts safe to use.
- `CHAIN_MAINLINE_WRITES_ENABLED=false` until wallet binding, receipt
  verification, chain event ingest, reward claim verification, and emergency
  controls are all validated on staging.
- `CHAIN_RECEIPT_VERIFIER` must remain `disabled` or unset for production until
  mainnet LockVault/MerkleClaim addresses, RPC, wallet binding, and receipt
  parsing are validated against a small approved mainnet canary. The `test`
  verifier is for local/staging-only controlled rehearsals.
- Production deposits must use `POST /v1/waves/:waveId/deposit-receipt`; the
  legacy `POST /v1/waves/:waveId/deposit` endpoint is an off-chain staging
  stub and fails closed when mainline chain writes are required.
- Production reward claims must be chain-backed or proof-backed; the legacy
  claim endpoint fails closed when mainline chain writes are required.
- Limited gray launch uses Merkle Claim by default. Admins may create draft
  Merkle batches from approved, risk-clear reward ledgers; user claim status
  must follow verified claim events, not client-submitted status.
- `pause_deposits`, `pause_reward_claims`, and `pause_referral_rewards` must be
  usable before public launch.

## Non-Mutating Production Smoke

Run only non-mutating checks by default. From `server/`:

```bash
API_BASE_URL="https://api.example.com" npm run smoke:production
```

This script only sends `GET` requests to:

```bash
curl -fsS "$API_BASE_URL/health"
curl -fsS "$API_BASE_URL/ready"
curl -fsS "$API_BASE_URL/v1/app/bootstrap"
curl -fsS "$API_BASE_URL/v1/waves/current"
```

It does not register users, create passes, join squads, submit deposits, claim
rewards, or call admin endpoints. Keep the JSON output with the release marker
and commit SHA.

Latest evidence:

- Date: 2026-04-25
- API base URL: `https://api.mm.72h.lol`
- Mode: `production-non-mutating`
- Result: `pass`
- Checked paths: `/health`, `/ready`, `/v1/app/bootstrap`,
  `/v1/waves/current`
- Readiness result: `200`, `database=ok`
- Current wave result: `200`, wave `1`, status `live`

## Testnet Chain Canary Evidence

Latest testnet evidence is recorded in
`docs/contracts/testnet-deployment-20260424.md`.

- Date: 2026-04-25
- Network: `ton-testnet`
- Testnet LockVault:
  `kQDh7ZqTP9y3zryvqfYGxSFN2ePIB8bo1xFy4M_BX3L2uVb9`
- Testnet MerkleClaim:
  `kQDJUBxBPTZGQjuz0MBzyyT4E9MDkgdXoPlqtz-zq4RDYpjF`
- Verified deposit receipt tx:
  `PeM9BAhtQjYqOtRjuvniVhqQkETeTLTHmOLv1YmLQt8=`
- Testnet deposit position id:
  `9545445453761711350029784004168846980214745002146771544146829047662825645999`
- Contract getter evidence: `depositCount=1`, `totalDepositedRaw=1`,
  `totalActiveRaw=1`, position status `active`.
- Backend direct deposit verifier: `passed` with Toncenter v3 transactions API.
- Backend deposit database apply: pending. It is not launch evidence until
  `RUN_RECEIPT_APPLY_INTEGRATION=true` passes against a safe isolated test
  database.
- Verified Merkle claim receipt tx:
  `XYvh+RnvK2zA1QkMKeyxUV2C7rkllE026yMQmm6XLec=`
- Testnet Merkle claim batch id: `1777101812106`
- Contract getter evidence: `claimCount=1`, `totalClaimedRaw=1`,
  ledger status `claimed`.
- Backend direct claim verifier: `passed` with Toncenter v3 transactions API.
- Backend claim database apply: pending. It is not launch evidence until
  `RUN_RECEIPT_APPLY_INTEGRATION=true` passes against a safe isolated test
  database.

This proves the audit-remediated testnet LockVault can receive a real Jetton
deposit and expose the derived position by getter, and the audit-remediated
MerkleClaim can publish a one-leaf root and complete a claimant-owned testnet
claim. It also proves the latest backend verifiers can parse those receipts
when a transactions API returns execution descriptions. It does not yet prove
database apply against an isolated test database, and it does not authorize
production chain writes or mainnet launch.

Optional database apply harness:

```bash
cd server
NODE_ENV=test \
RUN_RECEIPT_APPLY_INTEGRATION=true \
DATABASE_URL="postgres://.../multi_millionaire_receipt_apply_test" \
npm test -- receiptApply.integration.test.ts
```

The harness is skipped by default. When enabled, it refuses
`NODE_ENV=production` and refuses database names that do not contain `test`,
`integration`, `ci`, or `isolated`. It also refuses remote database hosts unless
`ALLOW_REMOTE_RECEIPT_APPLY_INTEGRATION_DB=true` is set for a throwaway
non-production database. Use only a migrated throwaway database.

## Canary SOP

1. Confirm production resources, secrets, migrations, DNS, TLS, logging, and
   rollback ownership are ready.
2. Confirm `CHAIN_MAINLINE_WRITES_ENABLED=false` unless the chain verifier,
   contract ABI, RPC provider, wallet binding, receipt ingest, Merkle proof
   generation, claim-event verification, and emergency pause controls have all
   passed staging.
3. Deploy the API to production with public traffic disabled or routed to an
   internal canary route when supported by the hosting platform.
4. Run `API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production`.
   Stop the canary if any step fails.
5. Enable a small traffic slice or restricted operator access. Watch health,
   readiness, latency, error rate, database pool usage, and audit logs for at
   least 15 minutes.
6. If a mutating production canary is approved, use a named operator, a
   documented wallet/account, a documented small amount, and a rollback owner.
   Record transaction hashes, user IDs, position IDs, reward ledger IDs, and
   timestamps. Do not use the default production smoke for this.
7. Promote traffic only after the non-mutating smoke passes and the canary
   window has no unresolved alerts.
8. Roll back or pause immediately if readiness fails, error rate rises above
   the alert threshold, database saturation appears, chain verification is
   inconsistent, or funds/accounting state cannot be reconciled.

Any production canary that submits a transaction or mutates application state
requires an approved operator, documented account, documented amount, and an
incident rollback owner.

## Mainnet Contract Deployment

Mainnet contract deployment uses Blueprint with TonConnect. The connected
Tonkeeper wallet must match `CHAIN_ADMIN_ADDRESS`; the scripts refuse to deploy
if a different wallet is connected.

Required environment:

```bash
export CHAIN_ADMIN_ADDRESS="UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq"
export TOKEN_ADDRESS="EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8"
```

Deploy with Tonkeeper confirmation:

```bash
export CHAIN_ID=ton-mainnet
export CHAIN_ADMIN_ADDRESS=UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq
export TOKEN_ADDRESS=EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8
npm run contract:build
npm run contract:derive:mainnet
npm run contract:deploy:lock-vault:mainnet
npm run contract:deploy:merkle-claim:mainnet
```

Precomputed mainnet addresses from `contract:derive:mainnet` on 2026-04-25:

- LockVault: `EQDrBbGqXv_LnY_kSzJXP9bB0n0dnMlCklkerG8WdKHGJX4z`
- MerkleClaim: `EQCf97B3-PdVVndsi_nhVrmK-gFUzK_H2uCO5zk_umYQyLEd`
- owner/admin wallet: `EQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQamv`
- 72H token master: `EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8`

The deploy command reaches the Tonkeeper QR/link step locally. Deployment is not
complete until the admin wallet confirms each transaction and the scripts print
successful deploy evidence. Jetton wallet derivation for the supplied 72H token
returned TON get-method `exit_code=-13`; confirm the token's Jetton getter
compatibility before enabling production deposits.

### Mainnet Deployment Evidence Template

Mainnet deployment is not complete until this template is filled with actual
deployment output and linked evidence. Do not replace derived addresses with
production config until each value is verified from chain/provider output.

- Deployment timestamp:
- Network/chain id: `ton-mainnet`
- RPC/provider endpoint and account/project:
- Deployer/admin wallet:
- LockVault deployment tx hash:
- LockVault deployment LT:
- LockVault block time:
- Actual LockVault address:
- MerkleClaim deployment tx hash:
- MerkleClaim deployment LT:
- MerkleClaim block time:
- Actual MerkleClaim address:
- 72H token master address:
- LockVault Jetton wallet derivation:
- MerkleClaim Jetton wallet derivation:
- Getter verification:
  - LockVault owner:
  - LockVault token address:
  - LockVault Jetton wallet:
  - MerkleClaim owner:
  - MerkleClaim token address:
  - MerkleClaim reward Jetton wallet:
- Contract code/build hash:
  - LockVault:
  - MerkleClaim:
- Build command and git commit:
- Script output/evidence path:
- Operator/reviewer signoff:

After deployment:

- record the printed LockVault and MerkleClaim addresses
- update `server/wrangler.jsonc` production `LOCK_VAULT_ADDRESS`
- add the MerkleClaim address to production env as `MERKLE_CLAIM_ADDRESS`
- keep `CHAIN_MAINLINE_WRITES_ENABLED=false` until wallet proof, receipt
  verification, claim verification, and a small canary pass

## Monitoring And Alerts

- `/health` and `/ready` availability, with readiness failure paging the API
  owner.
- HTTP 5xx rate, HTTP 4xx anomaly rate, and p95/p99 latency by route.
- Database connection saturation, query latency, migration drift, backup
  freshness, and restore readiness.
- Authentication failures, admin login failures, and admin audit log events.
- Risk flags created, risk flags stuck in `open` or `reviewing`, and reward
  claims blocked by risk review.
- Deposit receipt submission failures, duplicate receipt/hash attempts, and
  receipt verification failures.
- Reward claim failures, duplicate claim attempts, and claim reconciliation
  mismatches.
- Merkle batch creation, proof counts, claim pending age, and claim-event
  verifier failures.
- Chain RPC latency/error rate, verifier failures, block/event ingest lag, and
  contract event reconciliation gaps.
- Emergency pause changes for deposits, reward claims, referral rewards, and
  maintenance banner.
- Worker/API deploy failures, cold-start or CPU-limit errors, and log drain
  delivery failures.

## Chain Readiness Requirements

Real chain-backed production still requires verified production values for:

- mainnet contract addresses and ABIs that match the production network
- production RPC provider URLs and failover policy
- production smoke for TON Connect proof submission to the backend
  `WALLET_SIGNATURE_MODE=ton_proof` verifier
- finality/confirmation depth and replay protection rules
- frontend TonConnect transaction builders for LockVault Jetton transfer and
  MerkleClaim `ClaimReward`
- reconciliation process between API records, chain events, and reward ledgers

Until those are complete and validated on staging, real funds must remain behind
the production chain gate.

## Emergency Pause

Use admin controls or environment variables:

- `pause_deposits`
- `pause_reward_claims`
- `pause_referral_rewards`
- `maintenance_banner`

Environment variable overrides:

- `PAUSE_DEPOSITS=true`
- `PAUSE_REWARD_CLAIMS=true`
- `PAUSE_REFERRAL_REWARDS=true`

Every admin control change should create an audit log entry.

## Incident Owner

Before launch, assign named owners for:

- release lead
- backend/API owner
- frontend owner
- chain/contracts owner
- database owner
- customer support owner

No production launch should proceed without an owner for rollback and public
status communication.
