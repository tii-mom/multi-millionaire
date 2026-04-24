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
  - name: `mm-staging-vpc-127`
  - caching: `disabled`
- Current Hyperdrive origin still references VPC Service
  `019dbb34-5edb-7101-804f-1a62f6a9c105`.
- Historical Cloudflare smoke `cf-20260424-rc1-final`: `pass`.
- Latest live health check in this thread:
  - `/health`: `200`
  - `/ready`: `503`, `database=error`

Current RC1 judgment:

- internal RC1 candidate evidence: `yes`, based on the completed Cloudflare
  smoke run
- sustainable RC1 environment: `no`, because the staging data plane still
  depends on the local tunnel-backed Postgres route and latest readiness is
  failing

## Temporary Data Plane

Current route:

`Cloudflare Worker -> Hyperdrive -> Workers VPC Service -> Cloudflare Tunnel -> local Postgres`

Known temporary-origin details:

- database: `mm_cf_staging`
- role: `mm_cf_staging`
- VPC Service: `019dbb34-5edb-7101-804f-1a62f6a9c105`
- tunnel: `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
- local Postgres data directory: `/tmp/mm-pg`
- local Postgres port: `5432`

This route is not a long-term RC1 environment because it depends on one
workstation, an interactive `cloudflared` session, and a Postgres data
directory under `/tmp`. It has no documented managed-service backup, snapshot,
HA, or provider SLA boundary.

## Sustainable Target

Target route:

`Cloudflare Worker -> Hyperdrive -> managed Postgres`

The cutover remains blocked until an operator provides a managed staging
Postgres connection string and credentials that can be used from `server/` for
both migrations and seed.

Do not put real secrets in this repository. Export them only in the operator
shell that runs the cutover commands.

Required operator inputs:

- `DATABASE_URL`: managed staging Postgres direct connection string
- `CLOUDFLARE_API_TOKEN`: token with permission to update Hyperdrive and deploy
  the staging Worker

## Cutover Checklist

Run from `server/` after exporting the required operator inputs:

```bash
NODE_ENV=staging DATABASE_URL="$DATABASE_URL" npm run migrate:up
NODE_ENV=staging DATABASE_URL="$DATABASE_URL" npm run seed:dev
```

Then repoint the existing Hyperdrive config:

```bash
npx wrangler hyperdrive update 88b8cd7fd84e4064ad29b43a16c579f2 \
  --connection-string "$DATABASE_URL" \
  --sslmode require \
  --caching-disabled
```

Confirm the Hyperdrive origin no longer references the VPC Service:

```bash
npx wrangler hyperdrive get 88b8cd7fd84e4064ad29b43a16c579f2
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

