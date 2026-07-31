# Chain Contract Integration Plan

This document describes the Sprint 2 integration skeleton. The current Sprint 1 deposit flow remains off-chain and must keep its fake `onchainPositionId` behavior until the real integration is explicitly wired.

## Goals

- Add isolated service boundaries for LockVault, Oracle, and RewardDistributor.
- Store indexed contract logs in `chain_events` before applying domain writes.
- Map contract events to existing product tables through an explicit reconciliation step.
- Preserve current controllers, routes, frontend behavior, and tests while the chain path is still a stub.

## Contract Responsibilities

### LockVault

- Owns real token locking and position lifecycle on-chain.
- Emits `Deposited` when a user creates a lock position.
- Emits `Withdrawn` when a position is withdrawn.
- Provides source-of-truth reads for position id, wallet, amount, entry price, and withdrawal status.
- Future app writes: create or reconcile `positions`, then mark `positions.withdrawn` after finalized withdrawal logs.

### Oracle

- Owns chain-confirmed price rounds.
- Emits `PriceConfirmed` when a round is accepted on-chain.
- Provides source-of-truth reads for latest confirmed price and round metadata.
- Future app writes: confirm or upsert `price_rounds`, then trigger unlockability recalculation for positions.

### RewardDistributor

- Owns reward batch publication and claim verification on-chain.
- Emits `RewardBatchPublished` when a Merkle or equivalent reward batch is published.
- Emits `RewardClaimed` when a beneficiary claims rewards.
- Future app writes: publish `reward_batches` and mark matching `reward_ledgers` as `claimed`.

## Proposed Integration Steps

1. Add RPC and contract configuration through environment variables.
2. Add ABI-backed clients inside `server/src/services/contracts/*`.
3. Run an indexer that reads logs from configured start blocks and stores idempotent rows in `chain_events`.
4. Require a finality window before applying `chain_events` into product tables.
5. Implement event mapping in `server/src/services/indexers/chainEvents.ts`.
6. Implement reconciliation jobs under `server/src/services/reconciliation/*`.
7. Add wallet-to-user ownership resolution before `Deposited` or `RewardClaimed` writes.
8. Add dry-run reconciliation reports and backfill checks.
9. Gate real chain writes behind an explicit feature flag.
10. Only after parity tests pass, switch deposit UX/API from fake off-chain records to transaction receipt verification.

## Current Stub Boundaries

- `server/src/services/contracts/lockVault.ts` exposes the LockVault boundary but all chain calls throw `CHAIN_INTEGRATION_NOT_WIRED`.
- `server/src/services/contracts/oracle.ts` exposes the Oracle boundary but all chain calls throw `CHAIN_INTEGRATION_NOT_WIRED`.
- `server/src/services/contracts/rewardDistributor.ts` exposes the RewardDistributor boundary but all chain calls throw `CHAIN_INTEGRATION_NOT_WIRED`.
- `server/src/services/indexers/chainEvents.ts` maps normalized events to target table actions but does not write to the database.
- `server/src/services/reconciliation/positions.ts` plans position reconciliation actions but does not mutate `positions`.
- `server/migrations/100_chain_events.sql` is a draft storage layer for indexed logs and is not connected to controllers.

## Sprint 2 Environment Variables

- `CHAIN_INTEGRATION_ENABLED`: feature flag for real chain reads and writes.
- `CHAIN_ID`: expected network id.
- `CHAIN_RPC_URL`: RPC endpoint used by contract clients and indexers.
- `LOCK_VAULT_ADDRESS`: deployed LockVault contract address.
- `ORACLE_ADDRESS`: deployed Oracle contract address.
- `REWARD_DISTRIBUTOR_ADDRESS`: deployed RewardDistributor contract address.
- `CHAIN_INDEXER_START_BLOCK`: first block to scan for each configured contract.
- `CHAIN_INDEXER_CONFIRMATIONS`: block confirmations required before `finalized = true`.
- `CHAIN_INDEXER_POLL_INTERVAL_MS`: polling interval for new logs.
- `CHAIN_REORG_LOOKBACK_BLOCKS`: re-scan window for handling shallow reorgs.
- `CHAIN_OPERATOR_PRIVATE_KEY`: signer for privileged contract actions, if backend signing is approved.
- `CHAIN_GAS_LIMIT_MULTIPLIER_BPS`: optional gas-limit buffer for backend-submitted transactions.

## Non-Goals For This Skeleton

- No changes to deposit controller behavior.
- No removal of fake `onchainPositionId`.
- No route, frontend, or mainline business logic changes.
- No direct chain writes from request handlers.
- No automatic reconciliation job registration.
