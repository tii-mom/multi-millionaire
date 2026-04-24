# Receipt To Position Mapping

This document defines the Sprint 2 receipt mapping path without changing the current deposit controller. It describes how a confirmed chain receipt should become a position record later, after the RC1 line is free to consume it.

## Goal

- Derive `onchain_position_id` from a confirmed LockVault receipt.
- Avoid trusting frontend-submitted position identifiers.
- Keep idempotency at the `(chain_id, tx_hash, log_index)` level.
- Route missing wallet ownership or mismatched receipts to review instead of mutating product tables.

## Input Set

The receipt mapping layer should rely on:

- `chain_id`
- `tx_hash`
- `contract_address`
- `log_index`
- `block_number`
- `wallet_address`
- `wave_id`
- `amount_raw`
- `position_id`
- `finalized`

## Mapping Sequence

1. Fetch or accept the receipt summary.
2. Verify the contract address is the configured LockVault address.
3. Verify the event is a `Deposited` event.
4. Resolve the wallet to a verified user.
5. Verify the wave id and amount are compatible with the current product rules.
6. Derive `onchain_position_id` from the event payload.
7. Insert the normalized event into `chain_events`.
8. Apply the planned position write only after the event is finalized.

## Dry-Run Plan

The dry-run parser in `server/src/services/indexers/parsers.ts` should be able to produce the following plan shape without executing it:

- insert a `chain_events` row,
- resolve wallet ownership,
- upsert the matching `positions` row,
- mark the event for review if wallet ownership or payload validation fails.

The output must remain a plan object. It should not write business tables by itself.

## Idempotency Rules

- The same receipt must not produce two `positions` rows.
- A repeated receipt ingest should resolve to a noop after the first successful apply.
- Any receipt with a mismatched `contract_address`, `wave_id`, or wallet owner should be marked for review, not force-applied.

## Later API Shape

This mapping can eventually back a feature-flagged endpoint such as `POST /v1/waves/:waveId/deposit-receipt`, but that endpoint should not replace the current deposit stub until RC1 is complete.

