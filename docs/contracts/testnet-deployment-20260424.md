# TON Testnet Contract Deployment - 2026-04-24

This record tracks the current testnet-only deployment line. These addresses are
not mainnet production addresses.

## Network

- Chain: `ton-testnet`
- RPC used for deployment: `https://ton-testnet.api.onfinality.io/public/jsonRPC`
- Admin wallet: `kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl`
- Mainnet deployment: not performed

## Current Testnet Addresses

- LockVault: `kQDdFuJo_tCecQe0ejR7iyTKd8ld5A6ur25jRdO6sGcEklRt`
- LockVault deployment LT: `65129793000003`
- MerkleClaim: `kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg`
- MerkleClaim deployment LT: `65129811000003`

These addresses were produced by an earlier testnet deployment. Because the
contract code has since changed to real Jetton custody and Merkle proof
verification, a fresh testnet deployment is required before canary evidence can
be treated as valid.

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

## Mainnet Blockers

- Fresh testnet deployment with current code.
- Testnet 72H Jetton master address, or an intentionally deployed testnet-only
  Jetton master.
- Testnet canary deposit receipt verified by backend `CHAIN_RECEIPT_VERIFIER=ton_rpc`.
- Merkle claim canary with an active backend batch and verified on-chain claim
  receipt.
- Frontend TonConnect transaction builders for deposit and claim, or a limited
  operator canary flow documented separately.
- Mainnet deployment via the admin Tonkeeper wallet only after the above passes.
