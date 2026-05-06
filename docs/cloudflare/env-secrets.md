# Cloudflare Env / Secrets

Date: 2026-04-24

## Backend Worker

File:

- `server/wrangler.jsonc`

### Required staging binding

- `HYPERDRIVE`
  - type: Hyperdrive binding
  - target: existing staging Postgres database
  - status on 2026-04-24: configured
  - Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
  - Hyperdrive name: `mm-staging-vpc-127`
  - current origin mode: Workers VPC Service `019dbb34-5edb-7101-804f-1a62f6a9c105` -> Cloudflare Tunnel -> local Postgres

The binding is live, but it is not yet backed by a persistent managed Postgres
origin. See `docs/cloudflare/persistent-db-plan.md`.

### Required Worker secret

- `JWT_SECRET`

### Required Worker vars

- `NODE_ENV=staging`
- `CORS_ALLOWED_ORIGINS=https://staging.multi-millionaire-staging.pages.dev`
- `ADMIN_EMAILS=admin@example.com`
- `HIGH_RISK_DEPOSIT_THRESHOLD=<staging-threshold>`
- `CHAIN_ID=<chain-id>`
- `TOKEN_ADDRESS=<token-address-or-placeholder>`
- `LOCK_VAULT_ADDRESS=<vault-address-or-placeholder>`
- `ORACLE_ADDRESS=<oracle-address-or-placeholder>`
- `REWARD_DISTRIBUTOR_ADDRESS=<reward-distributor-address-or-placeholder>`

### Optional fallback var

- `DATABASE_URL`

Use this only for operator-side migration/seed commands, non-Hyperdrive local
development, or emergency fallback testing.

The deployed Worker's sustainable RC1 target is `Hyperdrive + managed Postgres`,
not direct long-term `DATABASE_URL` access from the Worker. The current
tunnel-backed Postgres route is only a temporary internal RC1 candidate route.

### Migration / Seed Operator Note

Even when the deployed Worker uses `env.HYPERDRIVE`, the repository migration
and seed scripts still run under Node via `ts-node`, not inside the Worker
runtime. That means `npm run migrate:up` and `npm run seed:dev` require a direct
`DATABASE_URL` for the target origin database.

This is the current cutover blocker for a persistent staging data plane: no
managed Postgres connection string is available in the repository or current
shell environment, so the scripts cannot be pointed at a hosted staging origin
today.

## Frontend Pages

File:

- `wrangler.jsonc`

### Required build variable

- `VITE_API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev`

Notes:

- If using Direct Upload, set `VITE_API_BASE_URL` in the shell before `npm run build`.
- If using Git-driven Pages builds, set `VITE_API_BASE_URL` in the Pages project preview environment variables.

## Local Wrangler Development

For local `wrangler dev` with a local Postgres database, provide:

- `DATABASE_URL=<local-postgres-url>`

If a real Hyperdrive binding exists and local Hyperdrive simulation is needed, Cloudflare documents the local override pattern:

- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<postgres-url>`

Reference:

- `https://developers.cloudflare.com/hyperdrive/get-started/`

## Non-goals For RC1

- Do not add D1 bindings.
- Do not run D1 schema migration.
- Do not replace deposit/reward stubs with real on-chain logic.
