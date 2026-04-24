# Persistent Staging Database Plan

Date: 2026-04-24

## Current Result

Cloudflare RC1 staging now uses a persistent managed Postgres origin:

`Cloudflare Worker -> Hyperdrive -> Neon Postgres`

The staging data plane no longer depends on local Postgres, Workers VPC Service,
or a local Cloudflare Tunnel.

Current facts:

- backend URL:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- frontend URL:
  `https://staging.multi-millionaire-staging.pages.dev`
- live backend `GET /health`: `200`
- live backend `GET /ready`: `200`
- readiness database status: `ok`
- Worker database binding: `HYPERDRIVE=88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive name: `rc1-staging-postgres`
- Hyperdrive origin host:
  `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- Hyperdrive origin database: `neondb`
- Hyperdrive origin user: `neondb_owner`
- Hyperdrive origin service id: none
- Hyperdrive SSL mode: `require`
- Hyperdrive caching: `disabled`
- Hyperdrive origin connection limit: `20`
- Neon project: `dry-art-24207577`
- Neon branch: `br-curly-mud-an2nh595`
- Neon connection mode: direct/unpooled
- Neon `DATABASE_URL`: not stored in git, docs, or Worker vars

The previous local-origin route through Workers VPC Service and Cloudflare
Tunnel is no longer part of the live RC1 staging data plane.

## Neon Initialization

- migrations `001_init.sql`, `002_squads.sql`, `003_rewards.sql`, and
  `004_risk.sql`: applied on Neon
- `npm run seed:dev`: completed against Neon using the direct/unpooled Neon
  connection string
- verified seed users:
  - `admin@example.com`
  - `member@example.com`
  - `risk@example.com`
- verified active wave count: `1`
- verified confirmed price round count: `1`

## Cloudflare Cutover

The existing Hyperdrive config was patched in place instead of creating a new
Worker binding:

- Hyperdrive id remained `88b8cd7fd84e4064ad29b43a16c579f2`
- Worker binding remained `HYPERDRIVE`
- Hyperdrive name was updated to `rc1-staging-postgres`
- origin was changed from the VPC Service / Tunnel route to the Neon direct
  Postgres host
- caching stayed disabled to preserve auth-critical read-after-write behavior

Cloudflare management credentials and the Neon connection string were not added
to repository files, documentation, or commits.

## Live Validation

Cloudflare live checks after the cutover:

- backend `GET /health`: `200`
- backend `GET /ready`: `200`
- readiness payload: `status=ready`, `database=ok`
- frontend `GET /`: `200`

Full Cloudflare smoke:

- run id: `cf-20260424-neon-rc1`
- status: `pass`
- started at: `2026-04-24T02:27:44.918Z`
- finished at: `2026-04-24T02:27:59.983Z`
- duration: `15065ms`

The smoke covered register, login, claim pass, create squad, join squad,
deposit precheck, deposit, squad activation, referral reward generation, reward
summary/list, reward claim, risk trigger, risk block, risk resolve, and claim
retry after risk resolve.

## Completion Criteria

Sustainable RC1 criteria are now satisfied:

- Hyperdrive origin is Neon direct Postgres and no longer depends on VPC Service
  / Tunnel / local Postgres
- migrations `001_init.sql` through `004_risk.sql` have run on the managed
  origin
- `npm run seed:dev` has run on the managed origin
- live `/health` and `/ready` return `200`
- `/ready` reports `database=ok`
- the complete Cloudflare smoke passes against the live staging backend

Deposit and reward claim remain off-chain stubs for RC1. This plan does not
start D1 migration or Sprint 2 chain work.
