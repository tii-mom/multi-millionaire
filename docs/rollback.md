# Rollback Runbook

Use this when a staging or production deploy fails health, readiness, or smoke checks.

## Immediate Actions

1. Stop promotion. Do not continue to frontend promotion if API smoke fails.
2. Capture the failing command output and API request IDs from responses.
3. Check:

```bash
curl -fsS "$API_BASE_URL/health"
curl -fsS "$API_BASE_URL/ready"
```

4. If readiness fails, remove the new API version from traffic or scale it down.

## Application Rollback

1. Redeploy the previous known-good API artifact, container tag, or platform deployment.
2. Confirm `/health` returns `status: ok`.
3. Confirm `/ready` returns `status: ready` and `database: ok`.
4. Re-run the smoke script only against staging:

```bash
API_BASE_URL="$API_BASE_URL" npm run smoke
```

For production, run only non-mutating checks unless an explicit production smoke window has been approved.

## Emergency Controls

If user-facing behavior is unsafe but the platform remains reachable, pause
affected flows before rollback:

- `pause_deposits`
- `pause_reward_claims`
- `pause_referral_rewards`
- `maintenance_banner`

Environment variable overrides are available through `PAUSE_DEPOSITS`,
`PAUSE_REWARD_CLAIMS`, and `PAUSE_REFERRAL_REWARDS`.

## Database Rollback

The current migration tool supports `up` and controlled `reset`; it does not provide down migrations. The rollback strategy is:

1. Prefer application rollback when migrations are backward-compatible.
2. If a migration caused data or schema damage, restore the database from the pre-deploy snapshot.
3. If restore is not acceptable, prepare a forward-fix migration and test it against a staging copy first.

Do not run `npm run migrate:reset` against production. It drops application tables and is only guarded for local/staging rehearsal use.

## Data Safety

- Take or confirm a database snapshot before staging and production migrations.
- Record the exact migration filenames applied.
- Keep the failing release marker, commit SHA, and smoke `run_id` in the incident notes.
- Do not manually edit reward ledgers or risk flags during rollback unless an incident owner approves the change.

## Stub Boundaries During Rollback

- Deposit records are database rows, not chain positions.
- Reward claims are database status changes, not token transfers.
- There is no on-chain reversal path for RC1 because no on-chain lock or reward transfer is executed by the current API stubs.

For production chain releases, rollback cannot undo finalized chain
transactions. The incident owner must separate application rollback from chain
reconciliation and user support.
