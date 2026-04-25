# TON Testnet Contract Deployment - 2026-04-24

This record tracks the current testnet-only deployment line. These addresses are
not mainnet production addresses.

Latest audit-remediated redeploy: 2026-04-25.

## Network

- Chain: `ton-testnet`
- RPC used for deployment: `https://ton-testnet.api.onfinality.io/public/jsonRPC`
- Admin wallet: `kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl`
- Mainnet deployment: not performed

## Current Testnet Addresses

- TestJetton master: `kQAaCCxV8V_naWdAtURJnZ683QFXlGTiTCEHukthk8r_PBec`
- TestJetton deploy LT: `65157150000003`
- Admin/deployer test Jetton wallet:
  `kQBvlJbxzzjc6cEDd1CsJ-53Ga7R3aPZZIyK9AMCafzgK_If`
- LockVault: `kQDh7ZqTP9y3zryvqfYGxSFN2ePIB8bo1xFy4M_BX3L2uVb9`
- LockVault deployment LT: `65315187000006`
- LockVault Jetton wallet:
  `kQD-46x_6K_uogYHHDmkk0WR_ouYcwUVW0ihK6H2XHyg6ytE`
- MerkleClaim: `kQDJUBxBPTZGQjuz0MBzyyT4E9MDkgdXoPlqtz-zq4RDYpjF`
- MerkleClaim deployment LT: `65315245000003`
- MerkleClaim reward Jetton wallet:
  `kQB8erGp7_WxOfHI7E9Gr_yBl-ZYgvyZ7tTM4cALOfuK89fm`

These are testnet-only canary addresses. The TestJetton is not the mainnet 72H
token and must not be treated as production collateral.

## Current Contract Semantics

### LockVault

- Source: `contracts/lock_vault.tact`
- ABI: `server/src/services/contracts/abi/lock-vault/lock-vault.abi.json`
- Constructor: `owner`, `tokenAddress`
- Deposit path: standard Jetton `transfer_notification` from the configured
  vault Jetton wallet only.
- Deposit forward payload: `storeBit(false)`, `waveId:uint32`.
- Position id: derived by the contract from `(sender, jettonTransferQueryId)`;
  clients no longer submit or choose `positionId`.
- Withdraw path: `WithdrawPosition`, callable only by the position owner.
- Unlock condition: either the user's active raw balance multiplied by a fresh
  active price reaches the fixed `DEFAULT_TARGET_USD_E6=1000000000000`
  target, or the individual position is at least one year old.
- Price path: owner stages a price, waits at least one hour, then applies it;
  one update may not move more than 20%, and prices older than 24 hours cannot
  unlock by price.
- Withdrawal state: positions move through `active -> withdrawing -> withdrawn`;
  bounce recovery restores a pending withdrawal to `active` so the owner can
  retry.
- Cycle rule: after a user's goal is reached, new deposits are blocked until the
  active cycle is fully withdrawn. Once active balance returns to zero, the next
  deposit starts a new locked cycle.

### MerkleClaim

- Source: `contracts/merkle_claim.tact`
- ABI: `server/src/services/contracts/abi/merkle-claim/merkle-claim.abi.json`
- Constructor: `owner`, `tokenAddress`
- Reward path: user sends `ClaimReward` with `batchId`, `ledgerIdHash`,
  `recipient`, `amountRaw`, and proof cell.
- The contract verifies the active Merkle root, blocks duplicate ledgers, and
  transfers Jettons from its configured reward Jetton wallet to the claimant.
- Merkle leaf domain includes chain id hash, token address, claim contract,
  batch id, ledger id hash, recipient, and raw amount.
- Proofs are encoded as a ref chain so batches are not limited to a few leaves.
- Claim state moves through `unclaimed -> claiming -> claimed`; bounce recovery
  restores a pending claim to `unclaimed`.

## Fresh Testnet Canary Flow

The canary must use a real testnet Jetton master. Do not use the admin wallet as
a placeholder token address. If no external testnet 72H Jetton exists, deploy
the repository's `TestJettonMaster`; it is for testnet canary only and must not
be used as the mainnet 72H token.

1. Provide `TOKEN_ADDRESS_TESTNET` or deploy a testnet-only Jetton:

```bash
UPDATE_ENV=true npm run contract:deploy:testnet-jetton
```

The deploy script also mints a small test balance to the deployer by default.
Override the recipient or amount with `TESTNET_JETTON_MINT_RECIPIENT` and
`TESTNET_JETTON_MINT_AMOUNT_RAW`.

2. Build contracts:

```bash
npm run contract:build
```

3. Deploy contracts:

```bash
UPDATE_ENV=true npm run contract:deploy:testnet
```

4. Derive LockVault and MerkleClaim Jetton wallet addresses from the testnet
   Jetton master:

```bash
UPDATE_ENV=true npm run contract:jetton-wallets:testnet
```

5. Configure the deployed contracts with those Jetton wallets:

```bash
npm run contract:configure:testnet
```

Optionally set the testnet unlock price in the same step:

```bash
LOCK_VAULT_PRICE_USD_E6_TESTNET=1000 npm run contract:configure:testnet
```

6. Fund the depositor's testnet Jetton wallet and, for rewards, fund
   MerkleClaim's reward Jetton wallet.
7. Send one small canary deposit:

```bash
TESTNET_CANARY_WAVE_ID=1 \
TESTNET_CANARY_AMOUNT_RAW=<small_raw_amount> \
npm run contract:canary:deposit:testnet
```

