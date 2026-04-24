# Cloudflare Persistent DB Plan

Date: 2026-04-24

## Goal

Replace the current staging database route:

`Cloudflare Worker -> Hyperdrive -> Workers VPC Service -> Cloudflare Tunnel -> local Postgres`

with the persistent target route:

`Cloudflare Worker -> Hyperdrive -> managed Postgres`

Constraints for this thread:

- do not change business logic
- do not migrate to D1
- do not enable real chain-write paths

## Current Verified State

- staging Worker URL:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- staging frontend URL:
  `https://staging.multi-millionaire-staging.pages.dev`
- Hyperdrive binding:
  - id: `88b8cd7fd84e4064ad29b43a16c579f2`
  - name: `mm-staging-vpc-127`
  - caching: `disabled`
- `wrangler hyperdrive get 88b8cd7fd84e4064ad29b43a16c579f2` reports:
  - database: `mm_cf_staging`
  - user: `mm_cf_staging`
  - service id: `019dbb34-5edb-7101-804f-1a62f6a9c105`
- `wrangler vpc service get 019dbb34-5edb-7101-804f-1a62f6a9c105` reports:
  - type: `tcp`
  - tcp port: `5432`
  - app protocol: `postgresql`
  - ipv4: `127.0.0.1`
  - tunnel id: `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
- the current origin database is running on this workstation as:
  `/opt/homebrew/Cellar/postgresql@14/14.18/bin/postgres -D /tmp/mm-pg -p 5432`
- the temporary tunnel was run as:
  `cloudflared tunnel --no-autoupdate --loglevel info run`
- `brew services list` shows:
  - `cloudflared`: `none`
  - `postgresql@14`: `none`
- staging Worker secrets currently include only:
  - `JWT_SECRET`
- repository and current shell environment contain no managed Postgres provider
  metadata or connection string
- current origin verification:
  - `/health`: `200`
  - earlier `/ready`: `200` with `database=ok`
  - latest live `/ready` in this thread: `503` with `database=error`
  - latest process check did not find a running `cloudflared` process
  - `schema_migrations`: `001_init.sql`, `002_squads.sql`, `003_rewards.sql`, `004_risk.sql`
  - seeded users present: `admin@example.com`, `member@example.com`, `risk@example.com`
  - latest real Cloudflare smoke: `cf-20260424-rc1-final`, `pass`

## Decision

- Preferred path: `Hyperdrive + managed Postgres`
- Temporary fallback: keep the tunnel-backed origin only long enough to support
  current RC1 candidate validation
- Single blocker:
  `No managed Postgres instance and connection string are provisioned for
  staging, so Hyperdrive cannot be repointed and migrations/seed cannot be run
  on a persistent origin.`

This means the current staging line has historical functional RC1 evidence, but
it is not a sustainable RC1 environment. The latest live readiness check is
already failing, which confirms the temporary data plane cannot be treated as a
durable staging dependency.

## Temporary Path Lifetime

The current temporary path is only safe to describe as valid while all of the
following remain true:

- this workstation stays online and reachable
- the local Postgres process on `/tmp/mm-pg` stays up
- the interactive `cloudflared` session stays running
- the tunnel route still points to `tcp://localhost:5432`

Operationally, treat the current path as a single-operator, same-machine,
best-effort setup. Do not assume it survives:

- workstation reboot
- workstation sleep
- network changes
- operator logout
- `cloudflared` process exit
- local Postgres restart
- `/tmp` cleanup or data-directory loss

## Current Risks

- The database data directory is under `/tmp/mm-pg`, which is not an acceptable
  durability boundary for staging.
- Tunnel availability depends on one interactive user session.
- There is no managed-service snapshot, HA, or provider SLA documented for the
  current origin.
- Migration and seed scripts require a direct `DATABASE_URL`; they cannot run
  through Worker `env.HYPERDRIVE`.
- Smoke evidence proves the route worked on 2026-04-24; it does not make the
  route durable.

## Tunnel Ownership

Until the managed Postgres cutover is completed, the tunnel is effectively
maintained by the current staging operator on this workstation and Cloudflare
account owner `348421501@qq.com`.

## Cutover Steps Once Managed Postgres Exists

1. Provision a managed Postgres instance for staging with:
   - database name for staging application data
   - application user with least-privilege credentials
   - backup / snapshot policy
   - TLS requirements documented
2. Export the provider connection string as `DATABASE_URL` in a secure shell for
   operator commands.
3. Run migrations directly against the managed origin:

   ```bash
   cd server
   NODE_ENV=staging DATABASE_URL='<managed-postgres-url>' npm run migrate:up
   ```

4. Run the idempotent seed against the managed origin:

   ```bash
   cd server
   NODE_ENV=staging DATABASE_URL='<managed-postgres-url>' npm run seed:dev
   ```

5. Repoint Hyperdrive away from the VPC Service and onto the managed origin.
   Wrangler 4.84.1 supports either a connection string or explicit host/port:

   ```bash
   cd server
   npx wrangler hyperdrive update 88b8cd7fd84e4064ad29b43a16c579f2 \
     --connection-string '<managed-postgres-url>' \
     --caching-disabled
   ```

6. Confirm the Hyperdrive origin no longer references
   `service_id=019dbb34-5edb-7101-804f-1a62f6a9c105`:

   ```bash
   cd server
   npx wrangler hyperdrive get 88b8cd7fd84e4064ad29b43a16c579f2
   ```

7. Redeploy the staging Worker so the current binding/config is active:

   ```bash
   cd server
   npx wrangler deploy --config wrangler.jsonc --env staging
   ```

8. Recheck health and readiness:

   ```bash
   curl -fsS https://multi-millionaire-api-staging.348421501.workers.dev/health
   curl -fsS https://multi-millionaire-api-staging.348421501.workers.dev/ready
   ```

9. Re-run the full Cloudflare smoke against the deployed Worker:

   ```bash
   cd server
   API_BASE_URL=https://multi-millionaire-api-staging.348421501.workers.dev \
   SMOKE_RUN_ID=cf-20260424-persistent-db \
   npm run smoke
   ```

10. Update:
    - `docs/cloudflare/staging-setup.md`
    - `docs/rc1-gate.md`
    - `docs/staging-smoke-test.md`
    - this file

## Acceptance Rule

Only call staging a sustainable RC1 environment after all of the following are
true:

- Hyperdrive origin points to managed Postgres, not the local VPC service
- migrations ran on the managed origin
- seed ran on the managed origin
- a full Cloudflare smoke passed after the cutover
- operator docs were updated to match the new origin
