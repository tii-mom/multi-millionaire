# Cloudflare Operations Handoff

Date: 2026-04-24

## Current State

Cloudflare staging is deployed, but it is not ready for RC1.

- backend URL:
  `https://multi-millionaire-api-staging.348421501.workers.dev`
- frontend URL:
  `https://staging.multi-millionaire-staging.pages.dev`
- frontend `GET /`: `200`
- backend `GET /health`: `200`
- backend `GET /ready`: `503`
- readiness database status: `error`
- historical smoke `cf-20260424-rc1-final`: `pass`
- current complete smoke: not run because readiness fails
- Neon Postgres origin: provisioned and initialized
- Hyperdrive cutover to Neon: blocked by invalid Cloudflare management auth

## Data Plane

Current data path:

`Worker -> Hyperdrive -> Workers VPC Service -> Cloudflare Tunnel -> local Postgres`

Current Cloudflare resources:

- Worker: `multi-millionaire-api-staging`
- Hyperdrive binding: `HYPERDRIVE`
- Hyperdrive id: `88b8cd7fd84e4064ad29b43a16c579f2`
- Hyperdrive name: `mm-staging-vpc-127`
- Hyperdrive origin service id:
  `019dbb34-5edb-7101-804f-1a62f6a9c105`
- Cloudflare tunnel: `mm-pg-staging`
- tunnel id: `7ae7d04e-ca98-40d9-9f5d-fd52aa100b32`
- current tunnel status: `down`, with no active connections

The Worker currently has no `DATABASE_URL` binding. Database access is through
the Hyperdrive binding only.

Prepared Neon origin:

- project: `dry-art-24207577`
- branch: `br-curly-mud-an2nh595`
- database: `neondb`
- role: `neondb_owner`
- direct host: `ep-odd-feather-anb8qhf3.c-6.us-east-1.aws.neon.tech`
- connection mode: direct/unpooled, `sslmode=require`
- `DATABASE_URL`: not stored in git, docs, PR text, or Worker vars

## Single Blocker

The only sustainable RC1 blocker now is:

`Cloudflare management authentication is invalid, so Hyperdrive cannot be
updated to use the prepared Neon origin.`

Do not attempt to make the local tunnel path the long-term RC1 solution. Once
Cloudflare auth is fixed, update Hyperdrive to the Neon direct origin and rerun
live readiness plus the full Cloudflare smoke.

## Neon Database State

- migrations `001_init.sql`, `002_squads.sql`, `003_rewards.sql`, and
  `004_risk.sql`: applied
- `npm run seed:dev`: completed against Neon
- verified users: `admin@example.com`, `member@example.com`, `risk@example.com`
- active wave: present
- confirmed price round: present

## RC1 Boundary

- Current internal RC1 candidate: `no`
- Current sustainable RC1 environment: `no`
- Reason: live readiness is failing and the Worker still points at the
  VPC Service / Tunnel origin instead of the prepared Neon origin.

Deposit and reward claim remain off-chain stubs. No D1 migration or Sprint 2
chain work is part of this handoff.
