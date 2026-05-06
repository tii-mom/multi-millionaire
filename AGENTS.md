# Agent Instructions

Before coding in this repository, read `CLAUDE.md` and follow it as the source of truth for project behavior, commands, and safety boundaries.

## Required Workflow

- Read the relevant docs before changing code: start with `README.md`, then use `docs/architecture.md`, `docs/api-overview.md`, or `docs/roadmap.md` when the task touches those areas.
- For non-trivial tasks, define the goal and the smallest verification gate before editing.
- Keep work surgical, simple, verified, and aligned with 72H safety boundaries.
- Do not change production, payments, wallets, contract activation, reward publishing, DNS, secrets, or user funds without explicit approval for that exact action.

## Default Commands

- Frontend dev: `npm run dev`
- Frontend build: `npm run build`
- Frontend type/lint check: `npm run lint`
- Root tests: `npm test`
- Backend dev: `cd server && npm run dev`
- Backend build: `cd server && npm run build`
- Backend tests: `cd server && npm test`
- Cloudflare backend dry-run: `npm run cf:backend:check`

## Completion Standard

Report what changed, what was verified, remaining risks, and any user approval needed before deployment or production actions.
