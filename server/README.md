# Project 72H API Server

This is the Express + TypeScript API for the Project 72H / Millionaire Path MVP. It stores wave, pass, deposit, referral, squad, reward, and risk-review data in PostgreSQL.

## Current Contract Status

The current backend separates the production-chain path from staging MVP stubs.

- `POST /v1/waves/:waveId/deposit-receipt` is the production-chain deposit path. It requires receipt verification, wallet ownership resolution, duplicate chain-event protection, and transactional position application.
- `POST /v1/rewards/:ledgerId/claim-receipt` is the production-chain reward confirmation path for Merkle claims.
- `POST /v1/waves/:waveId/staging-mvp/deposit` is an off-chain recorded deposit stub for staging/demo runtimes. The legacy `/deposit` path remains only as a compatibility alias.
- `POST /v1/rewards/:ledgerId/staging-mvp/claim` is an off-chain reward claim stub for staging/demo runtimes. The legacy `/claim` path remains only as a compatibility alias.
- Oracle, distributor, and indexer resources are future-disabled unless explicitly enabled by config.

Do not represent staging MVP deposits or reward claims as real on-chain locks or real token transfers. Production chain runtimes fail closed on the off-chain stubs.

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
- `waves`: wave lookup, pass claim, deposit precheck, staging MVP deposit recording, and production deposit receipt application.
- `referrals`: inviter binding before first qualifying deposit.
- `prices`: latest confirmed price.
- `squads`: squad creation, membership, and leaderboard data.
- `rewards`: reward summaries, ledgers, staging MVP claim stub, Merkle proof data, and production claim receipt application.
- `risk`: admin risk flag review APIs.

## Known MVP Limits

- Wallet binding and signature verification are gated by runtime config.
- No production admin UI.
- Real chain transaction validation requires receipt/Merkle verifier configuration.
- No on-chain reward transfer.
- Risk rules are intentionally simple and should be treated as review gates, not complete fraud detection.
