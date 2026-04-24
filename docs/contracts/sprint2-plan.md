# Sprint 2 Chain Integration Minimum Plan

This document scopes the smallest Sprint 2 path on top of PR #5 without taking over the RC1 deposit line. The current `POST /v1/waves/:waveId/deposit` behavior remains an off-chain Sprint 1 stub until the RC1 line explicitly opts into a chain-backed replacement.

## PR #5 Structure Review

PR #5 is the draft branch `codex/chain-integration-skeleton`. GitHub currently reports it as an open draft and not mergeable, and the local `main` branch has moved beyond the base commit it was opened from. Treat it as a sidecar skeleton for Sprint 2 planning, not as something to merge into the RC1 line without rebasing and review.

It adds an isolated chain integration skeleton and intentionally does not wire it into controllers, routes, frontend flows, or the existing deposit behavior.

Added structure:

| Area | Files | Current role |
| --- | --- | --- |
| Planning docs | `docs/contracts/integration-plan.md`, `docs/contracts/event-mapping.md` | Describes contract responsibilities, event mapping, and stub boundaries. |
| Sidecar design docs | `docs/contracts/wallet-binding-plan.md`, `docs/contracts/receipt-mapping.md` | Defines the wallet ownership and receipt-to-position paths without changing RC1 behavior. |
| Flow and kickoff docs | `docs/contracts/wallet-binding-flow.md`, `docs/contracts/sprint2-kickoff-checklist.md` | Turns the sidecar design into a concrete Sprint 2 handoff checklist. |
| Contract service boundaries | `server/src/services/contracts/types.ts`, `lockVault.ts`, `oracle.ts`, `rewardDistributor.ts` | Defines typed service interfaces. Calls fail closed with `CHAIN_INTEGRATION_NOT_WIRED`. |
| Wallet binding skeleton | `server/src/services/contracts/walletBinding.ts` | Fail-closed wallet binding service shell with stub state and explicit not-wired errors. |
| Contract config loader | `server/src/services/contracts/config.ts` | Pure env loader and diagnostics for chain, ABI, indexer, wallet binding, and receipt settings. |
| ABI layout | `server/src/services/contracts/abi/README.md` | Documents the expected ABI and wrapper file organization. |
| Event mapping | `server/src/services/indexers/chainEvents.ts` | Pure mapper from normalized chain events to planned domain actions. No database writes. |
| Dry-run parsers | `server/src/services/indexers/parsers.ts` | Pure parse/apply-plan helpers for deposits, oracle rounds, reward claims, and receipt mapping. |
| Fixture set | `server/src/services/indexers/fixtures/*` | Canonical deposit, price, and reward log fixtures for parser tests. |
| Position reconciliation | `server/src/services/reconciliation/positions.ts` | Pure planner for missing positions and withdrawals. No mutation. |
| Chain event storage | `server/migrations/100_chain_events.sql` | Draft `chain_events` table keyed by `(chain_id, tx_hash, log_index)`. Not applied by runtime code. |

Important boundaries:

- `server/src/controllers/positionController.ts` still generates a fake `onchainPositionId` and drives referral, squad, reward, and risk logic from the off-chain deposit request.
- `server/src/controllers/rewardController.ts` still treats reward claim as an off-chain status update.
- `server/src/controllers/appController.ts` only exposes placeholder contract addresses from env.
- There is no wallet ownership table yet. `depositPrecheck` returns `wallet.primary_wallet = null`.
- PR #5 uses the right layering for Sprint 2, but it is not yet enough to safely apply chain data into product tables.

## Prepared Sidecar Files

- `server/src/services/contracts/config.ts` can already normalize env input and return a fail-closed diagnostics object.
- `server/src/services/contracts/walletBinding.ts` already defines the wallet binding stub boundary and errors out if called.
- `server/src/services/indexers/parsers.ts` can already produce dry-run plan objects for chain events, receipt mapping, oracle round ingest, and reward claim settlement.
- `server/src/services/indexers/fixtures/*` provides repeatable log inputs for deposit, price, and reward parser tests.
- `server/src/services/contracts/abi/README.md` fixes the ABI folder layout before real artifacts land.
- `docs/contracts/wallet-binding-plan.md`, `docs/contracts/wallet-binding-flow.md`, and `docs/contracts/receipt-mapping.md` define the wallet and receipt handoff points.

## Minimum Route

### 0. Preserve the RC1 Deposit Line

Keep the current off-chain deposit endpoint intact while Sprint 2 is built beside it. Any chain-backed path should start as new services, migrations, scripts, and optionally new feature-flagged endpoints. Do not change the semantics of:

