# RC1 Gate

RC1 can enter staging acceptance only when all gate items below are satisfied.

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
5. Confirm `/health` and `/ready`.
6. Run `API_BASE_URL="$API_BASE_URL" npm run smoke`.

The smoke JSON must have top-level `status: pass`.

## No-Go Conditions

- `/ready` returns non-200 or `database` is not `ok`.
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
- full smoke JSON output
- rollback decision notes if any gate item failed
