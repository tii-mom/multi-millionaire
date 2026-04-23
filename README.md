# Project 72H / Millionaire Path

Project 72H is a social lock-up MVP for a 72-hour wave campaign. Users create an account, join a live wave, record an off-chain MVP deposit, form squads, activate referrals, accrue referral reward ledgers, and let admins review risk flags before rewards are claimed.

The current repository is a data-driven MVP baseline. It is not connected to production smart contracts yet.

## Project Positioning

Millionaire Path is the player-facing frontend for Project 72H. The product goal is to make token locking feel like a competitive 72-hour race:

- users lock 72H tokens into a wave,
- squads compete on activated members and locked value,
- referrers earn capped direct rewards from first qualifying locks,
- risk flags can pause suspicious reward claims for review.

Sprint 1 focuses on backend-backed product flows. Sprint 2 is where real contract integration, proof-based reward distribution, and wallet-grade transaction handling should land.

## Directory Structure

```text
.
├── src/                    # Vite React frontend
│   ├── components/          # Shared UI components
│   ├── lib/                 # Frontend API client and shared types
│   └── views/               # App tabs: Deposit, Squad, Rewards, Share
├── server/
│   ├── migrations/          # PostgreSQL schema migrations
│   ├── src/
│   │   ├── controllers/     # Express route handlers
│   │   ├── middlewares/     # Auth and admin guards
│   │   ├── models/          # SQL access helpers
│   │   ├── routes/          # Versioned API routers
│   │   └── types/           # Express request type extensions
│   └── test/                # Jest + supertest API tests
└── docs/                    # Architecture, roadmap, and API overview
```

## Frontend Development

Prerequisites: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

The Vite app runs on `http://localhost:3000`. During development, `/v1/*` is proxied to `VITE_API_TARGET` or `http://localhost:4000` by default.

Useful frontend commands:

```bash
npm run build
npm run lint
```

## Backend Development

Prerequisites: Node.js 18+, npm, and PostgreSQL 13+.

```bash
cd server
npm install
cp .env.example .env
psql "$DATABASE_URL" -f migrations/001_init.sql
psql "$DATABASE_URL" -f migrations/002_squads.sql
psql "$DATABASE_URL" -f migrations/003_rewards.sql
psql "$DATABASE_URL" -f migrations/004_risk.sql
npm run dev
```

The API runs on `http://localhost:4000` by default.

Useful backend commands:

```bash
npm run build
npm test
```

## Environment Variables

Frontend:

- `VITE_API_TARGET`: optional Vite proxy target for `/v1` API requests.

Backend:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: JWT signing secret for email/password auth.
- `PORT`: API port, default `4000`.
- `CHAIN_ID`: display/config value for future chain integration.
- `TOKEN_ADDRESS`: 72H token address placeholder.
- `VAULT_ADDRESS`: future lock contract address.
- `ORACLE_ADDRESS`: future price/oracle contract address.
- `REWARD_DISTRIBUTOR_ADDRESS`: future reward distributor contract address.
- `ADMIN_EMAILS`: comma-separated admin emails for risk review APIs.
- `HIGH_RISK_DEPOSIT_THRESHOLD`: raw token amount threshold for high-value first-lock risk flags.

## Currently Implemented

- Email/password registration and login with JWT.
- App bootstrap with current wave, latest price, and contract placeholders.
- Wave lookup and current wave selection.
- Rush Pass claim through authenticated JWT.
- Deposit precheck.
- Off-chain recorded deposit stub for MVP flow testing.
- Referral confirmation and referral locking on first qualifying deposit.
- Squad creation, joining, and live squad leaderboard data.
- Reward ledger generation for first qualifying referred deposits.
- Reward summary, reward listing, and off-chain claim status update stub.
- Risk flag creation/list/update with an email-based admin guard.
- Automatic risk flags for self-referral attempts, rapid deposit bursts, and high-value first locks.

## Not Yet Implemented

- Real on-chain token lock transactions.
- Real vault/position contract integration.
- Real on-chain reward distribution or Merkle claim publishing.
- Wallet binding and transaction signature verification.
- Production-grade anti-sybil scoring.
- Full admin console UI.
- End-to-end settlement, unlock, and withdrawal flows.

## Development Roadmap

- Sprint 1: data-driven MVP baseline with squads, rewards, risk flags, and documentation.
- Sprint 2: contract-backed deposit flow, reward batch publication, wallet binding, and stronger risk gates.
- Sprint 3: settlement, withdrawals, admin operations, analytics, and production hardening.

See [docs/roadmap.md](docs/roadmap.md) for the detailed sprint plan, [docs/architecture.md](docs/architecture.md) for system structure, and [docs/api-overview.md](docs/api-overview.md) for API coverage.
