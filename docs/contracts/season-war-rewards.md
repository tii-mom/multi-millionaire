# Season War reward Merkle preparation

This document describes the server-side preparation for the 90B Season War reward integration. The source of truth is `multi-millionaire`: verified wallets, lock positions, referrals, squads, leaderboard data, and proof inputs live here. `/Users/yudeyou/Desktop/72` is only a display and navigation surface and must not be used as an allocation source or proof source.

## Mainnet contract facts

The Season War exporter targets the current 72H V3 mainnet deployment:

- Jetton Master: `EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3`
- SeasonVault: `EQCkI1atYYWN-2cnJJASJ1nKsu0ZbvCd_EVZQ61KcoIW-13l`
- SeasonClaimV2: `EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b`

The old V2 `SeasonClaim` deployment is a frozen historical archive and must not be used as the current mainnet claim contract. The legacy `MerkleClaim` reward path remains separate and must not be used for 900B Season War leaves.

`SeasonClaimV2` is now the confirmed V3 mainnet claim contract. Production root publication still requires explicit operator approval and evidence review; this repository keeps generated Season War manifests non-publishable by default.

## Round budget

Each successful round allocates `500000000000000000` raw 72H units, equal to `500,000,000 72H` with 9 decimals, across four fixed pools:

| Pool | Share | Amount raw |
| --- | ---: | ---: |
| personal | 50% | `250000000000000000` |
| team | 25% | `125000000000000000` |
| referral | 15% | `75000000000000000` |
| leaderboard | 10% | `50000000000000000` |
| total | 100% | `500000000000000000` |

The constants are defined in `server/src/services/seasonRewards.ts`:

- `SEASON_WAR_ROUND_REWARD_RAW`
- `SEASON_WAR_POOL_BPS`
- `SEASON_WAR_POOL_AMOUNTS_RAW`

`buildSeasonRewardMerkleTree` validates the full allocation by default. For a completed season, pass `successfulRoundCount` so the expected pool totals are `successfulRoundCount × per-round pool amount`. For example, 17 successful rounds require `4,250,000,000 72H` personal, `2,125,000,000 72H` team, `1,275,000,000 72H` referral, and `850,000,000 72H` leaderboard. For dry runs or previews, callers may pass `requireFullRoundAllocation: false`, but published SeasonClaim inputs should keep the default full-pool validation.

## Leaf schema

`buildSeasonRewardLeaf` produces a TON Cell hash matching the SeasonClaim contract:

1. Season War app id, currently `1` for `multi-millionaire`
2. token address
3. selected claim contract address
4. `seasonId` as `uint8`, valid range `1..10`
5. recipient wallet
6. personal amount
7. team amount
8. referral amount
9. leaderboard amount
10. total amount, computed as the four pool fields

The service returns:

- normalized `seasonId`
- `recipientWallet`
- four pool amount fields
- `totalAmountRaw`
- `leafHash`
- Merkle `proof` entries when building a tree

The total amount is not accepted from callers. It is always computed from the four pool fields to avoid drift between UI/export data and the claimable amount.

## Data sources

The allocation job should read only from `multi-millionaire` production data:

- `wallet_bindings`: verified primary recipient wallet for each user.
- `positions`: verified lock amount, wave/round membership, first qualifying lock state, and on-chain position id.
- `referrals`: inviter relationship after first qualifying lock has locked the referral.
- `squads` and `squad_members`: team membership and captain/member context.
- squad leaderboard queries: activated member count and total locked amount ordering.
- `reward_ledgers`: existing direct referral ledgers remain separate from Season War unless an explicit bridge/export is added.
- `risk_flags`: open or reviewing flags block or quarantine allocations until reviewed.

The existing reward ledger and `MerkleClaim` flow remains unchanged. Season War leaves are preparation data for a SeasonClaim-compatible contract and should not mutate existing `merkle_reward_batches` or `merkle_reward_proofs` unless a future migration intentionally adds SeasonClaim storage.

## Contribution formula

Current exporter v1 weights contributions from positions inside the operator-provided `successfulWaveIds`:

```text
user_contribution = sum(confirmed_locked_amount_raw for included successful-wave positions)
```

Equivalently, each confirmed position in an included successful wave has `eligible_successful_round_count = 1`.

If the product rule changes to let one lock carry weight across multiple successful rounds, update the exporter formula before production publication:

```text
position_contribution = confirmed_locked_amount_raw x eligible_successful_round_count
user_contribution = sum(position_contribution)
```

