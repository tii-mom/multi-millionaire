# Sprint 2 Environment And Chain Resource Checklist

This checklist names the minimum external inputs required before Sprint 2 can move from PR #5 stubs to chain-backed reads and event application.

## Runtime Rules

- Keep `CHAIN_INTEGRATION_ENABLED=false` or unset in RC1.
- Keep `CHAIN_READ_ONLY_ENABLED`, `CHAIN_INDEXER_ENABLED`, and `CHAIN_MAINLINE_WRITES_ENABLED` off unless the corresponding sidecar path is being exercised in isolation.
- Do not put private keys in frontend env.
- Prefer `CHAIN_RPC_URL` for Sprint 2 backend code; keep `RPC_URL` as a compatibility alias while current env examples still use it.
- Treat every address and ABI as environment-specific. Mainnet, testnet, and local dev must not share contract config by accident.
- Feature flags should fail closed: missing RPC, address, or ABI disables chain reads/writes.

## Current Env Already Present

| Variable | Current use | Sprint 2 decision |
| --- | --- | --- |
| `CHAIN_ID` | Returned by app bootstrap as a display/config value. | Required. Must match wallet binding, RPC network, indexed events, and contract addresses. |
| `RPC_URL` | Present in env examples. Not used by current runtime chain logic. | Keep as alias for `CHAIN_RPC_URL` during migration. |
| `TOKEN_ADDRESS` | Returned by app bootstrap. | Required for deposit call construction and receipt validation. |
| `LOCK_VAULT_ADDRESS` | Returned by app bootstrap. | Required for LockVault reads, log filtering, and receipt validation. |
| `ORACLE_ADDRESS` | Returned by app bootstrap. | Required for oracle reads and `PriceConfirmed` indexing. |
| `REWARD_DISTRIBUTOR_ADDRESS` | Returned by app bootstrap. | Required for reward batch publication and claim indexing. |

## Core Contract Env

| Variable | Required when | Notes |
| --- | --- | --- |
| `CHAIN_INTEGRATION_ENABLED` | Any real chain access is enabled. | Default must be false. |
| `CHAIN_READ_ONLY_ENABLED` | Read-only diagnostics or receipt/read paths are exercised before writes. | Can be true while mainline writes remain disabled. |
| `CHAIN_RPC_URL` | Chain reads, receipt checks, or indexer runs. | May fall back to `RPC_URL` only in backend config. |
| `CHAIN_ID` | Always for Sprint 2 config. | Use one canonical value, for example `ton-mainnet` if the current target remains TON. |
| `TOKEN_ADDRESS` | Deposit receipt validation. | Must be the 72H token address for the same `CHAIN_ID`. |
| `LOCK_VAULT_ADDRESS` | Deposit, position, withdrawal, and unlock reads. | Must be the deployed lock vault for the same token and chain. |
| `ORACLE_ADDRESS` | Price confirmation and unlock reads. | Must emit or expose confirmed price rounds. |
| `REWARD_DISTRIBUTOR_ADDRESS` | Reward batch and claim flow. | Must match the reward proof format used by backend batches. |
| `CHAIN_INDEXER_ENABLED` | Background event ingestion runs. | Keep isolated until event apply is ready. |
| `CHAIN_MAINLINE_WRITES_ENABLED` | Backend is allowed to submit chain-backed writes. | Keep false for RC1. |

## ABI Or Contract Wrapper Env

| Variable | Required when | Notes |
| --- | --- | --- |
| `CONTRACT_ABI_DIR` | ABI files are loaded from disk. | Optional if paths below are absolute. |
| `LOCK_VAULT_ABI_PATH` | LockVault client is enabled. | Must decode `Deposited` and `Withdrawn`; must support position reads. |
| `ORACLE_ABI_PATH` | Oracle client is enabled. | Must decode `PriceConfirmed`; must support latest confirmed round reads. |
| `REWARD_DISTRIBUTOR_ABI_PATH` | RewardDistributor client is enabled. | Must decode `RewardBatchPublished` and `RewardClaimed`; must support publish/claim reads. |

If the target chain uses generated wrappers instead of ABI JSON, these variables should point to the wrapper artifact or generated module manifest used by the server build.

## Indexer Env

