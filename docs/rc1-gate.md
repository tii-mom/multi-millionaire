# RC1 Gate

RC1 can enter staging acceptance only when all gate items below are satisfied.

For the Cloudflare-first line, local rehearsal evidence is useful but does not
replace a real Cloudflare staging smoke run against the deployed backend URL.

## Current Cloudflare Status

As of `2026-04-25`, the Cloudflare staging line satisfies the functional RC1
candidate gate:

- backend staging URL is live:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- frontend staging URL is live:
  `https://staging.multi-millionaire-staging.pages.dev`
- backend `GET /health`: `200`
- backend `GET /ready`: `200`
- Hyperdrive binding is live and backed by Neon Postgres
- data plane is `Cloudflare Worker -> Hyperdrive -> Neon Postgres`
- real Cloudflare smoke run `cf-20260424-neon-rc1`: `pass`

The completed smoke evidence is enough for internal RC1 candidate history and
the staging environment is now sustainable for RC1 closed beta.

## Sustainability Gate

The sustainable RC1 environment requirement is met for staging.

- Current staging data plane:
  `Cloudflare Worker -> Hyperdrive -> Neon Postgres`
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
4. Confirm Hyperdrive points to the intended staging origin.
5. Deploy the API.
6. Confirm the API is running on the Cloudflare staging backend URL.
7. Confirm `/health` and `/ready` on the Cloudflare staging backend URL.
8. Run `API_BASE_URL="$API_BASE_URL" npm run smoke` against the Cloudflare staging backend URL.

The smoke JSON must have top-level `status: pass`.

For the current Cloudflare staging setup, keep Hyperdrive caching disabled so
register -> immediate login read-after-write behavior remains correct.

## No-Go Conditions

- `/ready` returns non-200 or `database` is not `ok`.
- Before the managed Postgres cutover, Cloudflare staging does not have a live
  `Hyperdrive -> VPC Service -> Tunnel -> Postgres` path.
- After the managed Postgres cutover, Hyperdrive still references the old VPC
  service or any local tunnel-backed origin.
- Hyperdrive caching is re-enabled and auth-critical read-after-write behavior starts returning stale empty results.
- Environment check has missing or invalid required variables.
- Any smoke step fails.
- High-value risk flag is not created for the risk smoke deposit.
- Reward claim is not blocked while the risk flag is open.
- Claim retry does not succeed after admin risk resolution.
- Admin emergency controls cannot be read, toggled, restored, or audited on
  staging.
- Admin chain event visibility or receipt verifier diagnostics are unavailable.
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
- staging admin control toggle/restore evidence, including control key and
  restored state
- admin audit log id/action for the control update
- chain-events query result count and `apply_status` filter
- `/v1/admin/ops` receipt verifier mode/status
- smoke run id for the staging evidence
- confirmation that production smoke remained GET-only, or the separate
  mutating canary approval if production admin checks were run
- any local rehearsal smoke JSON output, clearly labeled as local evidence only
- rollback decision notes if any gate item failed

## Current Decision

Current result: internal RC1 candidate and sustainable staging environment are
met. This is still not a real chain-backed production launch: production remains
No-Go until frontend DNS, mainnet contract deployment evidence, independent
security review approval, production chain env gates, wallet proof smoke, and a
small approved mainnet canary are complete.
