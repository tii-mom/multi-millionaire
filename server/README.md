# Project 72H API Server

This is the Express + TypeScript API for the Project 72H / Millionaire Path MVP. It stores wave, pass, deposit, referral, squad, reward, and risk-review data in PostgreSQL.

## Current Contract Status

The current backend is not connected to real smart contracts.

- `POST /v1/waves/:waveId/deposit` is an off-chain recorded deposit stub. It writes a `positions` row and creates a fake `onchain_position_id` so the MVP can exercise downstream product logic.
- `POST /v1/rewards/:ledgerId/claim` is an off-chain reward claim stub. It only moves a reward ledger from `approved` to `claimed`.
- Reward batches are schema-only in Sprint 1. No Merkle root is published on-chain.
- Real vault, lock, settlement, and reward distributor contracts are planned for Sprint 2.

Do not represent Sprint 1 deposits or reward claims as real on-chain locks or real token transfers.

## Setup

Prerequisites: Node.js 18+, npm, and PostgreSQL 13+.

```bash
npm install
cp .env.example .env
```

Apply migrations in order:

```bash
npm run migrate:up
```

Run locally:

```bash
npm run dev
```

Build and test:

```bash
npm run build
npm test
```

Reset and seed helpers for local or staging use only:

```bash
npm run migrate:reset
npm run seed:dev
```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: JWT signing secret.
- `PORT`: server port, default `4000`.
- `CHAIN_ID`: chain identifier shown by bootstrap.
- `TOKEN_ADDRESS`: 72H token address placeholder.
- `LOCK_VAULT_ADDRESS`: future vault/lock contract address.
- `ORACLE_ADDRESS`: future price oracle contract address.
- `REWARD_DISTRIBUTOR_ADDRESS`: future reward distributor address.
- `CORS_ALLOWED_ORIGINS`: comma-separated allowlist for browser origins.
- `ADMIN_EMAILS`: comma-separated emails allowed to access `/v1/risk/*`.
- `HIGH_RISK_DEPOSIT_THRESHOLD`: raw amount threshold for the `high_value_first_lock` automatic risk flag.

## API Areas

- `app`: bootstrap data for the frontend.
- `auth`: register/login and JWT issuance.
- `waves`: wave lookup, pass claim, deposit precheck, and deposit recording.
- `referrals`: inviter binding before first qualifying deposit.
- `prices`: latest confirmed price.
- `squads`: squad creation, membership, and leaderboard data.
- `rewards`: reward summaries, ledgers, and claim stub.
- `risk`: admin risk flag review APIs.

## Known MVP Limits

- No wallet binding or signature verification.
- No production admin UI.
- No real chain transaction validation.
- No on-chain reward transfer.
- Risk rules are intentionally simple and should be treated as review gates, not complete fraud detection.
