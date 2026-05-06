# Contract ABI Layout

This directory documents the local ABI and wrapper layout for Sprint 2. The files here are not wired into the RC1 deposit flow and should stay as sidecar resources until the chain integration is activated deliberately.

## Recommended Structure

- `server/src/services/contracts/abi/lock-vault/lock-vault.abi.json`
- `server/src/services/contracts/abi/oracle/oracle.abi.json`
- `server/src/services/contracts/abi/reward-distributor/reward-distributor.abi.json`
- `server/src/services/contracts/abi/fixtures/`
- `server/src/services/contracts/abi/generated/`

## Naming Rules

- Keep contract folders lowercase and hyphenated.
- Keep the primary ABI filename aligned with the contract folder name.
- Store generated wrappers next to the ABI source so the loader can switch between JSON ABI and generated module output without changing the contract config shape.
- Keep sample log fixtures separate from production ABI artifacts so dry-run parsers can use them without pointing at live deployment files.

## Loader Contract

The contract config loader in `server/src/services/contracts/config.ts` expects these path families:

- `CONTRACT_ABI_DIR` as the root directory for all artifacts.
- `LOCK_VAULT_ABI_PATH` for an explicit LockVault override.
- `ORACLE_ABI_PATH` for an explicit Oracle override.
- `REWARD_DISTRIBUTOR_ABI_PATH` for an explicit RewardDistributor override.

The loader should only compute and validate paths. It should not fetch RPC data, decode chain messages, or mutate application state.

