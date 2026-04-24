# RC1 Gate

RC1 can enter staging acceptance only when all gate items below are satisfied.

For the Cloudflare-first line, local rehearsal evidence is useful but does not
replace a real Cloudflare staging smoke run against the deployed backend URL.

## Current Cloudflare Status

As of `2026-04-24`, the Cloudflare staging line does not satisfy the current
RC1 gate:

- backend staging URL is live:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- frontend staging URL is live:
  `https://staging.multi-millionaire-staging.pages.dev`
- backend `GET /health`: `200`
- backend `GET /ready`: `503`
- readiness database status: `error`
- Hyperdrive binding is configured for existing Postgres
- Hyperdrive origin is still the local tunnel-backed Postgres route:
  `Hyperdrive -> VPC Service -> Tunnel -> this machine`
- Cloudflare tunnel `mm-pg-staging` is currently down with no active
  connections
- historical Cloudflare smoke run `cf-20260424-rc1-final`: `pass`
- current complete Cloudflare smoke: not rerun because readiness fails before
  the smoke can proceed

The historical smoke remains useful evidence for the deployed code path, but it
does not make the current live environment an RC1 candidate while `/ready`
returns `503`.

## Sustainability Gate

For the environment to be called a sustainable RC1 environment, staging must
move from the current local-origin route to `Hyperdrive + managed Postgres`.

- Single blocker:
  `No managed Postgres instance and connection string are provisioned for
  staging, so Hyperdrive cannot be repointed and migrations/seed cannot be run
  on a persistent origin.`
- Tracking doc: `docs/cloudflare/persistent-db-plan.md`

## Entry Criteria

- The target commit is identified and buildable.
- No unreviewed database schema changes are included.
- Server build passes:

```bash
cd server
npm run build
```

- Server tests pass:

```bash
cd server
npm test
```

- Staging environment check passes:

```bash
cd server
NODE_ENV=staging npm run check:env -- staging
```

## Deployment Gate

Before API promotion:

1. Confirm database snapshot or restore point.
2. Apply migrations with `NODE_ENV=staging npm run migrate:up`.
3. Run staging seed with `NODE_ENV=staging npm run seed:dev`.
4. Deploy the API.
5. Confirm the API is running on the Cloudflare staging backend URL.
6. Confirm `/health` and `/ready` on the Cloudflare staging backend URL.
7. Run `API_BASE_URL="$API_BASE_URL" npm run smoke` against the Cloudflare staging backend URL.

The smoke JSON must have top-level `status: pass`.

For the current Cloudflare staging setup, keep Hyperdrive caching disabled so
register -> immediate login read-after-write behavior remains correct.

## No-Go Conditions

- `/ready` returns non-200 or `database` is not `ok`.
- Cloudflare staging does not have a live `Hyperdrive -> VPC Service -> Tunnel -> Postgres` path.
- Hyperdrive caching is re-enabled and auth-critical read-after-write behavior starts returning stale empty results.
- Environment check has missing or invalid required variables.
- Any smoke step fails.
- High-value risk flag is not created for the risk smoke deposit.
- Reward claim is not blocked while the risk flag is open.
- Claim retry does not succeed after admin risk resolution.
- Any unexpected deposit or reward behavior requires a code change in deposit/reward logic.

## Stub Boundary Acceptance

RC1 acceptance is limited to the current stub behavior:

- Deposit means the API records a qualifying off-chain position.
- Reward claim means the API updates a reward ledger to `claimed`.
- Risk blocking is based on open or reviewing `risk_flags`.
- The gate does not certify real token locks, oracle settlement, merkle reward publication, or on-chain reward transfer.

These boundaries must be stated in release notes and operator handoff.

## Exit Artifacts

Keep these with the RC1 record:

- commit SHA and release marker
- migration list from `schema_migrations`
- seed command result
- health/readiness responses
- full Cloudflare smoke JSON output
- any local rehearsal smoke JSON output, clearly labeled as local evidence only
- rollback decision notes if any gate item failed

## Current Decision

Current result: Cloudflare RC1 is blocked. The only product/environment blocker
is the missing managed Postgres `DATABASE_URL`; without it, Hyperdrive cannot be
repointed away from the local tunnel-backed origin, migrations/seed cannot be
run on a persistent origin, `/ready` remains `503`, and a current complete
Cloudflare smoke cannot pass.
