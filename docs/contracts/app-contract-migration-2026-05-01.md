# App Contract Migration Record

Date: 2026-05-01

This repository's draft app contracts were copied into the central contract repository:

`/Users/yudeyou/Desktop/72h-capital-contracts/contracts/apps/multi-millionaire/legacy/`

Copied contract files:

- `contracts/lock_vault.tact`
- `contracts/merkle_claim.tact`
- `contracts/test_jetton.tact`

Copied tests:

- `tests/LockVault.spec.ts`
- `tests/MerkleClaim.spec.ts`
- `tests/TestJetton.spec.ts`

The central repository also now has a reserved V3 workspace:

`/Users/yudeyou/Desktop/72h-capital-contracts/contracts/apps/multi-millionaire/v3/`

## Boundary

The copied files are a frozen legacy archive, not current 72H V3 mainnet contracts and not deployable production candidates.

Current 72H V3 runtime facts used by this app:

- 72H V3 Jetton Master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- SeasonClaimV2: `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`
- Metadata URI: `ipfs://QmSzB37bf7BWRLhssq3RxaEdHQgLWb1RqdwGDkaGidFSmC`

The local `contracts/` folder remains as a legacy mirror because this repository still has local `contract:*` scripts and tests that reference it directly. Do not use it as the source of truth for current mainnet contract information.

No chain write, wallet signature, claim activation, presale activation, or funds movement was performed.
