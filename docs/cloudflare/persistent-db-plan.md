# Persistent Staging Database Plan

Date: 2026-04-24

## Current Result

Neon Postgres has been provisioned and initialized for RC1 staging, but
sustainable RC1 is still blocked by Cloudflare management authentication.

Current facts:

- live backend `GET /health`: `200`
- live backend `GET /ready`: `503`
- readiness database status: `error`
- Worker database binding: `HYPERDRIVE=88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive origin: Workers VPC Service
  `019dbb34-5edb-7101-804f-1a62f6a9c105`
- Cloudflare tunnel: `mm-pg-staging`
  `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
- tunnel status: `down`, with no active connections
- current Worker bindings do not include `DATABASE_URL`
- Neon project: `dry-art-24207577`
- Neon branch: `br-curly-mud-an2nh595`
- Neon database: `neondb`
- Neon role: `neondb_owner`
- Neon direct host: `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- Neon connection mode: direct/unpooled, `sslmode=require`
- Neon `DATABASE_URL`: not stored in git, docs, or Worker vars

The Neon origin is ready, but the live Cloudflare data plane still depends on a
local PostgreSQL process plus a local Cloudflare Tunnel because Hyperdrive could
not be updated with the current Cloudflare credentials.

## Completed Neon Initialization

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

## Current Blocker

The remaining blocker is:

`Cloudflare management authentication is invalid, so Hyperdrive cannot be
patched from the VPC Service / Tunnel origin to the Neon direct origin.`

Observed failures:

- `wrangler whoami`: `Invalid access token [code: 9109]`
- `wrangler hyperdrive get`: Cloudflare API authentication failure
- Cloudflare API MCP GET/PATCH calls: `Authentication error [code: 10000]`

## Remaining Cutover Steps After Cloudflare Auth Is Fixed

1. Create or update a staging Hyperdrive config whose origin points at the
   Neon direct host, database, user, password, and SSL settings.
2. Update `server/wrangler.jsonc` staging `HYPERDRIVE` binding only if the
   cutover creates a new Hyperdrive id.
3. Deploy the staging Worker.
4. Confirm live Cloudflare health:

- `GET /health`: `200`
- `GET /ready`: `200`
- readiness database status: `ok`

5. Run the complete Cloudflare smoke against the deployed backend:

```bash
cd server
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=<new-run-id> \
npm run smoke
```

## Completion Criteria

Sustainable RC1 is achieved only when:

- Hyperdrive origin is Neon direct Postgres and no longer depends on VPC Service
  / Tunnel / local Postgres
- migrations `001_init.sql` through `004_risk.sql` have run on the managed
  origin
- `npm run seed:dev` has run on the managed origin
- live `/health` and `/ready` return `200`
- `/ready` reports `database=ok` or equivalent success state
- the complete Cloudflare smoke passes against the live staging backend

Deposit and reward claim remain off-chain stubs for RC1. This plan does not
start D1 migration or Sprint 2 chain work.
