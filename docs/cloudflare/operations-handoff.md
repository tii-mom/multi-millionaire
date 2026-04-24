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

## Single Blocker

The only sustainable RC1 blocker is:

`No managed Postgres DATABASE_URL is provisioned for staging.`

Do not attempt to make the local tunnel path the long-term RC1 solution. Once a
managed Postgres URL exists, use `docs/cloudflare/persistent-db-plan.md` for the
cutover and validation sequence.

## RC1 Boundary

- Current internal RC1 candidate: `no`
- Current sustainable RC1 environment: `no`
- Reason: live readiness is failing and the data plane still depends on local
  Postgres plus a local Cloudflare Tunnel.

Deposit and reward claim remain off-chain stubs. No D1 migration or Sprint 2
chain work is part of this handoff.
