# Operations Guide

This guide covers routine staging operations for RC1.

## Environment Check

Run from `server/`:

```bash
NODE_ENV=staging npm run check:env -- staging
```

Use JSON output when automation needs to parse results:

```bash
NODE_ENV=staging npm run check:env -- staging --json
```

The script separates required variables from recommended values and exits non-zero when required staging or production values are missing or invalid.

## Migrations

Apply migrations in numeric order through the existing migration script:

```bash
NODE_ENV=staging npm run migrate:up
```

The migration tracker table is `schema_migrations`. Confirm applied migrations when investigating deploy drift.

## Seed

For local and staging only:

```bash
NODE_ENV=staging npm run seed:dev
```

The seed is idempotent for baseline test/admin users. Do not use it as production account provisioning.

## Health And Readiness

Use these endpoints after every deploy:

```bash
curl -fsS "$API_BASE_URL/health"
curl -fsS "$API_BASE_URL/ready"
```

Expected results:

- `/health`: HTTP `200`, `status: ok`
- `/ready`: HTTP `200`, `status: ready`, `database: ok`

Readiness failure means the API should not receive promoted traffic.

## Smoke Execution

Run from `server/` after migrations and staging seed:

```bash
API_BASE_URL="https://staging-api.example.com" \
SMOKE_ADMIN_EMAIL="admin@example.com" \
SMOKE_ADMIN_PASSWORD="Password123!" \
npm run smoke
```

Optional controls:

- `SMOKE_RUN_ID`: stable suffix for generated test accounts
- `SMOKE_PASSWORD`: generated test account password
- `SMOKE_DEPOSIT_AMOUNT`: normal qualifying deposit amount, default `1000`
- `SMOKE_RISK_DEPOSIT_AMOUNT`: high-value risk deposit amount, default `2000000`

The smoke script prints a JSON report with top-level `status`, step-level `pass` or `fail`, generated account emails, created IDs, and failure details. It exits non-zero when any required step fails.

For production, use the non-mutating smoke instead:

```bash
API_BASE_URL="https://api.example.com" npm run smoke:production
```

Production smoke is GET-only and checks `/health`, `/ready`,
`/v1/app/bootstrap`, and `/v1/waves/current`. It does not register users,
deposit, claim rewards, or call admin endpoints.

Admin operation checks are staging-only unless a production canary window has
been explicitly approved. In staging, verify:

- `GET /v1/admin/controls` lists `pause_deposits`,
  `pause_reward_claims`, `pause_referral_rewards`, and
  `maintenance_banner`.
- `PATCH /v1/admin/controls/:key` can toggle a control with a reason and then
  restore the previous state.
- `GET /v1/admin/audit-logs` shows the control update action and actor.
- `GET /v1/admin/chain-events?apply_status=applied` returns chain event
  visibility, even if the expected result count is zero for stub-only RC1.
- `GET /v1/admin/ops` reports receipt verifier `mode`, `status`, and
  `configured`.

## Smoke Coverage

The RC1 smoke path covers:

- health and readiness
- register and login
- pass claim
- squad create and join
- referral confirmation needed for reward generation
- deposit precheck and deposit
- reward summary/list and claim
- high-value risk flag lookup
- blocked reward claim
- admin risk resolution
- claim retry after risk resolution
- admin emergency controls and audit log visibility
- admin chain event and receipt verifier diagnostics

## Routine Checks

- Confirm `ADMIN_EMAILS` contains the operator account used for risk resolution.
- Confirm `HIGH_RISK_DEPOSIT_THRESHOLD` is lower than `SMOKE_RISK_DEPOSIT_AMOUNT`.
- Confirm CORS allows the staging frontend origin before browser QA.
- Keep the smoke output with the release marker and commit SHA.
- Record the admin control key toggled, restored state, audit log id/action,
  chain event query result, and receipt verifier diagnostic values.

## Current Stub Boundaries

- Deposits are off-chain records in `positions`.
- Reward claims are off-chain status updates in `reward_ledgers`.
- Risk review is database-backed through `risk_flags`.
- Chain env variables are readiness placeholders for later contract-backed flows; RC1 smoke does not validate chain lock or token distribution.
