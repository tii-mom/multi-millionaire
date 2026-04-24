# Sprint 2 External Resources Checklist

This checklist is the final resource intake list for Sprint 2. It does not authorize any RC1 mainline change and it does not imply chain writes are enabled.

## Required External Resources

### 1. RPC URL

- `CHAIN_RPC_URL` or equivalent production RPC endpoint
- Network name and chain id
- Auth method, if the RPC is gated
- Rate limits and expected polling budget
- Archive access requirement, if receipt or log backfill needs historical blocks
- Reorg/finality assumptions

### 2. Token Address

- 72H token contract address
- Token decimals
- Token wallet derivation rules, if the chain uses per-wallet token accounts
- Any mint/owner/admin restrictions relevant to deposit validation

### 3. LockVault Address

- Deployed LockVault contract address
- Deployment block
- Event schema for `Deposited` and `Withdrawn`
- Read methods required for position lookup
- Owner/admin policy, if any

### 4. Price Updater / Oracle

- External Oracle address is optional for the current minimal LockVault design.
- If no Oracle is used, document the owner-signed `SetPrice` policy instead.
- Deployment block, if a separate Oracle is introduced later
- Event or read schema for `PriceConfirmed`, if a separate Oracle is introduced
- Price precision and rounding rules
- Update cadence and finality expectation

### 5. MerkleClaim Address

- Deployed MerkleClaim contract address
- Deployment block
- Claim message schema and receipt parsing rules
- Merkle batch and proof format
- Batch publication policy

`RewardDistributor` is required only if the reward model changes away from the
current Merkle Claim design.

### 6. ABI / Wrapper Artifacts

- Versioned ABI JSON or generated wrapper artifacts for each contract
- Field names for event payloads
- Method names for reads and writes
- Decoder runtime assumptions
- Artifact version or commit reference

### 7. Start Blocks

- LockVault start block
- Oracle start block, if a separate Oracle is introduced
- MerkleClaim start block
- Token contract start block, if it is indexed or used for validation

### 8. Wallet Signature Standard

- Wallet provider or signing standard
- Message format for binding intent
- Signature verification method
- Address normalization rules
- Chain id encoding rules
- Expiration / nonce policy

## Resource Completeness Gate

Sprint 2 should not move into live integration work until all of the following are present:

- RPC URL
- token address
- LockVault address
- price updater policy, or Oracle address if the design changes to a separate Oracle
- MerkleClaim address
- ABI or wrapper artifacts
- start blocks
- wallet signature standard

If any one of these is missing, the sidecar remains in planning mode only.

## Handoff Order

Once the resources are available, the first implementation pass should follow this order:

1. Contract config alignment
2. ABI integration
3. Parser alignment against real samples
4. Wallet binding validation
5. Receipt to position mapping
6. `chain_events` ingest/apply planning
