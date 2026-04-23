# Cloudflare Env / Secrets

Date: 2026-04-23

## Backend Worker

File:

- `server/wrangler.jsonc`

### Required staging binding

- `HYPERDRIVE`
  - type: Hyperdrive binding
  - target: existing staging Postgres database
  - status on 2026-04-23: not configured

As of 2026-04-23, `wrangler hyperdrive list` in this Cloudflare account returned no existing Hyperdrive configs.

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

Use this only for non-Hyperdrive local development or emergency fallback testing.

RC1 target remains Hyperdrive + existing Postgres, not direct long-term `DATABASE_URL` from the Worker.

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
