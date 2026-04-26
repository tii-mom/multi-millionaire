# Contract Responsibility Audit

This note applies the project rule "less code is safer" without changing fund-moving contract code in this pass. The goal is to mark what is core, what is operationally useful, and what should only be simplified after product and security review.

## LockVault

### Core Production Responsibilities

Keep these in the main contract:

- Accept Jetton lock deposits through `JettonTransferNotification`.
- Verify the notification comes from the configured vault Jetton wallet.
- Parse the deposit payload and bind it to a wave id.
- Derive and store a unique position id.
- Reject duplicate position ids.
- Track position owner, amount, wave id, creation time, and status.
- Allow withdrawal only when the position is unlockable.
- Maintain pause control for deposits.
- Recover pending withdrawal state on bounced Jetton transfers.
- Expose minimal getters for vault state, position state, user state, and derived position id.

These are the fund-safety boundary. They should not be removed or rewritten without full contract tests, migration planning, and independent review.

### High-Complexity Responsibilities To Retain For Now

Keep these until the product explicitly confirms target-based early withdrawal is no longer core:

- staged price update
- delayed price apply
- active price timestamp
- user active raw totals
- goal reached latch
- default target USD unlock rule

This area is the largest simplification candidate, but it affects withdrawal eligibility. Removing it changes economic behavior and must be treated as a contract redesign, not a cleanup.

### Low-Risk Operational Telemetry

These fields are not core to custody, but they are useful for ops, receipt review, and smoke evidence:

- total deposited
- total withdrawn
- total active
- deposit count
- withdrawal count
- last depositor
- last wave id
- last amount
- last position id

They can be reduced later if contract storage pressure or audit scope requires it. For now they are cheap observability and should stay.

### Candidate Future Slim Contract

If target-based early withdrawal is removed from the product, the LockVault main path can shrink to:

- Jetton deposit receipt verification
- position id uniqueness
- position state storage
- fixed lock duration withdrawal
- pause
- bounce recovery

Price, oracle, and target calculation would then move off the fund contract path.

## MerkleClaim

### Core Production Responsibilities

Keep these in the reward contract:

- owner-set active Merkle root
- reward Jetton wallet configuration
- pause control for claims
- leaf hash calculation with chain/batch/ledger/recipient/amount domain separation
- proof verification
- duplicate ledger claim prevention
- pending claim tracking
- Jetton transfer send
- bounce rollback for failed transfers
- claim state and proof-related getters

MerkleClaim is already close to the desired responsibility boundary: it proves entitlement, prevents duplicate claims, transfers rewards, and recovers state if the transfer bounces.

### Defer Slimming

Do not prioritize MerkleClaim slimming before LockVault behavior is fully classified. Reward-claim correctness depends on proof compatibility with backend batch generation and receipt verification.

## Future-Disabled Contract Modules

The following are not part of the current production-chain main path:

- external oracle contract
- reward distributor contract
- indexer-driven privileged writes

They can remain as isolated configuration drafts or future docs, but should not be required by production boot, bootstrap, or ordinary user flows unless explicitly enabled.

## Current Decision

No contract code is changed in this optimization pass. The safer first move is isolation: production only uses wallet binding, LockVault receipt verification, and Merkle claim receipts, while staging/demo paths stay behind explicit runtime gates.
