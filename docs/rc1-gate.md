# RC1 Gate

RC1 can enter staging acceptance only when all gate items below are satisfied.

For the Cloudflare-first line, local rehearsal evidence is useful but does not
replace a real Cloudflare staging smoke run against the deployed backend URL.

## Current Cloudflare Status

As of `2026-04-24`, the Cloudflare staging line satisfies the current RC1 gate:

- backend staging URL is live:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- frontend staging URL is live:
  `https://staging.multi-millionaire-staging.pages.dev`
- backend `GET /health`: `200`
- backend `GET /ready`: `200`
- readiness database status: `ok`
- Hyperdrive binding is configured for managed Postgres
- Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive name: `rc1-staging-postgres`
- Hyperdrive origin: Neon direct/unpooled Postgres,
  `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- Hyperdrive origin service id: none
- Hyperdrive SSL mode: `require`
- Hyperdrive caching: `disabled`
- local Postgres plus Cloudflare Tunnel dependency: none
- Neon Postgres origin is provisioned, migrated, seeded, and live
- current Cloudflare smoke run `cf-20260424-neon-rc1`: `pass`

The earlier historical smoke `cf-20260424-rc1-final` remains useful code-path
evidence, but the current RC1 gate is based on the Neon-backed live smoke above.

## Sustainability Gate

For the environment to be called a sustainable RC1 environment, staging must
run through `Hyperdrive + Neon Postgres`.

Current result:

- Hyperdrive points at Neon direct/unpooled Postgres with `sslmode=require`
- Hyperdrive no longer points at Workers VPC Service / Tunnel / local Postgres
- migrations `001_init.sql` through `004_risk.sql` are applied on Neon
- `npm run seed:dev` completed on Neon
- required seed users exist
- active wave exists
- confirmed price round exists
- live `/health` and `/ready` return `200`
- `/ready` reports `database=ok`
- complete Cloudflare smoke passed

Tracking doc: `docs/cloudflare/persistent-db-plan.md`

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
4. Deploy or confirm the API is using the intended Hyperdrive binding.
5. Confirm the API is running on the Cloudflare staging backend URL.
6. Confirm `/health` and `/ready` on the Cloudflare staging backend URL.
7. Run `API_BASE_URL="$API_BASE_URL" npm run smoke` against the Cloudflare staging backend URL.

The smoke JSON must have top-level `status: pass`.

For the current Cloudflare staging setup, keep Hyperdrive caching disabled so
register -> immediate login read-after-write behavior remains correct.

## No-Go Conditions

- `/ready` returns non-200 or `database` is not `ok`.
- Cloudflare staging falls back to local Postgres plus Cloudflare Tunnel.
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

Current result: Cloudflare RC1 is unblocked. Neon Postgres is provisioned,
migrated, seeded, validated, and live through Hyperdrive. `/health` and
`/ready` return `200`, `/ready` reports `database=ok`, and the complete
Cloudflare smoke `cf-20260424-neon-rc1` passed against the deployed staging
backend.

- Internal RC1 candidate: `yes`
- Sustainable RC1 environment: `yes`

Cloudflare API tokens and the Neon `DATABASE_URL` were not written to
repository files, documentation, or commits. Deposit and reward claim remain
off-chain stubs.
