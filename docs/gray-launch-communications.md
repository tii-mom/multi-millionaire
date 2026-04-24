# Limited Gray Launch Communications

This document is the operator-facing wording guardrail for the real-chain
limited gray launch path. It prevents staging/off-chain behavior from being
described as live funds or live rewards.

## Allowed Claims

- The current production-readiness branch contains the chain-gated flow for a
  limited gray launch.
- Legacy deposit and reward claim endpoints remain staging/off-chain stubs.
- Production deposits require wallet binding and a verified deposit receipt.
- Rewards use the Merkle Claim model for the gray-launch path.
- A reward is not considered claimed until a claim receipt/event is verified by
  the backend.
- Operators can pause deposits, reward claims, referral rewards, and the
  maintenance banner without redeploying.

## Prohibited Claims

- Do not say public production is live.
- Do not say deposits are real chain locks until a verified receipt has been
  applied.
- Do not say a database reward ledger is a transferable or claimable token.
- Do not say Merkle rewards are live until a published/active batch and claim
  event verifier are configured.
- Do not use screenshots that show staging records as real holdings.
- Do not promise fixed earnings, guaranteed rewards, or instant claims.

## User-Facing Status Terms

Use these terms consistently:

- `Staging record`: database-only test participation.
- `Receipt required`: wallet transaction must be submitted and verified before
  product tables are updated.
- `Review required`: receipt or risk state needs operator review; no reward or
  position should be promoted as final.
- `Proof available`: Merkle proof exists for an approved ledger in an active
  batch.
- `Claim pending`: user submitted a claim transaction, but backend has not yet
  verified the claim event.
- `Claimed`: backend verified the claim event and updated the ledger.

## Frontend Copy Guardrails

- Share surfaces may show app-recorded progress, but must not describe it as
  locked funds, wallet holdings, or active earnings until a chain receipt is
  verified.
- Referral estimates should use the MVP recommendation of `1%` of valid
  chain-confirmed locks, or be explicitly labeled as estimates.
- Rewards summaries should describe database rows as records or ledger entries,
  not transferable balances or wallet holdings.
- The legacy reward claim endpoint is a staging/off-chain stub. UI actions that
  call it must not say the user has completed an on-chain claim.
- Merkle proof availability and claim completion are separate states: proof
  availability means eligibility data exists; completion requires backend
  verification of a chain claim receipt/event.

## Support Responses

Deposit issue:

> Your transaction is only final in the app after the backend verifies the
> chain receipt, wallet ownership, wave, amount, contract address, and finality.
> If it shows review required, an operator must inspect the chain event before
> it can affect positions or rewards.

Reward issue:

> Rewards in the gray-launch path use Merkle proofs. A proof may be available
> before a claim is verified. The reward is marked claimed only after the backend
> verifies the chain claim event.

Staging/off-chain issue:

> Staging records are not chain locks and do not represent a live production
> claim. They are used for closed-beta and regression testing only.

## Pre-Announcement Checklist

- Production `/ready` passes after migrations through
  `006_merkle_rewards.sql`.
- `CHAIN_MAINLINE_WRITES_ENABLED=false` unless the canary window is approved.
- `WALLET_SIGNATURE_MODE` is not `test` or `disabled` in production.
- `CHAIN_RECEIPT_VERIFIER` is not `test` or `disabled` in production.
- `REWARD_CLAIM_MODEL=merkle`.
- Production non-mutating smoke passes.
- Staging emergency pause/restore is rehearsed.
- Canary operator, wallet, amount, wave, time window, and stop conditions are
  documented.
