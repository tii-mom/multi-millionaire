# Staging Smoke Test

## Environment Info

- Repository: `tii-mom/multi-millionaire`
- Branch: `codex/post-sprint1-stabilization-a`
- Frontend URL: `http://localhost:3000/`
- Backend URL: `http://localhost:4000/`
- Database: local PostgreSQL on port `5432`
- Database name: `millionaire`
- Migrations applied in order: `001_init.sql` -> `002_squads.sql` -> `003_rewards.sql` -> `004_risk.sql`
- Test accounts used during the smoke run:
  - `admin@example.com` / `Password123!`
  - `member@example.com` / `Password123!`
  - `risk@example.com` / `Password123!`

## Migration Order

1. `server/migrations/001_init.sql`
2. `server/migrations/002_squads.sql`
3. `server/migrations/003_rewards.sql`
4. `server/migrations/004_risk.sql`

## Smoke Test Steps

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Register admin user | `201` and JWT returned | `201` and JWT returned for `admin@example.com` | Pass |
| Login admin user | `200` and JWT returned | `200` and JWT returned | Pass |
| Claim pass | `200` and pass record returned | `200` and pass record returned | Pass |
| Create squad | `201`, creator becomes captain, captain member row created | `201`, `squadId=1`, captain auto-added | Pass |
| Join squad as member | `201` and membership created | `201`, member joined squad `1` | Pass |
| Deposit precheck | `200` with wave and price snapshot | `200`, wave live and price snapshot returned | Pass |
| Deposit qualifying amount | `201`, deposit recorded off-chain, squad activation triggered | `201`, position recorded, member activated | Pass |
| Reward summary/list | Approved reward visible for inviter | `approved_amount=10`, approved reward listed | Pass |
| Claim approved reward | `200`, reward status becomes claimed | `200`, reward moved to `claimed` | Pass |
| Trigger high-value risk | `201`, `high_value_first_lock` flag created | `201`, flag created for the first qualifying lock | Pass |
| Block reward claim on open risk | `409` with `RISK_REVIEW_REQUIRED` | `409` returned and claim blocked | Pass |
| Resolve risk flag | `200`, flag status becomes resolved | `200`, flag resolved by admin | Pass |
| Claim reward again | `200`, claim allowed after resolution | `200`, reward claimed after risk resolution | Pass |

## Problem Record

1. Docker was not available in the smoke environment.
   - Impact: the database could not be started with the repo's Docker workflow.
   - Result: used a local Homebrew PostgreSQL cluster instead.

2. The backend initially needed its Express request augmentation loaded explicitly during local startup.
   - Impact: `req.id` access in the API entrypoint could fail to compile or boot cleanly in `ts-node` runs.
   - Fix: load the Express type augmentation from `server/src/types/express.d.ts` in the app entrypoint.

## Fix Record

- Switched the smoke run to a local PostgreSQL instance on port `5432`.
- Applied migrations in the required order.
- Confirmed that `deposit` remains an off-chain recorded stub.
- Confirmed that `reward claim` remains an off-chain status update stub.
- Verified that claim blocking and release still depend on `risk_flags` state, not on-chain settlement.

## Notes

- No real chain lock or reward transfer occurred in this smoke run.
- The purpose of the run was to verify Sprint 1 data-driven flows before Sprint 2 contract integration.

