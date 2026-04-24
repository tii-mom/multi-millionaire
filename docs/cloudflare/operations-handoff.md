# Cloudflare Operations Handoff

Date: 2026-04-24

## Current State

- Backend staging Worker:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- Frontend staging Pages alias:
  `https://staging.multi-millionaire-staging.pages.dev`
- Hyperdrive binding:
  - binding: `HYPERDRIVE`
  - id: `88b8cd7fd84e4064ad29b43a16c579f2`
  - name: `rc1-staging-postgres`
  - caching: `disabled`
- Current Hyperdrive origin references Neon Postgres:
  `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`, database `neondb`,
  user `neondb_owner`, TLS `sslmode=require`.
- Historical Cloudflare smoke `cf-20260424-rc1-final`: `pass`.
- Earlier tunnel-backed live health check in this thread had `/ready=503`;
  after the Neon cutover, the RC1 smoke readiness evidence is `/ready=200`.

Current RC1 judgment:

- internal RC1 candidate evidence: `yes`, based on the completed Cloudflare
  smoke run
- sustainable RC1 environment: `yes for staging`, because the data plane now
  uses Hyperdrive -> Neon Postgres
- production environment: `not yet`, because production Neon, production
  Hyperdrive, production secrets, and production smoke evidence are still
  separate unfinished tasks

## Current Data Plane

Current route:

`Cloudflare Worker -> Hyperdrive -> Neon Postgres`

Current managed-origin details:

- Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
- host: `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- database: `neondb`
- role: `neondb_owner`
- caching: `disabled`
- TLS: `sslmode=require`

## Historical Temporary Data Plane

Previous route:

`Cloudflare Worker -> Hyperdrive -> Workers VPC Service -> Cloudflare Tunnel -> local Postgres`

Known temporary-origin details:

- database: `mm_cf_staging`
- role: `mm_cf_staging`
- VPC Service: `019dbb34-5edb-7101-804f-1a62f6a9c105`
- tunnel: `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
- local Postgres data directory: `/tmp/mm-pg`
- local Postgres port: `5432`

That route is not a long-term RC1 environment because it depends on one
workstation, an interactive `cloudflared` session, and a Postgres data
directory under `/tmp`. It has no documented managed-service backup, snapshot,
HA, or provider SLA boundary.

## Sustainable Target

Target route:

`Cloudflare Worker -> Hyperdrive -> managed Postgres`

The staging cutover has been completed. The production cutover remains blocked
until an operator provides a production Neon Postgres connection string and
credentials that can be used from `server/` for migrations, production
Hyperdrive creation, and non-mutating production smoke.

Do not put real secrets in this repository. Export them only in the operator
shell that runs the cutover commands.

Required operator inputs:

- `DATABASE_URL`: managed production Postgres direct connection string
- `CLOUDFLARE_API_TOKEN`: token with permission to update Hyperdrive and deploy
  the production Worker

## Cutover Checklist

For production, run from `server/` after exporting the required operator inputs:

```bash
NODE_ENV=production DATABASE_URL="$DATABASE_URL" npm run migrate:up
```

Then create a production Hyperdrive config. Do not reuse the staging config:

```bash
npx wrangler hyperdrive create multi-millionaire-production-postgres \
  --connection-string "$DATABASE_URL" \
  --sslmode require \
  --caching-disabled
```

Record the returned production Hyperdrive id and add it to
`server/wrangler.jsonc` under `env.production.hyperdrive`.

Confirm the production Hyperdrive origin references the production Neon host:

```bash
npx wrangler hyperdrive get <production-hyperdrive-id>
```

Deploy and verify:

```bash
npx wrangler deploy --config wrangler.jsonc --env staging
curl -fsS https://multi-millionaire-api-staging.348421501.workers.dev/health
curl -fsS https://multi-millionaire-api-staging.348421501.workers.dev/ready
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=cf-20260424-persistent-db \
npm run smoke
```

Only after those checks pass should the RC1 gate be updated to
`sustainable RC1 environment: yes`.

## Smoke Coverage

The required Cloudflare smoke covers:

- backend `/health`
- backend `/ready`
- register
- login
- claim pass
- create squad
- join squad
- deposit-precheck
- deposit
- squad activation through the qualifying deposit path
- referral reward generation
- reward summary/list
- reward claim
- risk trigger
- risk block
- risk resolve and claim retry

## Stub Boundaries

RC1 remains limited to the current off-chain MVP behavior:

- deposits create database positions only
- reward claims update reward ledger status only
- risk review uses `risk_flags`
- no real chain lock is executed
- no oracle settlement is validated
- no Merkle reward publication or on-chain reward transfer is validated
