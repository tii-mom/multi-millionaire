# Restricted Gray-Launch Environment Template

This template documents the expected production runtime posture for restricted
gray launch. Do not commit real secrets or private values.

## Base API

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=<production-postgres-or-hyperdrive-secret>
JWT_SECRET=<production-secret-at-least-16-characters>
CORS_ALLOWED_ORIGINS=https://mm.72h.lol,https://production.multi-millionaire-production.pages.dev
API_BASE_URL=https://api.mm.72h.lol
HIGH_RISK_DEPOSIT_THRESHOLD=<operator-approved-raw-threshold>
ADMIN_OPERATIONS_ENABLED=false
RISK_REVIEW_ENABLED=false
```

## Restricted Gray-Launch Chain Posture

Keep mainline writes and public launch disabled until explicit approval:

```bash
PRODUCTION_PUBLIC_LAUNCH_ENABLED=false
ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED=false
CHAIN_MAINLINE_WRITES_ENABLED=false
CHAIN_INTEGRATION_ENABLED=false
CHAIN_READ_ONLY_ENABLED=false
CHAIN_INDEXER_ENABLED=false
```

Document chain resources even when writes are disabled:

```bash
CHAIN_ID=ton-mainnet
CHAIN_RPC_URL=<production-rpc-url>
TON_TRANSACTIONS_API_URL=<transactions-api-url-if-rpc-is-not-toncenter-v3-compatible>
TOKEN_ADDRESS=<72h-mainnet-jetton-master>
TOKEN_DECIMALS=9
DEPOSIT_VAULT_ADDRESS=<mainnet-deposit-vault-address>
DEPOSIT_VAULT_JETTON_WALLET_ADDRESS=<derived-vault-jetton-wallet>
MERKLE_CLAIM_ADDRESS=<mainnet-merkle-claim-address>
REWARD_JETTON_WALLET_ADDRESS=<derived-merkle-claim-jetton-wallet>
REWARD_CLAIM_MODEL=merkle
```

## Receipt And Claim Verification

For closed beta without real chain writes:

```bash
WALLET_BINDING_ENABLED=false
WALLET_SIGNATURE_MODE=disabled
WALLET_BINDING_MESSAGE_DOMAIN=
RECEIPT_VERIFICATION_ENABLED=false
CHAIN_RECEIPT_VERIFIER=disabled
MERKLE_CLAIM_VERIFIER=disabled
RECEIPT_REQUIRED_CONFIRMATIONS=12
```

For an approved chain canary only:

```bash
WALLET_BINDING_ENABLED=true
WALLET_SIGNATURE_MODE=ton_proof
WALLET_BINDING_MESSAGE_DOMAIN=mm.72h.lol
RECEIPT_VERIFICATION_ENABLED=true
CHAIN_RECEIPT_VERIFIER=ton_rpc
MERKLE_CLAIM_VERIFIER=ton_rpc
```

## Canary Approval

Only set these for a named operator canary window:

```bash
CHAIN_CANARY_ALLOWLIST=<approved-wallet-addresses>
CHAIN_CANARY_MAX_AMOUNT_RAW=<small-amount-cap>
CHAIN_CANARY_WAVE_IDS=<approved-wave-ids>
MAINNET_DEPLOYMENT_EVIDENCE_RECORDED=true
CONTRACTS_EXTERNAL_AUDIT_APPROVED=true
PRODUCTION_CANARY_APPROVED=true
MAINNET_CANARY_EVIDENCE_URL=<evidence-url-or-artifact-path>
```

## Required Checks

```bash
cd server && npm run check:env -- production --json
npm run check:prelaunch -- production --json
API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-readonly
API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-gray-readonly
```

`smoke:production-readonly` is the infrastructure canary and does not require
campaign data. `smoke:production-gray-readonly` is the restricted gray-launch
gate and requires production active/upcoming wave and Season War data.
