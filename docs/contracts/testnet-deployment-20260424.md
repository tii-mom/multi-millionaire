# TON Testnet Contract Deployment - 2026-04-24

This record captures the current testnet-only contract deployment. These
addresses are not mainnet production addresses.

## Network

- Chain: `ton-testnet`
- RPC used for deployment: `https://ton-testnet.api.onfinality.io/public/jsonRPC`
- Admin wallet: `kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl`
- Mainnet deployment: not performed

## Contracts

### LockVault

- Address: `kQDdFuJo_tCecQe0ejR7iyTKd8ld5A6ur25jRdO6sGcEklRt`
- Deployment LT: `65129793000003`
- Source: `contracts/lock_vault.tact`
- ABI: `server/src/services/contracts/abi/lock-vault/lock-vault.abi.json`

Messages:

- `Deposit`
  - opcode: `0x4c4f434b`
  - fields: `queryId:uint64`, `waveId:uint32`, `amountRaw:uint128`,
    `positionId:uint64`
- `SetPaused`
  - opcode: `0x50415553`
  - fields: `paused:bool`

Current limitation:

- This testnet contract records receipt data and pause state. It does not yet
  custody Jettons through a Jetton wallet transfer notification path.

### MerkleClaim

- Address: `kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg`
- Deployment LT: `65129811000003`
- Source: `contracts/merkle_claim.tact`
- ABI: `server/src/services/contracts/abi/merkle-claim/merkle-claim.abi.json`

Messages:

- `SetMerkleRoot`
  - opcode: `0x524f4f54`
  - fields: `batchId:uint64`, `merkleRoot:uint256`
- `ClaimReward`
  - opcode: `0x434c414d`
  - fields: `queryId:uint64`, `batchId:uint64`, `ledgerIdHash:uint256`,
    `amountRaw:uint128`, `leafHash:uint256`
- `SetPaused`
  - opcode: `0x50415553`
  - fields: `paused:bool`

Current limitation:

- This testnet contract records root and claim receipt state. It does not yet
  verify Merkle proof paths on-chain and does not transfer Jettons.

## Verification

- `npm run contract:build`
- `npm run contract:test`

## Mainnet Blockers

- Implement Jetton transfer notification handling for LockVault.
- Implement or intentionally replace on-chain Merkle proof verification.
- Add backend verifier support for TON transaction parsing.
- Use a new non-public mainnet admin wallet. The testnet mnemonic used during
  this deployment must not be used for mainnet funds.