The script submits a standard Jetton transfer to the user's Jetton wallet with
`destination=LockVault`, then polls LockVault transactions and prints the
receipt hash for backend `/v1/waves/:waveId/deposit-receipt`.

8. Send one small Merkle claim canary:

```bash
CHAIN_RPC_URL=https://ton-testnet.api.onfinality.io/public/jsonRPC \
TESTNET_CLAIM_AMOUNT_RAW=<small_raw_amount> \
TESTNET_CLAIM_LEDGER_ID=<backend_reward_ledger_uuid> \
npx tsx scripts/sendTestnetClaim.ts
```

The claim script sets a single-leaf Merkle root, funds the MerkleClaim reward
Jetton wallet if the repository `TestJettonMaster` is used, sends `ClaimReward`,
and prints the claim receipt hash for backend
`/v1/rewards/:ledgerId/claim-receipt`.

## Latest Testnet Canary Evidence

- Date: 2026-04-25
- RPC: `https://ton-testnet.api.onfinality.io/public/jsonRPC`
- Deployer/depositor wallet:
  `kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl`
- Contract state after latest canary:
  - `depositCount=1`
  - `totalDepositedRaw=1`
  - `totalActiveRaw=1`
  - `lastPositionId=9545445453761711350029784004168846980214745002146771544146829047662825645999`
- Script-verified deposit canary:
  - amount raw: `1`
  - wave: `1`
  - query id: `1777101618086`
  - position id: `9545445453761711350029784004168846980214745002146771544146829047662825645999`
  - LockVault tx hash: `PeM9BAhtQjYqOtRjuvniVhqQkETeTLTHmOLv1YmLQt8=`
  - LT: `65317654000007`
- Script-verified position getter:
  - owner: `kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl`
  - amount raw: `1`
  - wave: `1`
  - status: `0` (`active`)
- Backend local receipt apply:
  - direct backend `ton_rpc` verifier: `passed`
  - database apply: pending. Count as complete only after
    `RUN_RECEIPT_APPLY_INTEGRATION=true` passes against a safe isolated test
    database.
- Script-verified Merkle claim canary:
  - amount raw: `1`
  - backend reward ledger id placeholder: `testnet-canary-1777101812106`
  - contract batch id: `1777101812106`
  - ledger id hash:
    `0xc87449cb960f7af2280686a7addf91c0bed6b01cbf7f5a33314b496681c1c3ba`
  - Merkle root:
    `0x4a7662f392aabea40cadfebd0976cec46e8f5a46beda09cbf4803b4cfa1260e0`
  - claim tx hash: `XYvh+RnvK2zA1QkMKeyxUV2C7rkllE026yMQmm6XLec=`
  - LT: `65318218000003`
- Script-verified Merkle getter:
  - `activeBatchId=1777101812106`
  - `claimCount=1`
  - `totalClaimedRaw=1`
  - ledger status: `2` (`claimed`)
- Backend local claim receipt apply:
  - direct backend `ton_rpc` verifier: `passed`
  - database apply: pending. Count as complete only after
    `RUN_RECEIPT_APPLY_INTEGRATION=true` passes against a safe isolated test
    database.

The backend verifier now accepts TON RPC responses that place message bodies in
`in_msg.msg_data.body`, which is the shape returned by the testnet JSON-RPC
used for this canary.

## Optional Receipt Apply Integration Harness

The database apply portion remains pending by default. To produce evidence, run
the skipped integration harness against a migrated throwaway PostgreSQL
database whose database name clearly indicates `test`, `integration`, `ci`, or
`isolated`:

```bash
cd server
NODE_ENV=test \
RUN_RECEIPT_APPLY_INTEGRATION=true \
DATABASE_URL="postgres://.../multi_millionaire_receipt_apply_test" \
npm test -- receiptApply.integration.test.ts
```

The harness refuses `NODE_ENV=production` and refuses non-test database names.
It also refuses remote database hosts unless
`ALLOW_REMOTE_RECEIPT_APPLY_INTEGRATION_DB=true` is set for a throwaway
non-production database. It does not use production data. It seeds fixed test
rows, applies one verified deposit receipt and one verified Merkle claim receipt
through the real Express apply endpoints, verifies duplicate receipts do not
create a second applied state, then removes the seeded rows.

## Mainnet Deployment Evidence Template

Mainnet deployment has not been performed. When it is approved, capture the
following fields from the actual deploy scripts and RPC/provider output:

- Deployment timestamp:
- Network/chain id: `ton-mainnet`
- RPC/provider endpoint and account/project:
- Deployer/admin wallet:
- LockVault deployment tx hash:
- LockVault deployment LT:
- LockVault block time:
- Actual LockVault address:
- MerkleClaim deployment tx hash:
- MerkleClaim deployment LT:
- MerkleClaim block time:
- Actual MerkleClaim address:
- 72H token master address:
- LockVault Jetton wallet derivation:
- MerkleClaim Jetton wallet derivation:
- Getter verification:
  - LockVault owner:
  - LockVault token address:
  - LockVault Jetton wallet:
  - MerkleClaim owner:
  - MerkleClaim token address:
  - MerkleClaim reward Jetton wallet:
- Contract code/build hash:
  - LockVault:
  - MerkleClaim:
- Build command and git commit:
- Script output/evidence path:
- Operator/reviewer signoff:

## Mainnet Blockers

- Independent security review of the audit-remediated LockVault and MerkleClaim
  contracts.
- Backend database apply for deposit and claim receipts against an isolated
  test database.
- Production TON wallet proof smoke against real TonConnect payloads.
- Mainnet deployment via the admin Tonkeeper wallet only after the above passes.
