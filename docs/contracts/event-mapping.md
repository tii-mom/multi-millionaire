# Contract Event Mapping

Contract logs should first be persisted into `chain_events` with `(chain_id, tx_hash, log_index)` as the idempotency key. Domain writes should only happen after the event is finalized and reconciliation has resolved wallet ownership and duplicate handling.

## Chain Event Storage

`chain_events` stores the raw normalized log:

- `chain_id`: network id that emitted the event.
- `contract_address`: emitting contract.
- `event_name`: decoded contract event name.
- `tx_hash`: transaction hash.
- `log_index`: event log index inside the transaction.
- `block_number`: source block number.
- `payload_json`: decoded event payload.
- `block_time`: source block timestamp.
- `finalized`: whether the configured confirmation window has elapsed.
- `created_at`: database insertion time.

## Deposited -> positions

Source: `LockVault.Deposited`

Expected payload:

- `positionId`
- `walletAddress`
- `userId` after wallet ownership resolution
- `waveId`
- `amountRaw`
- `entryPrice`
- `unlockMultiplierBps`

Target behavior:

- Upsert or create a `positions` row keyed by `onchain_position_id`.
- Preserve idempotency by processing each `(chain_id, tx_hash, log_index)` once.
- Do not replace the Sprint 1 fake `onchainPositionId` path until the deposit API is explicitly migrated.
- If the wallet cannot be resolved to a user, leave the event pending review instead of creating a position.

## Withdrawn -> positions.withdrawn

Source: `LockVault.Withdrawn`

Expected payload:

- `positionId`
- `walletAddress`
- `amountRaw`

Target behavior:

- Find the `positions` row by `onchain_position_id`.
- Set `positions.withdrawn = true` after finality.
- If no matching position exists, mark for reconciliation review rather than creating a withdrawal-only row.
- Reprocessing should be a no-op when the position is already withdrawn.

## PriceConfirmed -> price_rounds + unlockability

Source: `Oracle.PriceConfirmed`

Expected payload:

- `roundId`
- `price`
- `observedAt`
- `confirmedAt`

Target behavior:

- Upsert or confirm `price_rounds` with `status = 'confirmed'`.
- Preserve existing admin price flow until the chain oracle feature flag is enabled.
- Trigger unlockability recalculation after the price round is finalized and persisted.
- Keep unlockability as a separate domain step so price ingestion can be retried safely.

## RewardBatchPublished -> reward_batches

Source: `RewardDistributor.RewardBatchPublished`

Expected payload:

- `batchId`
- `waveId`
- `merkleRoot`
- `totalAmountRaw`

Target behavior:

- Upsert or mark the matching `reward_batches` row as `published`.
- Confirm the published total against approved `reward_ledgers` before exposing claims.
- Treat mismatched totals or roots as reconciliation failures.

## RewardClaimed -> reward_ledgers claimed

Source: `RewardDistributor.RewardClaimed`

Expected payload:

- `batchId`
- `ledgerId` if emitted or recoverable from the proof leaf
- `claimantAddress`
- `amountRaw`

Target behavior:

- Resolve `claimantAddress` to the ledger beneficiary.
- Find the matching `reward_ledgers` row by `ledgerId` or deterministic batch leaf data.
- Set `reward_ledgers.status = 'claimed'` after finality.
- If the ledger is missing, owned by a different user, or already rejected, hold the event for manual reconciliation.
