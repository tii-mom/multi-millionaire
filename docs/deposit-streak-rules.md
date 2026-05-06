# Deposit Streak Rules

This document is the operator-facing source of truth for the 30-day deposit streak reward.

## User Rule

- A user chooses one supported USD target before the first qualifying deposit.
- The daily target is 1% of that USD target.
- A day is complete when qualifying, unwithdrawn deposits inside that day window meet or exceed the daily target.
- Day windows are 24-hour windows starting from the first qualifying deposit time, not calendar days.
- Completion is automatic after deposits are recorded. The UI check button only inspects progress.

## Rewards

- Each 7 continuous completed days earns one weekly reward of 1,000 72H.
- Weekly rewards are capped at four per 30-day goal.
- 30 continuous completed days earns one additional monthly reward of 10,000 72H.
- Reward ledger source refs are `goalId:week:1` through `goalId:week:4` and `goalId:month`.
- Legacy refs `goalId:deposit_streak_week` and `goalId:deposit_streak_month` are treated as already claimed to avoid duplicate rewards.

## Breaks And Recovery

- A missed day resets the current continuous count.
- Already issued weekly rewards remain valid and are not clawed back.
- After a break, the next completed continuous 7-day segment can earn the next unclaimed weekly reward.
- The 30-day monthly reward requires a fresh 30-day continuous segment.
- The API exposes the most recent missed day, its window start, required USD9 amount, and deposited USD9 amount for support review.

## Operational Controls

- `pause_deposit_streak_rewards` stops new deposit streak reward ledger creation.
- Pausing does not stop users from depositing or recording progress.
- If the reward pool lacks enough remaining 72H for the next earned streak reward, progress is recorded but the reward is not created.
- Operators can find streak rewards in the admin reward list by searching `deposit_streak_week`, `deposit_streak_month`, or the reward `source_ref`.

## Support Checks

- Confirm the user's saved target and first qualifying deposit time.
- Check the current day window before comparing deposits.
- Verify deposits are qualifying, unwithdrawn, and within the day window.
- Check `source_ref` before assuming a reward is missing.
- If progress is complete but no reward exists, check `pause_deposit_streak_rewards` and reward pool remaining amount first.
