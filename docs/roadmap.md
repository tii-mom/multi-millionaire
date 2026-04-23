# Roadmap

## Sprint 1: Data-Driven MVP Baseline

Goal: move from frontend demo plus backend baseline to a backend-backed MVP.

Scope:

- Rewrite project documentation for Project 72H / Millionaire Path.
- Add squad schema, squad APIs, and live frontend squad leaderboard.
- Generate direct referral reward ledgers from first qualifying referred deposits.
- Add reward summary, listing, and claim stub APIs.
- Add risk flag schema, admin APIs, and baseline automatic rules.
- Convert pass claim to JWT-based identity.
- Add focused API tests for squads, rewards, and risk behavior.

Known limits:

- Deposits are off-chain recorded stubs.
- Reward claims are off-chain status updates.
- Risk rules are minimal review gates.

## Sprint 2: Contract-Backed Locking And Distribution

Goal: connect MVP flows to real wallet and contract infrastructure.

Scope:

- Wallet binding and signature verification.
- Real vault/lock contract integration.
- Replace fake `onchain_position_id` generation with receipt-derived position IDs.
- Event ingestion or transaction verification for deposits.
- Reward batch creation, Merkle root publication, and distributor integration.
- Claim proof generation and on-chain claim verification.
- Harden deposit/reward idempotency around chain events.

## Sprint 3: Settlement, Admin Operations, And Production Hardening

Goal: make the platform operable beyond the initial MVP.

Scope:

- Wave settlement, unlock, withdrawal, and cancellation flows.
- Admin UI for wave configuration, reward batches, and risk review.
- Better anti-sybil/risk scoring and audit trails.
- Observability, structured logging, metrics, and alerts.
- E2E tests against a local or testnet contract stack.
- Deployment runbooks and production migration strategy.
