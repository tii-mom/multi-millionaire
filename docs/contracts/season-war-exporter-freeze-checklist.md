# Season War exporter freeze checklist

Scope as of April 28, 2026:

- Freeze exporter-side SeasonClaim v1/v2 proof changes only.
- Do not write `.env`.
- Do not enter chain rehearsal.
- Do not treat old `deployments/season-claim-v2.testnet.plan.json` addresses as final.
- Wait for the bridge-focused testnet rehearsal to provide new `SeasonClaimV2` and `SeasonClaimV2LegacyBridge` addresses.

## Contract baseline

- Contract repository observed at commit `a98841f`.
- Active candidates include `SeasonClaimV2` and `SeasonClaimV2LegacyBridge`.
- `SeasonClaimV2` code hash changed after adding the `ConfirmSeasonClaimFunding` receipt.
- Old standalone testnet `SeasonClaimV2` address and evidence are historical only.

## Proof and field strategy

- Leaf schema remains unchanged.
- Merkle hash pair remains unchanged.
- Proof entry format remains `siblingOnLeft bool + sibling uint256`.
- `proofCellBase64` is the canonical proof-cell field for both `season-claim-v1` and `season-claim-v2`.
- `seasonClaimProofCellBase64` is retained only as a v1 legacy alias and must equal `proofCellBase64`.
- v2 exports do not emit `seasonClaimProofCellBase64`.
- v1 keeps the deployed single-cell encoder and fails above 8 leaves.
- v2 uses the ref-chain encoder and can support large trees.
- v2 ref-chain cells store one or more proof entries per cell and use at most one continuation ref.
- The proof format is not the legacy `MerkleClaim` schema.

## Manifest strategy

- `claim_contract_version` is required.
- `proof_format` is required.
- `production_root_publishable` remains `false` until audit, bridge-focused testnet rehearsal, and mainnet deployment are complete.
- v1 manifests include `max_supported_single_cell_leaves`.
- v2 manifests omit `max_supported_single_cell_leaves`.
- v2 manifests keep the deployed mainnet SeasonClaim v1 address under `contracts.season_claim_address`.
- v2 manifests use `contracts.season_claim_v2_address` and `contracts.selected_claim_contract_address` for the selected V2 address.
- v2 testnet evidence artifacts record the bridge address and evidence status when provided.
- The general exporter defaults to the current V3 SeasonClaimV2 address for mainnet. Non-publishable testnet rehearsals must pass explicit testnet addresses.
- The v2-large rehearsal script requires an explicit `--season-claim-address` so the next artifact binds to the confirmed V2 address.

## Tests

- v1 exports above 8 leaves fail fast.
- v2 128-leaf exports emit `proofCellBase64`.
- v2 proof root recomputation matches the manifest root.
- v2 proof encoding does not change leaf hash generation.
- v1/v2 proof encoders are separate and do not use the old `MerkleClaim` schema.
- Explicit v2 `--season-claim-address` changes leaf hashes and root, confirming address binding.

## Next gated step

After the contract thread finishes bridge-focused testnet rehearsal:

1. Receive the new testnet `SeasonClaimV2` address.
2. Receive the new testnet `SeasonClaimV2LegacyBridge` address.
3. Regenerate the v2-large rehearsal artifact with the new `SeasonClaimV2` address.
4. Confirm `claim_contract_version = season-claim-v2`.
5. Confirm `production_root_publishable = false`.
6. Confirm `leafCount >= 128`.
7. Confirm leaf hashes bind to the new `SeasonClaimV2` address.
8. Keep `.env` unchanged unless the address is explicitly approved for configuration.

## Current blockers

- New bridge-focused testnet `SeasonClaimV2` address is not yet confirmed.
- New bridge-focused testnet `SeasonClaimV2LegacyBridge` address is not yet confirmed.
- Audit and mainnet deployment are not complete.
- No production root is publishable yet.
