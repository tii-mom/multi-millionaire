# TON Testnet Contract Deployment - 2026-04-24

This record tracks the current testnet-only deployment line. These addresses are
not mainnet production addresses.

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
- LockVault: `kQDa42BOYHpCwoHQAWkjsmnLMXP9WxFkKjcnt1jCaz-CBae3`
- LockVault deployment LT: `65157232000003`
- LockVault Jetton wallet:
  `kQDOjELOK55pBR83xAbfkFuinoQEEdUNaJPFisFYPTR_nMwR`
- MerkleClaim: `kQClCNt7vsSq6cDSbFQha6eRcquGoLIpsebxSjC7K7e2gLRH`
- MerkleClaim deployment LT: `65157256000003`
- MerkleClaim reward Jetton wallet:
  `kQA1fYQl80IBTd_Geavn1VpuNY6_Sf8-iBEn8hudzq5hE3ut`

These are testnet-only canary addresses. The TestJetton is not the mainnet 72H
token and must not be treated as production collateral.

## Current Contract Semantics

### LockVault

- Source: `contracts/lock_vault.tact`
- ABI: `server/src/services/contracts/abi/lock-vault/lock-vault.abi.json`
- Constructor: `owner`, `tokenAddress`
- Deposit path: standard Jetton `transfer_notification` from the configured
  vault Jetton wallet only.
- Deposit forward payload: `storeBit(false)`, `waveId:uint32`,
  `positionId:uint64`.
- Withdraw path: `WithdrawPosition`, callable only by the position owner.
- Unlock condition: either the user's active raw balance multiplied by current
  `priceUsdE6` reaches the user's target, or the individual position is at least
  one year old.
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

- Date: 2026-04-24
- RPC: `https://ton-testnet.api.onfinality.io/public/jsonRPC`
- Deployer/depositor wallet:
  `kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl`
- Contract state after first canary:
  - `depositCount=1`
  - `totalDepositedRaw=1000000000`
  - `totalActiveRaw=1000000000`
  - `lastPositionId=1777039479260`
- Script-verified deposit canary:
  - amount raw: `1000`
  - wave: `1`
  - position id: `1777039939895`
  - LockVault tx hash: `9BJVuUvqZ3KpdtSMwa20JRGm3jyZUZoZ3Z1rU4e9Vcg=`
  - LT: `65161189000007`
- Backend local receipt apply:
  - database: temporary local Postgres only
  - `/health=ok`
  - `/ready=ready`
  - wallet binding: `verified` using local `WALLET_SIGNATURE_MODE=test`
  - chain event apply status: `applied`
  - position on-chain id: `1777039939895`
- Script-verified Merkle claim canary:
  - amount raw: `1000`
  - backend reward ledger id: `8b05e995-2bb1-4459-9f12-1ebd03b4621c`
  - contract batch id: `1777041213767`
  - claim tx hash: `Kidy8e/ZZR9PQHput2wQwkJxUIuhHYrtHY06sAGmK9E=`
  - LT: `65164428000003`
- Backend local claim receipt apply:
  - database: temporary local Postgres only
  - Merkle proof status: `claimed`
  - reward ledger status: `claimed`
  - chain event apply status: `applied`

The backend verifier now accepts TON RPC responses that place message bodies in
`in_msg.msg_data.body`, which is the shape returned by the testnet JSON-RPC
used for this canary.

## Mainnet Blockers

- Production TON wallet signature verification; local `WALLET_SIGNATURE_MODE=test`
  is not allowed for production.
- Frontend TonConnect transaction builders for LockVault Jetton transfer and
  MerkleClaim `ClaimReward`.
- Mainnet deployment via the admin Tonkeeper wallet only after the above passes.