- `POST /v1/waves/:waveId/deposit`
- fake `onchainPositionId` generation
- first qualifying deposit detection
- referral locking
- squad activation
- reward ledger creation
- risk flag generation

The eventual switch should happen only after parity tests prove that chain receipts trigger the same downstream product effects as the current stub.

### 1. Contract Config

Create a single backend config module, for example `server/src/config/contracts.ts`, that normalizes:

- chain id and RPC URL,
- token, LockVault, Oracle, and RewardDistributor addresses,
- ABI or contract-wrapper paths,
- indexer start blocks and finality settings,
- feature flags for read-only chain access, event indexing, and mainline writes.

Use `CHAIN_RPC_URL` as the Sprint 2 primary name and keep `RPC_URL` as a compatibility alias because the current examples already contain `RPC_URL`. Config validation should fail closed when `CHAIN_INTEGRATION_ENABLED=true` but any required address, ABI, or RPC value is missing.

The non-invasive loader now lives in `server/src/services/contracts/config.ts`. It is meant to be consumed by future boot diagnostics, indexers, and test fixtures without touching the RC1 deposit path.

Parallel-safe output:

- config parser,
- address normalization,
- validation tests,
- bootstrap diagnostics that show configured/missing contract fields without enabling real deposit behavior.

### 2. Wallet Binding

Add wallet ownership before any `Deposited` or `RewardClaimed` event can write product state. Minimal data model:

| Field | Purpose |
| --- | --- |
| `user_id` | Existing app user. |
| `chain_id` | Network where the wallet is valid. |
| `wallet_address` | Original wallet address as supplied by wallet provider. |
| `normalized_address` | Canonical address used for lookups and uniqueness. |
| `wallet_type` | Provider or signing standard, if available. |
| `status` | `pending`, `verified`, `revoked`. |
| `is_primary` | One primary verified wallet per user and chain. |
| `verified_at` | Timestamp of successful signature verification. |

Minimal API shape:

- `POST /v1/wallet/bind-intent`: returns a nonce, domain, chain id, expiration, and exact message to sign.
- `POST /v1/wallet/bind`: verifies the signature and stores the verified wallet.
- `GET /v1/wallet/me`: returns the user's verified wallets and primary wallet.

Rules:

- Never trust a wallet address embedded in a client payload unless the signature verifies the same normalized address.
- Enforce unique `(chain_id, normalized_address)` across active verified wallets.
- Chain event apply must resolve `walletAddress` to exactly one verified user. If not, hold the event for manual review.
- Wallet binding can be developed before RC1 finishes if it is not made mandatory for the existing deposit endpoint.

### 3. ABI-Backed Contract Clients

Replace PR #5 stubs with real clients only behind config gates:

- `LockVault`: build deposit call, parse `Deposited` and `Withdrawn`, read position snapshot.
- `Oracle`: parse/read `PriceConfirmed`, read latest confirmed round.
- `RewardDistributor`: build reward batch publish call, parse/read `RewardBatchPublished` and `RewardClaimed`.

The minimum implementation should parse logs and read chain state first. Backend signing for privileged writes, such as oracle confirmation or reward batch publication, is a separate security decision and should stay disabled until operator key management is approved.

If the target chain remains TON/Tact, treat "ABI" here as the SDK artifact needed to decode messages/events and produce contract wrappers.

### 4. `chain_events` Ingest And Apply

Use PR #5's `chain_events` table as the starting point, but Sprint 2 should add apply tracking before any production use:

| Field | Reason |
| --- | --- |
| `apply_status` | `pending`, `applied`, `review_required`, `failed`, or `ignored`. |
| `applied_at` | Idempotent completion marker. |
| `apply_error` | Last failure or review reason. |
| `source_contract_role` | Safer routing than address-only checks. |

Ingest path:

1. Poll configured contracts from each start block.
2. Decode logs with contract clients.
3. Insert normalized rows keyed by `(chain_id, tx_hash, log_index)`.
4. Mark rows finalized only after configured confirmations and reorg lookback.

Apply path:

1. Select finalized `pending` events in block order.
2. Map with `mapChainEventToTargets`.
3. Resolve required domain ownership, especially wallet-to-user.
4. Write through a transaction-scoped domain service.
5. Mark `applied`, `review_required`, or `failed`.

The current dry-run parser skeleton in `server/src/services/indexers/parsers.ts` already emits this plan shape. It does not write business tables or invoke RPC.

The fixture set under `server/src/services/indexers/fixtures/` is the canonical input source for these dry-run tests.

Minimum event actions:

