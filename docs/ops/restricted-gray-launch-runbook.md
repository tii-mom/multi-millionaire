# Restricted Gray-Launch Runbook

This runbook is for closed beta and restricted gray launch only. It does not
authorize public production, mainnet writes, Merkle root publication, token
transfer, or live reward claims.

## 1. Freeze And Review

1. Run `npm run audit:release-scope`.
2. Review every `release_review_required` and `deposit_streak` path.
3. Commit the approved release scope.
4. Confirm `git status --short` is empty.

## 2. Local Release Gates

Run:

```bash
npm run check:prelaunch
npm run lint
npm run build
npm test
cd server && npm run build
cd server && npm test -- --detectOpenHandles
cd server && npm run check:schema
npm run test:nav
npm run test:i18n
npm run cf:backend:check
```

Archive outputs with the release record.

## 3. Staging Database And Streak Rehearsal

1. Confirm a staging backup or disposable branch exists.
2. Apply migrations through `007_deposit_streaks.sql`.
3. Run `cd server && npm run check:schema`.
4. Exercise deposit streak cases:
   - 7/14/21/28 days create four weekly ledgers,
   - 30 days creates one monthly ledger,
   - broken streak resets future progress,
   - non-qualifying deposits do not count,
   - duplicate evaluation does not duplicate ledgers,
   - reward-pool exhaustion does not mark completion.

## 4. Merkle Reward Rehearsal

Draft a staging Merkle batch that includes:

- direct referral reward ledgers,
- `deposit_streak_week`,
- `deposit_streak_month`.

Verify and record:

- batch id,
- Merkle root,
- proof ids,
- `proof_available` rows,
- claim receipt test result when verifier mode is configured,
- no user-facing copy calls the ledger a token balance before claim verification.

## 5. Pause And Restore Rehearsal

Exercise and restore:

- `pause_deposits`,
- `pause_reward_claims`,
- `pause_referral_rewards`,
- `pause_deposit_streak_rewards`.

Record the admin audit log id for each update and restore.

## 6. Production Read-Only Smoke

First run the infrastructure canary profile:

```bash
API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-readonly
```

Then, after an operator has configured production active/upcoming wave and
Season War data, run the restricted gray-launch profile:

```bash
API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-gray-readonly
```

Do not register users, submit deposits, claim rewards, create Merkle batches, or
toggle admin controls in production without a separate named canary approval.

## 7. Stop Conditions

Stop the launch if any of these occur:

- `npm run check:prelaunch` fails,
- production `/ready` fails,
- `smoke:production-gray-readonly` fails when restricted gray launch is in scope,
- production bootstrap exposes `chain_mainline_writes_enabled=true` without an approved canary,
- receipt or Merkle verifier reports `test` in production,
- reward ledger copy implies claimable token balance,
- pause controls cannot be restored,
- chain/accounting state cannot be reconciled.
