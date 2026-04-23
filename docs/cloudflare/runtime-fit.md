# Cloudflare Runtime Fit

Date: 2026-04-23

## Scope

- Repository: `tii-mom/multi-millionaire`
- RC1 target:
  - frontend on Cloudflare Pages
  - backend on Cloudflare Workers
  - database on Hyperdrive + existing Postgres

## Result

### Frontend

The current Vite frontend is Cloudflare Pages-friendly with no application code refactor required.

- `npm run build` succeeds.
- The client already supports an absolute API origin through `VITE_API_BASE_URL`.
- Pages can host the current static `dist/` output directly.

### Backend

The current Express backend can run on Cloudflare Workers, but not as a pure no-code lift-and-shift.

Required runtime-fit changes that were needed in this spike:

1. Add a Worker entry using `cloudflare:node` and `handleAsNodeRequest()`.
2. Add a runtime binding shim so the API can prefer `env.HYPERDRIVE.connectionString` and fall back to `DATABASE_URL`.
3. Replace native `bcrypt` with `bcryptjs`.
4. Replace `express.json()` with a local JSON parser middleware.
5. Add a Worker-specific import shim so Express/body-parser can load under the Workers runtime.
6. Add a custom rate-limit key generator because `request.ip` is not reliably present in Workers requests.

### Runtime-fit conclusion

Conclusion: `nodejs_compat` plus a small compatibility layer is enough for RC1.

This is not zero-touch, but it is still a minimal adaptation compared with rewriting the whole API.

## Evidence

### Build/bundle

- `wrangler deploy --config server/wrangler.jsonc --env staging --dry-run` succeeds.
- `server npm run build` still succeeds for the Node path.

### Local Workers runtime

- `wrangler dev --config server/wrangler.jsonc --env staging` starts successfully.
- `GET /health` returns `200`.
- `POST /v1/auth/login` with `{}` returns `400`, confirming JSON parsing and routing work in the Workers runtime.

### Deployed Workers runtime

Backend staging Worker:

- `https://multi-millionaire-api-staging.348421501.workers.dev`

Observed behavior on the deployed Worker:

- `GET /health` returns `200`
- `GET /ready` returns `503` because no database binding is attached yet
- request routing and response middleware are working

## What Is Still Not Proven

The following are still unproven in a real Cloudflare environment:

- Hyperdrive binding to a real staging Postgres database
- successful `/ready`
- register/login/pass/squad/deposit/reward/risk flows on Cloudflare staging

## Recommended RC1 Shape

Use Cloudflare Workers for the backend entrypoint for RC1.

Reason:

- it matches the current split deployment model better than Pages Functions
- it gives a clean standalone backend staging URL
- it lets the frontend remain a plain Pages static deployment

## If We Need A Cleaner RC2 Path

If the Express compatibility shim becomes fragile, the next step should be:

- keep the existing controllers/models/business rules
- replace only the HTTP entry/router layer with a Workers-native router such as Hono or a small `fetch()` router

That is the fallback path, but it is not required yet for RC1.

## References

- Cloudflare Workers Node.js compatibility:
  `https://developers.cloudflare.com/workers/runtime-apis/nodejs/`
- Cloudflare `node:http` / `cloudflare:node` integration:
  `https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/`
- Cloudflare Hyperdrive + `pg`:
  `https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/`
