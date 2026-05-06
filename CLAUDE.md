# CLAUDE.md - Multi-Millionaire Engineering Discipline

These rules apply to AI coding work in this repository. They are adapted from Karpathy-style CLAUDE.md practice and 72H launch requirements.

## Project Context

- Product: Millionaire Path, the player-facing frontend and backend MVP for Project 72H.
- Goal: make token locking feel like a competitive 72-hour race with squads, referrals, rewards, and risk review.
- Current state: data-driven MVP baseline. It is not connected to production smart contracts yet.
- Source of truth: read `README.md` first, then `docs/architecture.md`, `docs/api-overview.md`, and `docs/roadmap.md` when relevant.
- Season War allocation source: this repository is the allocation data source. `/Users/yudeyou/Desktop/72` is display/navigation only unless a future explicit decision changes that.
- Contract source of truth: this repository's `contracts/` folder is legacy mirror only. Future V3 app-specific contract work belongs under `/Users/yudeyou/Desktop/72h-capital-contracts/contracts/apps/multi-millionaire/v3/` after review and approval.

## 1. Think Before Coding

- Do not assume product intent silently.
- Before changing code, identify the smallest safe fix and the verification gate.
- If a change could affect production, payments, wallets, claims, contracts, or user funds, stop and ask for explicit approval.
- If requirements conflict, surface the conflict before implementation.

## 2. Simplicity First

- Implement the minimum code needed to solve the requested problem.
- Do not add speculative features, abstractions, hidden modes, or broad rewrites.
- Prefer clear product behavior over clever engineering.
- If the solution is becoming large, pause and simplify.

## 3. Surgical Changes

- Touch only files directly required by the task.
- Do not refactor unrelated code.
- Match existing style.
- Clean only issues introduced by your own change.
- Every changed line must trace back to the task.

## 4. Goal-Driven Execution

- Define success as a verifiable result, not “looks done”.
- Add or update tests when behavior changes.
- Run the smallest meaningful gate before reporting completion.
- Report only: changed area, verification, remaining risk, and whether it is ready.

## Project Commands

- Install root dependencies: `npm install`
- Frontend dev: `npm run dev`
- Frontend build: `npm run build`
- Frontend type/lint check: `npm run lint`
- Root tests: `npm test`
- Backend install: `cd server && npm install`
- Backend dev: `cd server && npm run dev`
- Backend build: `cd server && npm run build`
- Backend tests: `cd server && npm test`
- Backend environment check: `cd server && npm run check:env`
- Backend schema check: `cd server && npm run check:schema`
- Cloudflare backend dry-run: `npm run cf:backend:check`
- Frontend navigation smoke: `npm run test:nav`
- Frontend i18n smoke: `npm run test:i18n`

## Local Run Expectations

- The Vite frontend should run on `http://localhost:3000`.
- During development, `/v1/*` proxies to `VITE_API_TARGET` or `http://localhost:4000`.
- The backend API should run on `http://localhost:4000` when started from `server/`.
- PostgreSQL-backed flows require a valid `DATABASE_URL` and migrations before backend smoke tests are meaningful.

## 72H Safety Boundaries

- Never enable real purchase, payment, wallet signature, claim, financial write, or contract activation unless explicitly approved for that exact action.
- Preview/staging success is not production approval.
- UI state, API result, and stored/backend data must match before a feature is considered fixed.
- For public user flows, verify mobile/user-facing behavior, not only code tests.

## Secrets And Production

- Do not print, commit, or copy secrets from `.env`, server env files, credentials, private keys, wallet material, API tokens, or Cloudflare/TON credentials.
- Use `.env.example` for documentation. Treat `.env` as sensitive local state.
- Production smoke can be read-only only unless explicitly approved. Canary or mutating production checks require exact approval and the intended command.
- Mainnet deployment, Merkle/root publishing, contract configuration, token transfers, and reward activation require explicit operator approval.

## Deployment Readiness

Before saying the project is ready to deploy, verify or report the status of:

- `npm run build`
- `npm run lint`
- `npm test`
- `cd server && npm run build`
- `cd server && npm test`
- `npm run cf:backend:check`
- Required environment variables and missing secrets, redacted
- Any remaining production approval gates
