# Cloudflare Staging Setup

Date: 2026-04-24

## Current Staging URLs

- Backend staging Worker:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- Frontend Pages deployment alias:
  `https://staging.multi-millionaire-staging.pages.dev`
- Frontend Pages deployment URL:
  `https://76f1297c.multi-millionaire-staging.pages.dev`

The deployed frontend bundle was rechecked after the backend cutover and still
contains the Cloudflare backend staging host, not a Vercel/Neon endpoint.

## Current State

- Backend Worker is deployed with a live Hyperdrive binding:
  - binding: `HYPERDRIVE`
  - Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
  - Hyperdrive name: `rc1-staging-postgres`
  - Hyperdrive caching: `disabled`
- Backend staging health checks:
  - `GET /health`: `200`
  - `GET /ready`: `200`
  - readiness payload: `{"status":"ready","database":"ok"}`
- Frontend staging URL:
  - `GET /`: `200`
- Current Cloudflare smoke result:
  - run id: `cf-20260424-neon-rc1`
  - status: `pass`
- Functional assessment:
  - internal RC1 candidate validation: `pass`
  - sustainable RC1 environment: `pass`

## Configured Database Route

The configured Cloudflare-first route is now:

`Cloudflare Worker -> Hyperdrive -> Neon Postgres`

Details:

- Neon project: `dry-art-24207577`
- Neon branch: `br-curly-mud-an2nh595`
- Neon database: `neondb`
- Neon role: `neondb_owner`
- Neon direct host: `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- Neon connection mode: direct/unpooled, `sslmode=require`
- Hyperdrive origin service id: none
- Hyperdrive origin connection limit: `20`
- Neon `DATABASE_URL`: not stored in git, docs, PR text, or Worker vars

Operational note:

- staging no longer depends on a local PostgreSQL process or local
  `cloudflared` tunnel session
- the Worker still uses only the `HYPERDRIVE` binding for database access; no
  direct `DATABASE_URL` binding is configured on the Worker
- Hyperdrive caching remains disabled because auth flows include immediate
  read-after-write checks after registration

Historical local-origin resources are no longer part of the live RC1 data
plane:

- Cloudflare Tunnel: `mm-pg-staging`
- tunnel id: `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
- previous Workers VPC Service:
  `019dbb34-5edb-7101-804f-1a62f6a9c105`

## Migration And Seed State

Neon staging origin:

- migrations `001 -> 004`: pass
- `npm run seed:dev`: pass
- seeded users:
  - `admin@example.com`
  - `member@example.com`
  - `risk@example.com`
- active wave: present
- confirmed price round: present

This staging route was not migrated to D1.

## Commands Used

Neon initialization:

```bash
NODE_ENV=staging npm run migrate:up
NODE_ENV=staging npm run seed:dev
```

Cloudflare smoke:

```bash
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=cf-20260424-neon-rc1 \
npm run smoke
```

## RC1 State

- Current blocker count: `0`
- Current status: Cloudflare staging is usable for current RC1 validation
  because `/health` and `/ready` both return `200`
- Current smoke `cf-20260424-neon-rc1`: `pass`
- Sustainable RC1 status: achieved
- Stub boundary: deposit and reward claim remain off-chain stubs
- RC1 recommendation: current staging can be treated as a sustainable RC1
  environment, subject to normal release sign-off
