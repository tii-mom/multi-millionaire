# Cloudflare Operations Handoff

Date: 2026-04-25

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
- production environment: `infrastructure canary only`, because production
  Worker, Pages, Hyperdrive, Neon migrations, and GET-only smoke evidence now
  exist, but mainnet contracts, DNS/custom domains, and mutating canary evidence
  are still unfinished

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
for real chain-backed use until mainnet contracts are deployed, DNS/custom
domains are attached, and a small mainnet canary is recorded. Production Neon,
Hyperdrive, Worker, Pages, and non-mutating smoke have been exercised.

Do not put real secrets in this repository. Export them only in the operator
shell that runs the cutover commands.

Required operator inputs:

- `DATABASE_URL`: managed production Postgres direct connection string. Already
  used for the current production migration run; keep it out of git.
- `CLOUDFLARE_API_TOKEN`: token with permission to update Hyperdrive and deploy
  the production Worker. Current token can deploy Worker/Pages, list
  Hyperdrive, and attach the Worker custom domain `api.mm.72h.lol`.
- Cloudflare Zone permissions still missing for public domains:
  - Zone DNS Edit for `72h.lol`
  - Workers Routes Edit for zone-level routes such as `api.72h.lol/*`
  - Zone SSL/certificate read if operators need API visibility into certificate
    issuance state

Current production resource evidence:

- production Worker: `multi-millionaire-api-production`
- production API URL:
  `https://api.mm.72h.lol`
- fallback production Worker URL:
  `https://multi-millionaire-api-production.348421501.workers.dev`
- latest production Worker version observed: `574b636e-49d6-40c2-8412-651df4a4c4`
- production Pages project: `multi-millionaire-production`
- latest Pages alias:
  `https://production.multi-millionaire-production.pages.dev`
- latest Pages deployment URL:
  `https://29f929d8.multi-millionaire-production.pages.dev`
- production frontend custom domain: `mm.72h.lol` exists in Pages but remains
  pending because the token cannot create the required DNS record.
- required frontend DNS record:
  `CNAME mm -> multi-millionaire-production.pages.dev`, proxied.
- latest DNS API attempt: 2026-04-25 direct Cloudflare API create for that
  CNAME returned `403` / `code=10000` authentication error. The token can list
  the `72h.lol` zone but still cannot read or write DNS records.
- production Hyperdrive:
  `multi-millionaire-production-postgres`
- production Hyperdrive id: `92267e746955420d80eb707f4cf23e17`
- production GET-only smoke on 2026-04-25 against `https://api.mm.72h.lol`:
  `/health=200`, `/ready=200`, `/v1/app/bootstrap=200`,
  `/v1/waves/current=200`
- latest strict GET-only smoke rerun:
  `2026-04-25T09:45:28.428Z` to `2026-04-25T09:45:30.731Z`, `pass`;
  bootstrap showed `chain_mainline_writes_enabled=false` and
  `receipt_verifier_status=disabled`.
- DNS resolution check on 2026-04-25: `api.mm.72h.lol` resolves through
  Cloudflare; `mm.72h.lol` has no A/AAAA/CNAME records and remains blocked
  until the CNAME is created.

Production chain configuration rule:

- `CHAIN_ID`, `CHAIN_RPC_URL`, and `TOKEN_ADDRESS` must point at the same TON
  network. Do not use a testnet RPC with the mainnet 72H token address.
- The mainnet 72H token master
  `EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8` is active and supports the
  standard Jetton `get_wallet_address` path on mainnet.
- Backend code reads `TOKEN_ADDRESS` for Jetton wallet derivation. Setting only
  `TOKEN_ADDRESS_MAINNET` is not sufficient for production runtime.
- Keep `CHAIN_MAINLINE_WRITES_ENABLED=false` until LockVault and MerkleClaim are
  deployed, DNS/custom domains are attached, canary limits are configured, and a
  named canary window is approved.

## Cutover Checklist

For production, run from `server/` after exporting the required operator inputs:

```bash
NODE_ENV=production DATABASE_URL="$DATABASE_URL" npm run migrate:up
```

The production Hyperdrive config already exists. If it must be recreated, do
not reuse the staging config:

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

Deploy and verify staging:

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

For production, use GET-only smoke by default:

```bash
curl -fsS https://multi-millionaire-api-production.348421501.workers.dev/health
curl -fsS https://multi-millionaire-api-production.348421501.workers.dev/ready
curl -fsS https://multi-millionaire-api-production.348421501.workers.dev/v1/app/bootstrap
curl -fsS https://multi-millionaire-api-production.348421501.workers.dev/v1/waves/current
```

Preferred custom-domain smoke:

```bash
API_BASE_URL=https://api.mm.72h.lol npm run smoke:production
```

Do not run the staging mutating smoke against production unless a canary window,
allowlisted wallet, amount, rollback owner, and stop conditions are documented.

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
