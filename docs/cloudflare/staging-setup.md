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
  - earlier tunnel-backed live `GET /ready` check in this thread: `503`
  - earlier readiness payload: `{"status":"not_ready","database":"error"}`
  - RC1 smoke readiness result after the Neon cutover: `200`, `database=ok`
- Real Cloudflare smoke result:
  - run id: `cf-20260424-rc1-final`
  - status: `pass`
- Functional assessment:
  - RC1 candidate validation: `pass`
  - sustainable RC1 environment: `yes for staging`, with the off-chain MVP
    boundaries below

## Current Managed Database Route

Verified on 2026-04-24 with `wrangler hyperdrive list`:

`Cloudflare Worker -> Hyperdrive -> Neon Postgres`

- Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive name: `rc1-staging-postgres`
- host: `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- database: `neondb`
- user: `neondb_owner`
- caching: `disabled`
- TLS: `sslmode=require`

This replaces the earlier local tunnel-backed route for the current staging
environment. Keep the old route notes below for rollback/history only.

## Historical Temporary Database Route

The earlier temporary Cloudflare-first route was:

`Cloudflare Worker -> Hyperdrive -> Workers VPC Service -> Cloudflare Tunnel -> existing Postgres`

Details:

- Existing Postgres origin:
  - database: `mm_cf_staging`
  - role: `mm_cf_staging`
  - current host: local PostgreSQL running on this machine
- Cloudflare Tunnel:
  - tunnel name: `mm-pg-staging`
  - tunnel id: `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
  - ingress hostname: `mm-pg-staging.72h.lol`
  - ingress service: `tcp://localhost:5432`
- Active Workers VPC Service:
  - service id: `019dbb34-5edb-7101-804f-1a62f6a9c105`
  - name: `mm-pg-staging-127`
  - type: `tcp`
  - app protocol: `postgresql`
  - target: `127.0.0.1:5432`

Historical operational note:

- this staging path depended on the local PostgreSQL process and the
  local `cloudflared` tunnel session staying up on this machine
- the latest live check found `/health=200` but `/ready=503`, which is
  consistent with the tunnel-backed data plane being unavailable
- Earlier exploratory VPC Service:
  - service id: `019dbb2e-01d8-7ef3-9d24-1d58ba219294`
  - name: `mm-pg-staging-tcp`
  - note: created during hostname-based trial; the working path uses the
    `127.0.0.1` service above

## Origin Requirements That Made Hyperdrive Work

Two origin-side changes were required for the Cloudflare route to become usable:

1. PostgreSQL server TLS had to present a stricter server certificate:
   - `basicConstraints = CA:FALSE`
   - `keyUsage = digitalSignature, keyEncipherment`
   - `extendedKeyUsage = serverAuth`
2. Hyperdrive query caching had to be disabled.

The cache disable is operationally important for this app. The register flow
performs `findByEmail(email)` before insert. With Hyperdrive caching enabled,
that empty lookup could be reused immediately by the following login request,
producing a false `INVALID_CREDENTIALS` result in Cloudflare even though the row
had already been inserted into Postgres.

## Migration And Seed State

The prepared origin database remains on the existing Postgres route and was not
migrated to D1.

- migrations `001 -> 004`: pass
- `seed:dev`: pass
- seeded users:
  - `admin@example.com`
  - `member@example.com`
  - `risk@example.com`

## Sustainability Assessment

- Target route:
  `Cloudflare Worker -> Hyperdrive -> managed Postgres`
- Current status:
  `sustainable staging route achieved with Hyperdrive -> Neon Postgres.`
- Production still needs its own isolated Neon database and production
  Hyperdrive config. Do not reuse this staging Hyperdrive or Neon database for
  production.
- The persistent cutover plan and fallback operating notes are tracked in
  `docs/cloudflare/persistent-db-plan.md`.
- After any future Hyperdrive origin change, rerun migrations as needed,
  confirm `/ready=200`, and run a new full Cloudflare smoke before updating the
  RC1 evidence.

## Commands Used

Workers VPC Service:

```bash
npx wrangler vpc service create mm-pg-staging-127 \
  --type tcp \
  --tunnel-id 7ae7d04e-ca98-40d9-9f5d-fd52aa100b32 \
  --tcp-port 5432 \
  --app-protocol postgresql \
  --ipv4 127.0.0.1 \
  --cert-verification-mode disabled
```

Hyperdrive creation:

```bash
npx wrangler hyperdrive create mm-staging-vpc-127 \
  --service-id 019dbb34-5edb-7101-804f-1a62f6a9c105 \
  --scheme postgresql \
  --database mm_cf_staging \
  --user mm_cf_staging \
  --password '<staging-db-password>'
```

Hyperdrive cache disable:

```bash
npx wrangler hyperdrive update 88b8cd7fd84e4064ad29b43a16c579f2 \
  --service-id 019dbb34-5edb-7101-804f-1a62f6a9c105 \
  --scheme postgresql \
  --database mm_cf_staging \
  --user mm_cf_staging \
  --password '<staging-db-password>' \
  --caching-disabled
```

Backend deploy:

```bash
cd server
npx wrangler deploy --config wrangler.jsonc --env staging
```

Cloudflare smoke:

```bash
cd server
API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
SMOKE_RUN_ID=cf-20260424-rc1-final \
npm run smoke
```

## RC1 State

- Current blocker count: `0` for staging sustainability
- Current status: prior Cloudflare smoke supports internal RC1 candidate
  evidence
- Sustainable RC1 status: achieved for the staging environment
- RC1 recommendation: acceptable for closed beta/staging regression, not a real
  chain-backed production release