| Event | Required apply behavior |
| --- | --- |
| `LockVault.Deposited` | Resolve wallet, create or upsert `positions` by `onchain_position_id`, then run the same first-qualifying/referral/squad/reward/risk domain effects as deposit. |
| `LockVault.Withdrawn` | Find existing position and mark `withdrawn = true`; unmatched withdrawals go to review. |
| `Oracle.PriceConfirmed` | Upsert/confirm `price_rounds`, then trigger unlockability recomputation as a separate retryable step. |
| `RewardDistributor.RewardBatchPublished` | Match the batch to approved `reward_ledgers`, verify root and total, mark `reward_batches.status = 'published'`. |
| `RewardDistributor.RewardClaimed` | Resolve claimant wallet, match ledger or proof leaf, mark the ledger `claimed` after finality. |

### 5. Receipt To Position Mapping

Do not let the frontend submit a trusted `positionId`. The backend should derive it from a verified chain receipt.

Minimum sequence:

1. Existing `deposit-precheck` remains read-only. A future chain path may additionally return required wallet/contract readiness.
2. User signs and sends a LockVault deposit transaction from a verified wallet.
3. Frontend submits `tx_hash`, `wave_id`, and optional client-side context to a new feature-flagged endpoint, for example `POST /v1/waves/:waveId/deposit-receipt`.
4. Backend fetches the receipt from RPC and requires finality or stores it as pending.
5. Backend verifies contract address is LockVault, event is `Deposited`, wallet matches the bound user wallet, wave id matches, token amount is positive and matches the event, and `(chain_id, tx_hash, log_index)` has not already been applied.
6. Backend derives `onchain_position_id` from the event payload.
7. Backend writes `chain_events` first, then applies the event into `positions` through the shared domain service.

After RC1, the existing deposit endpoint can be migrated to call the receipt path or can be deprecated in favor of the new endpoint. Until then, the current endpoint stays unchanged.

### 6. Unlock Status Read Path

Implement unlock status as a read path before enabling withdrawals:

- Source inputs: `positions`, latest confirmed `price_rounds`, `LockVault.readPosition(positionId)`, and Oracle latest confirmed round if chain oracle is enabled.
- Response states: `locked`, `unlockable`, `withdrawn`, `pending_finality`, `review_required`, `unknown`.
- Fallback: when chain integration is disabled, return DB-derived status and explicitly mark chain status unavailable.
- No writes from the read endpoint except optional telemetry. Withdrawal state changes should come from finalized `Withdrawn` events.

Candidate endpoint after RC1 API freeze lifts:

- `GET /v1/positions/:positionId/unlock-status`

### 7. Reward Distributor Path

Keep current reward ledgers as the planning source. Sprint 2 should add:

- batch builder that selects approved ledgers,
- deterministic leaf format,
- Merkle root and total validation,
- publish intent for `RewardDistributor`,
- chain event apply for `RewardBatchPublished` and `RewardClaimed`.

Do not replace `POST /v1/rewards/:ledgerId/claim` until the distributor claim flow, proof format, and claim event mapping are tested end to end.

## Mainline Impact

| Work item | Can run in parallel now | Changes mainline behavior | Wait for RC1 |
| --- | --- | --- | --- |
| Docs and env checklist | Yes | No | No |
| Contract config parser and validation tests | Yes | No, if unused by routes | No |
| ABI-backed log parsers | Yes | No, if no runtime wiring | No |
| Pure event mapping and reconciliation tests | Yes | No | No |
| Wallet binding schema and services | Yes in branch/dev | Only if endpoints are exposed or required | Expose carefully after RC1 API freeze |
| `chain_events` migration | Prepare now | Yes if applied to shared DB | Apply after RC1 schema decision |
| Indexer dry-run script | Yes | No, if it only reports | No |
| Indexer apply job | Build behind flag | Yes when enabled | Enable after RC1 |
| New receipt endpoint | Build behind flag | Not existing deposit behavior, but API surface changes | Prefer after RC1 |
| Replacing current deposit endpoint | No | Yes | Yes |
| Switching price source to Oracle | Build read side now | Yes when used by product flows | Yes |
| RewardDistributor claim replacement | Build planning/proofs now | Yes when claim endpoint changes | Yes |

## Minimal Acceptance Criteria

- Contract config fails closed when enabled but incomplete.
- Wallet binding proves ownership by signature and creates a deterministic wallet-to-user lookup.
- Chain logs persist idempotently before domain mutation.
- `Deposited` receipt application creates exactly one position and triggers the same downstream domain effects as the current off-chain first qualifying deposit.
- Reprocessing the same receipt or event is a no-op.
- Unowned wallets, mismatched amounts, unknown contracts, and unmatched withdrawals go to review instead of mutating product tables.
- Unlock status can be read without changing withdrawal state.
- All chain-backed behavior is disabled by default in RC1 environments.