| Variable | Required when | Notes |
| --- | --- | --- |
| `CHAIN_INDEXER_CONFIRMATIONS` | Indexer or receipt verifier requires finality. | Used before `finalized = true`. |
| `CHAIN_REORG_LOOKBACK_BLOCKS` | Indexer handles shallow reorgs. | Must be greater than or equal to the expected reorg window. |
| `CHAIN_INDEXER_POLL_INTERVAL_MS` | Polling indexer runs. | Keep low enough for UX, high enough for RPC limits. |
| `CHAIN_INDEXER_START_BLOCK` | Single global start block is acceptable. | Prefer per-contract overrides below once deployments are known. |
| `LOCK_VAULT_START_BLOCK` | LockVault events are indexed. | Use deployment block or first relevant campaign block. |
| `ORACLE_START_BLOCK` | Oracle events are indexed. | Use deployment block. |
| `REWARD_DISTRIBUTOR_START_BLOCK` | Reward events are indexed. | Use deployment block. |

## Wallet And Receipt Env

| Variable | Required when | Notes |
| --- | --- | --- |
| `WALLET_BINDING_ENABLED` | Wallet binding endpoints are exposed. | Can be enabled before deposit migration if not required by current deposit endpoint. |
| `WALLET_BINDING_NONCE_TTL_SECONDS` | Signature challenge flow is enabled. | Suggested default: 300. |
| `WALLET_BINDING_MESSAGE_DOMAIN` | Signature challenge flow is enabled. | Should include app name and environment. |
| `RECEIPT_VERIFICATION_ENABLED` | Receipt endpoint is exposed. | Keep false until RPC, ABI, wallet binding, and event apply are ready. |
| `RECEIPT_REQUIRED_CONFIRMATIONS` | Receipt endpoint accepts finalized tx only. | May reuse `CHAIN_INDEXER_CONFIRMATIONS` if the same finality rule is acceptable. |

Frontend wallet variables depend on the wallet provider. If TON Connect is used, provide the manifest URL and any network/provider IDs separately from backend secrets.

## Operator Env

| Variable | Required when | Notes |
| --- | --- | --- |
| `CHAIN_OPERATOR_ADDRESS` | Backend prepares privileged contract calls. | Public address for allowlist and diagnostics. |
| `CHAIN_OPERATOR_PRIVATE_KEY` | Backend signs privileged transactions. | Avoid until custody and deployment policy are approved. Never expose to frontend. |
| `CHAIN_GAS_LIMIT_MULTIPLIER_BPS` | Backend submits transactions. | Optional buffer for chain-specific transaction execution. |

Operator signing is not required for the first receipt-to-position path if users submit their own LockVault deposit transactions.

## Must-Provide Chain Resources

| Resource | Required details | Blocks |
| --- | --- | --- |
| RPC | Network, URL, auth method, rate limits, archive availability, finality/reorg assumptions. | Contract reads, receipt verification, indexer. |
| 72H token address | Chain id, token address, decimals, token wallet derivation rules if applicable. | Deposit call building, amount validation. |
| LockVault | Address, deployment block, owner/admin policy, supported methods, `Deposited` and `Withdrawn` event schema. | Wallet deposit, receipt mapping, position reads, unlock status. |
| Oracle | Address, deployment block, price precision, update cadence, `PriceConfirmed` schema. | Entry/settlement price, unlock status. |
| RewardDistributor | Address, deployment block, batch format, proof format, `RewardBatchPublished` and `RewardClaimed` schema. | Reward publication and claim status. |
| ABI or wrapper artifacts | Versioned artifacts for all contracts, event names, payload field names, decoding library assumptions. | Log parsing and contract clients. |
| Contract start blocks | One block per deployed contract. | Backfill and idempotent indexing. |
| Wallet signing standard | Message format, chain id encoding, address normalization, signature verification library. | Wallet binding. |
| Test fixtures | Known tx hashes, sample deposit/price/reward logs, sample receipts, sample wallet signatures. | Unit and integration tests. |

## Readiness Checklist

- [ ] Confirm target chain id and environment naming.
- [ ] Provide RPC URL and finality/reorg settings.
- [ ] Provide 72H token address and decimals.
- [ ] Provide LockVault address, deployment block, ABI/wrapper, and sample deposit receipt.
- [ ] Provide Oracle address, deployment block, ABI/wrapper, and price precision.
- [ ] Provide RewardDistributor address, deployment block, ABI/wrapper, and reward proof format.
- [ ] Provide wallet signature standard and sample signed bind message.
- [ ] Provide deposit, price, reward batch, and reward claim fixtures that line up with the parser tests.
- [ ] Decide whether backend operator signing is in scope for Sprint 2 or postponed.
- [ ] Decide when `chain_events` and wallet migrations may be applied to shared staging.
- [ ] Keep RC1 deposit and reward claim stubs disabled from chain replacement until release freeze lifts.
