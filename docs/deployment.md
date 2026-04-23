# Deployment Runbook

This runbook standardizes the staging path for RC1. It assumes the API server is deployed separately from the frontend and that the smoke script targets an already-running API through `API_BASE_URL`.

## Scope

- Repository: `tii-mom/multi-millionaire`
- API package: `server`
- Target environments: local, staging, production
- RC1 smoke target: staging API only

The smoke script does not deploy infrastructure and does not run as a cloud job. It is a local operator command that calls the target API.

## Preflight

From `server/`:

```bash
NODE_ENV=staging npm run check:env -- staging
npm run build
npm test
```

Required staging variables include `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAILS`, `CORS_ALLOWED_ORIGINS`, and `HIGH_RISK_DEPOSIT_THRESHOLD`.

## Migration Order

Run migrations before starting the new API version:

```bash
NODE_ENV=staging npm run migrate:up
```

Current migration order is lexical and numeric:

1. `001_init.sql`
2. `002_squads.sql`
3. `003_rewards.sql`
4. `004_risk.sql`

Do not run `migrate:reset` outside local or controlled staging rehearsal databases.

## Seed Strategy

Use the existing idempotent seed only for local and staging:

```bash
NODE_ENV=staging npm run seed:dev
```

The seed creates or refreshes baseline API users such as `admin@example.com`, `member@example.com`, and `risk@example.com`. Production admin access should be provisioned deliberately through production account management and `ADMIN_EMAILS`; do not run the dev seed in production.

## Deploy Steps

1. Confirm the target commit and release marker.
2. Run `npm ci` in the repository root and in `server/` if dependencies are not already installed.
3. Run server checks from `server/`: `npm run build` and `npm test`.
4. Run `NODE_ENV=staging npm run check:env -- staging`.
5. Back up the staging database or confirm a recent restorable snapshot.
6. Run `NODE_ENV=staging npm run migrate:up`.
7. Run `NODE_ENV=staging npm run seed:dev`.
8. Deploy the API build artifact or container.
9. Check health and readiness:

```bash
curl -fsS "$API_BASE_URL/health"
curl -fsS "$API_BASE_URL/ready"
```

10. Run RC1 smoke:

```bash
API_BASE_URL="$API_BASE_URL" \
SMOKE_ADMIN_EMAIL="admin@example.com" \
SMOKE_ADMIN_PASSWORD="Password123!" \
npm run smoke
```

11. Deploy or promote the frontend only after the API smoke result is `pass`.

## Current Stub Boundaries

- `POST /v1/waves/:waveId/deposit` records an off-chain database position. It does not verify or submit a real token lock.
- `POST /v1/rewards/:ledgerId/claim` marks an approved reward ledger as claimed. It does not transfer tokens on-chain.
- Risk blocking is enforced through `risk_flags` rows with `open` or `reviewing` status.
- Chain-related env values are tracked for readiness, but RC1 smoke does not prove chain settlement.
