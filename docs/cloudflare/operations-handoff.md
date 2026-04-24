# Cloudflare Operations Handoff

Date: 2026-04-24

## Current State

Cloudflare staging is ready for sustainable RC1 acceptance.

- backend URL:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- frontend URL:
  `https://staging.multi-millionaire-staging.pages.dev`
- frontend `GET /`: `200`
- backend `GET /health`: `200`
- backend `GET /ready`: `200`
- readiness database status: `ok`
- historical smoke `cf-20260424-rc1-final`: `pass`
- current complete smoke `cf-20260424-neon-rc1`: `pass`
- Neon Postgres origin: provisioned, initialized, and live through Hyperdrive
- Hyperdrive cutover to Neon: complete

## Data Plane

Current data path:

`Worker -> Hyperdrive -> Neon Postgres`

Current Cloudflare resources:

- Worker: `multi-millionaire-api-staging`
- Hyperdrive binding: `HYPERDRIVE`
- Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive name: `rc1-staging-postgres`
- Hyperdrive origin host:
  `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- Hyperdrive origin database: `neondb`
- Hyperdrive origin user: `neondb_owner`
- Hyperdrive origin service id: none
- Hyperdrive SSL mode: `require`
- Hyperdrive caching: `disabled`
- Hyperdrive origin connection limit: `20`

The Worker has no `DATABASE_URL` binding. Database access is through the
Hyperdrive binding only.

Prepared Neon origin:

- project: `dry-art-24207577`
- branch: `br-curly-mud-an2nh595`
- database: `neondb`
- role: `neondb_owner`
- direct host: `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- connection mode: direct/unpooled, `sslmode=require`
- `DATABASE_URL`: not stored in git, docs, PR text, or Worker vars

The previous route through Workers VPC Service, Cloudflare Tunnel, and local
Postgres is no longer the live RC1 staging data plane.

## Neon Database State

- migrations `001_init.sql`, `002_squads.sql`, `003_rewards.sql`, and
  `004_risk.sql`: applied
- `npm run seed:dev`: completed against Neon
- verified users: `admin@example.com`, `member@example.com`, `risk@example.com`
- active wave: present
- confirmed price round: present

## Smoke Evidence

Full Cloudflare smoke was rerun against the deployed backend:

```bash
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=cf-20260424-neon-rc1 \
npm run smoke
```

Result:

- status: `pass`
- started at: `2026-04-24T02:27:44.918Z`
- finished at: `2026-04-24T02:27:59.983Z`
- duration: `15065ms`

Covered flows: register, login, claim pass, create squad, join squad,
deposit-precheck, deposit, squad activation, referral reward generation, reward
summary/list, reward claim, risk trigger, risk block, risk resolve, and claim
retry after risk resolve.

## RC1 Boundary

- Current internal RC1 candidate: `yes`
- Current sustainable RC1 environment: `yes`
- Reason: live Cloudflare readiness is healthy, the database plane uses managed
  Neon Postgres through Hyperdrive, and the full Cloudflare smoke passed on the
  current live staging environment.

Deposit and reward claim remain off-chain stubs. No D1 migration or Sprint 2
chain work is part of this handoff.

Cloudflare API tokens and the Neon `DATABASE_URL` were not written to repository
files, documentation, or commits.
