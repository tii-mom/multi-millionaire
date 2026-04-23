# Architecture

Project 72H is currently a full-stack MVP with a Vite React frontend, an Express API, and PostgreSQL persistence. The contract layer is represented by configuration placeholders and off-chain stubs until Sprint 2.

## Frontend

The frontend lives in `src/` and is organized around mobile-first app tabs:

- `Home`: account access and deposit flow.
- `Team`: current wave squad list, squad creation, and join actions.
- `Rewards`: reward summary, ledger list, and claim actions.
- `Share`: local sharing/poster experience.

API calls should go through `src/lib/api.ts`; shared response and entity types live in `src/lib/types.ts`.

## Backend

The backend lives in `server/src/`:

- `routes/` maps versioned `/v1` endpoints.
- `controllers/` owns request validation and workflow orchestration.
- `models/` owns SQL queries and persistence details.
- `middlewares/auth.ts` validates JWTs.
- `middlewares/admin.ts` gates admin-only risk endpoints through `ADMIN_EMAILS`.

The API is intentionally modular so squads, rewards, and risk can evolve independently while sharing the same wave, position, referral, and user records.

## Database

PostgreSQL is the system of record for Sprint 1:

- `users`: email/password accounts.
- `waves`: 72-hour campaign windows and reward parameters.
- `price_rounds`: administrator-submitted price snapshots.
- `rush_passes`: one pass per user per wave.
- `positions`: off-chain recorded MVP deposit positions.
- `referrals`: inviter relationships locked by the first qualifying deposit.
- `squads`: wave-scoped squads and captains.
- `squad_members`: one squad membership per user per wave.
- `reward_ledgers`: direct referral reward records.
- `reward_batches`: future batch/Merkle publication records.
- `risk_flags`: review flags for users, positions, and reward ledgers.

Migrations are applied in numeric order from `server/migrations/`.

## Future Contract Layer

Sprint 2 should replace the deposit and reward stubs with contract-backed flows:

- wallet binding and signature verification,
- real vault/lock transaction submission or verification,
- real on-chain position identifiers from transaction receipts,
- reward batch construction with Merkle roots,
- on-chain reward distributor claims,
- reconciliation between chain events and PostgreSQL records.

Until that work is complete, backend deposit and claim endpoints only update database state.

## Data Flow

1. The frontend calls `/v1/app/bootstrap` and `/v1/waves/current`.
2. A user registers or logs in and receives a JWT.
3. The user can confirm an inviter before their first qualifying deposit.
4. The user records an MVP deposit through `/v1/waves/:waveId/deposit`.
5. Deposit side effects activate squad membership and create direct referral reward ledgers when eligible.
6. Risk rules may add flags for suspicious behavior.
7. Approved rewards can be claimed only when no blocking open/reviewing risk flag exists.