That change needs an explicit source of `eligible_successful_round_count` per position. The current database does not store season round success metadata, so v1 intentionally requires `--successful-wave-ids` and does not infer cross-round multipliers.

## Claim Versions

The exporter supports explicit claim contract modes:

- `--claim-version season-claim-v1`: historical SeasonClaim single-cell proof encoder. It fail-fast rejects trees above 8 leaves and requires an explicit historical SeasonClaim address.
- `--claim-version season-claim-v2`: current V3 SeasonClaimV2 ref-chain proof encoder. It keeps the same leaf schema and Merkle hash pair, stores each proof entry as `siblingOnLeft bool + sibling uint256`, and continues through at most one reference per cell.

The v2 mode allows large trees and defaults to the current V3 SeasonClaimV2 address. Manifests remain `production_root_publishable: false` until an explicit operator approval gate changes that.

Proof cell fields are versioned conservatively:

- `proofCellBase64` is the canonical field for both v1 and v2.
- `seasonClaimProofCellBase64` is a v1-only legacy alias and must equal `proofCellBase64` when present.
- v2 exports must not emit `seasonClaimProofCellBase64`.
- v1 manifests include `max_supported_single_cell_leaves` for the deployed single-cell limit; v2 manifests omit that legacy limit.

## Export command

The exporter requires the operator to provide successful wave ids because the current `waves` table does not yet store season or round success metadata:

```bash
cd /Users/yudeyou/Desktop/multi-millionaire/server
npm run season-war:export -- --claim-version season-claim-v2 --season-id 1 --successful-round-count 18 --successful-wave-ids 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18 --out ../tmp/season-war/season-1
```

The command writes:

- `manifest.json`
- `source-rows.json`
- `quarantine-rows.json`
- `leaves.json`
- `operator-register-season-claim.json`

If a non-empty budget pool has no qualified contribution, successful wave count mismatches, required addresses are missing, proof encoding cannot match the selected SeasonClaim schema, or pool totals drift, the exporter fails before writing a publishable manifest.

Historical `SeasonClaim.tact` reads proof data from one cell as consecutive `siblingOnLeft bool + sibling uint256` entries. That caps v1 rehearsal trees at 8 leaves. Do not use that V2 archive contract for current mainnet roots.

`SeasonClaimV2` reads the same proof entries but can continue through a single reference chain. Testnet 128+ leaf dry-runs can be generated with:

```bash
cd /Users/yudeyou/Desktop/multi-millionaire/server
npm run season-war:rehearsal:v2-large -- \
  --season-claim-address <confirmed-season-claim-v2-address> \
  --season-claim-v2-legacy-bridge-address <confirmed-bridge-address> \
  --chain-id ton-testnet \
  --token-address <testnet-jetton-master> \
  --evidence deployments/season-claim-v2-legacy-bridge.testnet.latest.json \
  --evidence-status bridge-forward-complete-pending-legacy-settle
```

Mainnet exports default to the current V3 SeasonClaimV2 address. Testnet rehearsals should pass the testnet `SeasonClaimV2` address explicitly and must not reuse old standalone testnet plan addresses.

## Anti-abuse rules

The allocation export must apply these checks before generating a publishable tree:

- Require a verified primary wallet for every recipient.
- Include only chain-verified lock positions for production allocation.
- Count a user once per rule bucket unless product rules explicitly allow multiple positions.
- Ignore self-referrals and referrals not locked by the invitee's first qualifying lock.
- Exclude or quarantine users, positions, and reward records with open or reviewing risk flags.
- Deduplicate recipient rows by `(seasonId, recipientWallet)` before tree generation.
- Keep team and leaderboard ranking deterministic with stable tie-breakers already used by squad queries.
- Recompute four pool totals after all filters; publish only when totals match `250000000000000000`, `125000000000000000`, `75000000000000000`, and `50000000000000000`.
- Save the input CSV or JSON, Merkle root, generated leaves, and proof file together for operator audit.

## Operator checklist

1. Export eligible Season War rows from `multi-millionaire`.
2. Normalize recipient wallets and season ids.
3. Count successful rounds in the finalized season and pass that value as `successfulRoundCount`.
4. Generate leaves with `buildSeasonRewardMerkleTree`.
5. Confirm pool totals equal `successfulRoundCount × 500000000000000000` split by 50/25/15/10.
6. Confirm `claim_contract_version`, `proof_format`, and `production_root_publishable` in the manifest.
7. Compare the Merkle root against the SeasonClaim publish transaction payload.
8. Archive the source export and generated proof artifact before enabling claims.
