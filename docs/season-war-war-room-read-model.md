# Season War War Room Read Model

Status: `DRAFT - IMPLEMENTATION TARGET`

This document defines the target read model for migrating `72h-battle-radar` into `multi-millionaire` as the `Live / War Room` module.

## Product Decision

`multi-millionaire` is the Season War main application and source of truth for user participation, squads, referrals, risk review, reward exports, and claim preview state.

`72h-battle-radar` is not a standalone production app. Its useful UI concepts should become a `Live / War Room` module inside this app.

## Target Navigation

Recommended user tabs:

- `Lock`
- `Squad`
- `Live`
- `Rewards`
- `Share`

`Live` is the War Room view.

## User Questions The War Room Must Answer

First screen must answer:

1. What wave/round is active?
2. How much time is left?
3. Am I eligible?
4. Did my lock count?
5. Which squad am I in?
6. What is my rank / squad progress?
7. What reward is pending, claimable, claimed, or disabled?
8. Why is claim disabled if disabled?
9. What data source and freshness am I seeing?
10. What should I do next?

## Minimum API Shape

### `GET /v1/season-war/current`

Returns current season/wave/round and freshness.

Fields:

- `seasonId`
- `waveId`
- `roundNumber`
- `chainRoundId`
- `status`
- `timeLeftSeconds`
- `indexerWatermark`
- `sourceFreshnessSeconds`
- `updatedAt`

### `GET /v1/season-war/seasons/:seasonId/radar`

Returns round and pool status.

Fields:

- `seasonId`
- `rounds[]`
  - `waveId`
  - `roundNumber`
  - `chainRoundId`
  - `status`: `pending | active | success | failed | settling | finalized`
  - `inventoryAtomic`
  - `routeTarget`: `SeasonClaim | FundVesting | pending`
  - `evidenceHash`
- `sourceFreshnessSeconds`
- `indexerWatermark`

### `GET /v1/season-war/seasons/:seasonId/squads`

Returns squad leaderboard.

Fields:

- `seasonId`
- `squads[]`
  - `squadId`
  - `name`
  - `rank`
  - `activatedMembers`
  - `contributionAtomic`
  - `riskSignal`

### `GET /v1/season-war/me?wallet=...`

Returns user-specific participation state.

Fields:

- `wallet`
- `verifiedWalletBinding`
- `eligible`
- `eligibilityReason`
- `qualifyingPositions[]`
- `myLockAtomic`
- `squadId`
- `squadRank`
- `referralContributionAtomic`
- `rewardEstimateAtomic`
- `riskStatus`: `clear | review | quarantined`
- `riskReason`
- `nextAction`

### `GET /v1/season-war/seasons/:seasonId/claim-preview?wallet=...`

Returns claim/proof state. This must not imply claim is open unless gates are live.

Fields:

- `snapshotId`
- `merkleRoot`
- `rootPublishable`
- `proofStatus`: `not_ready | ready | submitted | invalid | disabled`
- `claimContractVersion`: `SeasonClaim | SeasonClaimV2 | none`
- `claimContractAddress`
- `claimWindowStatus`: `not_open | open | closed`
- `unlockedBps`
- `pools`
  - `individualAtomic`
  - `squadAtomic`
  - `referralAtomic`
  - `leaderboardAtomic`
- `pendingAtomic`
- `claimableAtomic`
- `claimedAtomic`
- `disabledReason`

### `GET /v1/season-war/seasons/:seasonId/export-manifest`

Returns export provenance.

Fields:

- `manifestHash`
- `evidenceHash`
- `generatedAt`
- `successfulWaveIds[]`
- `quarantineSummary`
- `rootPublishable`

## Safety Requirements

- BigInt values must be strings in smallest 72H units.
- Every response must include source/freshness/provenance.
- Stale data must degrade visibly; never fake live status.
- Demo data must never be labeled live.
- Claim preview must clearly distinguish pending, proof-ready, claimable, claimed, and disabled.
- SeasonClaimV2 is the current V3 mainnet claim contract; production root publication still stays disabled until explicit operator approval gates pass.

## Implementation Sequence

1. Add typed read-model interfaces.
2. Add read-only controllers using existing wave/squad/reward/export services.
3. Add contract facts import from `72h-capital-contracts` public JSON or synced config.
4. Add tests for stale data, BigInt strings, risk quarantine, and claim-disabled states.
5. Add frontend `Live / War Room` tab consuming the read model.
