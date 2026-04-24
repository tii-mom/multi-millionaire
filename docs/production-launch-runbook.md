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
  2026-04-24 with version id `749a7f55-10c6-4559-b343-266aa55afb4e`.
  Production API URL:
  `https://multi-millionaire-api-production.348421501.workers.dev`.
- Cloudflare Pages project or production frontend deployment, with production
  API origin configured. Current status: Pages project
  `multi-millionaire-production` exists; custom domain `mm.72h.lol` has been
  added and is pending Cloudflare verification. Production Pages deployment
  completed with `VITE_API_BASE_URL` pointing to the production Worker:
  `https://production.multi-millionaire-production.pages.dev`.
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
  rules for the public domains. Current status: Cloudflare Pages domain
  `mm.72h.lol` is pending; the current API token can manage Pages domains but
  returned an authentication error for direct DNS record reads.
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

- Date: 2026-04-24
- API base URL: `https://multi-millionaire-api-production.348421501.workers.dev`
- Mode: `production-non-mutating`
- Result: `pass`
- Checked paths: `/health`, `/ready`, `/v1/app/bootstrap`,
  `/v1/waves/current`
- Readiness result: `200`, `database=ok`
- Current wave result: `200`, wave `1`, status `live`

## Testnet Chain Canary Evidence

Latest testnet evidence is recorded in
`docs/contracts/testnet-deployment-20260424.md`.

- Date: 2026-04-24
- Network: `ton-testnet`
- Testnet LockVault:
  `kQDa42BOYHpCwoHQAWkjsmnLMXP9WxFkKjcnt1jCaz-CBae3`
- Testnet MerkleClaim:
  `kQClCNt7vsSq6cDSbFQha6eRcquGoLIpsebxSjC7K7e2gLRH`
- Verified deposit receipt tx:
  `9BJVuUvqZ3KpdtSMwa20JRGm3jyZUZoZ3Z1rU4e9Vcg=`
- Backend local receipt apply: `applied`
- Verified Merkle claim receipt tx:
  `Kidy8e/ZZR9PQHput2wQwkJxUIuhHYrtHY06sAGmK9E=`
- Backend local claim receipt apply: `reward=claimed`,
  `proof=claimed`, `chain_event=applied`

This proves the testnet deposit receipt path can create a backend chain event
and position, and the testnet Merkle claim receipt path can mark the reward and
proof claimed only after chain verification. It does not authorize production
chain writes or mainnet launch.

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
npm run contract:build
npm run contract:deploy:lock-vault:mainnet
npm run contract:deploy:merkle-claim:mainnet
```

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
- frontend TON Connect proof submission to the backend `WALLET_SIGNATURE_MODE=ton_proof`
  verifier
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
