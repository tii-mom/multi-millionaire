# Sprint 2 Sample Data Requirements

This document defines the sample data that must be provided before the Sprint 2 sidecar can be moved from planning into implementation. The samples should match the final contract resources and must not be inferred from the RC1 off-chain stubs.

## Required Sample Data

### 1. Deposit Receipt

Provide one or more finalized deposit receipts that include:

- chain id
- tx hash
- contract address
- log index
- block number
- block time
- wallet address
- `positionId`
- `waveId`
- `amountRaw`
- `entryPrice`
- `unlockMultiplierBps`
- finality status

The sample should show a valid `Deposited` event emitted by LockVault.

### 2. `PriceConfirmed` Log

Provide one or more oracle logs or decoded events that include:

- chain id
- tx hash
- contract address
- log index
- block number
- block time
- `roundId`
- `price`
- `observedAt`
- `confirmedAt`
- finality status

The sample should represent the exact payload shape the Oracle ABI or wrapper will decode.

### 3. `RewardBatchPublished` Log

Provide one or more reward batch logs or decoded events that include:

- chain id
- tx hash
- contract address
- log index
- block number
- block time
- `batchId`
- `waveId`
- `merkleRoot`
- `totalAmountRaw`
- finality status

The sample must correspond to the reward distributor batch format used by the backend.

### 4. `RewardClaimed` Log

Provide one or more reward claim logs or decoded events that include:

- chain id
- tx hash
- contract address
- log index
- block number
- block time
- `batchId`
- `ledgerId` if emitted
- `claimantAddress`
- `amountRaw`
- finality status

The sample should demonstrate how a claimed ledger is recognized from on-chain data.

### 5. Claim Proof Example

Provide at least one claim proof sample that includes:

- proof leaf shape
- proof sibling order
- claim amount
- claimant wallet address
- batch id or batch root reference
- expected verification outcome

The proof sample should be sufficient to test the claim-path planning logic without connecting to live RPC.

## Sample Data Quality Rules

- Samples must be tied to the final contract addresses.
- Samples must be consistent with the selected chain id.
- Sample receipts and logs must be reproducible in tests.
- Sample proofs must not depend on hidden manual steps.
- Every sample should have at least one success case and one mismatch or failure case if possible.

## How Samples Will Be Used

The samples will feed these first-pass checks:

- config and ABI alignment
- parser dry-run tests
- wallet binding resolution tests
- receipt to position mapping planning
- reward batch and claim planning

## Minimum Acceptance Bar

The sample pack is complete when the following can be run against it:

- deposit receipt plan generation
- `PriceConfirmed` parse and apply-plan generation
- `RewardBatchPublished` parse and apply-plan generation
- `RewardClaimed` parse and apply-plan generation
- claim proof planning without live RPC

