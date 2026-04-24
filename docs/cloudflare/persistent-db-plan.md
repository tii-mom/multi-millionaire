# Persistent Staging Database Plan

Date: 2026-04-24

## Current Result

Sustainable RC1 is blocked by one environment input:

`No managed Postgres DATABASE_URL exists for staging.`

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

The current data plane still depends on a local PostgreSQL process plus a local
Cloudflare Tunnel. That is not a sustainable RC1 environment.

## Required Input

Provision a managed Postgres database for staging and provide one connection
string:

```text
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
```

The provider can be any managed Postgres service that Cloudflare Hyperdrive can
reach. Do not use D1 for this RC1 path.

## Cutover Steps After DATABASE_URL Exists

1. Create or update a staging Hyperdrive config whose origin points at the
   managed Postgres host, database, user, password, and SSL settings.
2. Update `server/wrangler.jsonc` staging `HYPERDRIVE` binding only if the
   cutover creates a new Hyperdrive id.
3. Deploy the staging Worker.
4. Run migrations on the managed origin:

```bash
cd server
NODE_ENV=staging DATABASE_URL="<managed-postgres-url>" npm run migrate:up
```

5. Seed the managed origin:

```bash
cd server
NODE_ENV=staging DATABASE_URL="<managed-postgres-url>" npm run seed:dev
```

6. Verify the seeded data exists on the managed origin:

- `admin@example.com`
- `member@example.com`
- `risk@example.com`
- active wave
- confirmed price round

7. Confirm live Cloudflare health:

- `GET /health`: `200`
- `GET /ready`: `200`
- readiness database status: `ok`

8. Run the complete Cloudflare smoke against the deployed backend:

```bash
cd server
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=<new-run-id> \
npm run smoke
```

## Completion Criteria

Sustainable RC1 is achieved only when:

- Hyperdrive origin no longer depends on VPC Service / Tunnel / local Postgres
- migrations `001_init.sql` through `004_risk.sql` have run on the managed
  origin
- `npm run seed:dev` has run on the managed origin
- live `/health` and `/ready` return `200`
- `/ready` reports `database=ok` or equivalent success state
- the complete Cloudflare smoke passes against the live staging backend

Deposit and reward claim remain off-chain stubs for RC1. This plan does not
start D1 migration or Sprint 2 chain work.
