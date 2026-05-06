# Mainnet canary dry-run checklist

This checklist is for preparing the real-funds gray launch. It is non-mutating unless an operator explicitly starts the approved canary window.

## Scope

- Use the deployed mainnet `MultiMillionaireDepositVault`/DepositVault, MerkleClaim, 72H Jetton master, DepositVault Jetton wallet, and MerkleClaim reward Jetton wallet.
- Do not use SeasonClaimV2 testnet addresses as mainnet configuration.
- Do not publish a SeasonClaimV2 production root while bridge evidence remains `bridge-forward-complete-pending-legacy-settle`.
- Do not run the mutating canary unless `PRODUCTION_CANARY_APPROVED=true` is set for a named canary window.

## Required environment gates

- `JWT_SECRET` is present and is not the development default in production.
- `CHAIN_ID=ton-mainnet`.
- `TOKEN_DECIMALS=9`.
- `WALLET_BINDING_ENABLED=true`.
- `WALLET_SIGNATURE_MODE=ton_proof`.
- `RECEIPT_VERIFICATION_ENABLED=true`.
- `CHAIN_RECEIPT_VERIFIER=ton_rpc`.
- `MERKLE_CLAIM_VERIFIER=ton_rpc`.
- `CHAIN_CANARY_ALLOWLIST` contains only the approved canary wallet.
- `CHAIN_CANARY_MAX_AMOUNT_RAW` is the approved small raw amount cap.
- `CHAIN_CANARY_WAVE_IDS` contains only the approved canary wave id.
- `MAINNET_DEPLOYMENT_EVIDENCE_RECORDED=true`.
- `CONTRACTS_EXTERNAL_AUDIT_APPROVED=true`.
- `MAINNET_CANARY_EVIDENCE_URL` points to the canary evidence record.

## Dry-run commands

```bash
cd /Users/yudeyou/Desktop/multi-millionaire/server
npm run check:env -- production --json
npm run build
npm test -- startupConfig.test.ts productionReadiness.test.ts receiptVerifier.test.ts merkleRewards.test.ts walletSignatureVerifier.test.ts --runInBand
npm run smoke:production-readonly
```

## Mutating canary gate

Before running `npm run smoke:production-canary`, confirm:

1. The canary wallet is controlled by the operator.
2. The canary amount is below `CHAIN_CANARY_MAX_AMOUNT_RAW`.
3. The target wave id is in `CHAIN_CANARY_WAVE_IDS`.
4. Pause controls are ready for deposits and reward claims.
5. The expected DepositVault target-deposit receipt and MerkleClaim claim receipt fields are documented.
6. A rollback note is prepared for pausing deposits or reward claims.

Only then set `PRODUCTION_CANARY_APPROVED=true` for the canary window and run the mutating smoke.

The DepositVault target-deposit receipt must carry season id, wave id, target
USD9, sender wallet, raw amount, query id, and the derived DepositVault
position key. Backend receipt verification must confirm `supportedTarget`,
`derivedDepositKey`, and `userState` against the configured DepositVault before
any position is applied.

## Current SeasonClaimV2 gate

SeasonClaimV2 is deployed in the current V3 mainnet set. Production Season War root publication remains blocked by operator approval and evidence review, not by the old V2 claim address.
