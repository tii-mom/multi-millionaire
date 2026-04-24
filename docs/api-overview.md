# API Overview

All application APIs are served under `/v1`. Responses use the shape:

```json
{
  "request_id": "abc123",
  "data": {}
}
```

Errors use:

```json
{
  "request_id": "abc123",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Authenticated endpoints require `Authorization: Bearer <jwt>`.

## Existing Baseline APIs

### App

- `GET /v1/app/bootstrap`: server time, contract placeholders, current wave, latest price, feature flags.

### Auth

- `POST /v1/auth/register`: create account and return JWT.
- `POST /v1/auth/login`: login and return JWT.

### Waves And Deposit

- `GET /v1/waves/current`: current live or upcoming wave.
- `GET /v1/waves/:waveId`: wave by ID.
- `POST /v1/waves/:waveId/passes`: claim a Rush Pass for the authenticated user.
- `POST /v1/waves/:waveId/deposit-precheck`: check wave and price availability for deposit.
- `POST /v1/waves/:waveId/deposit`: record an off-chain MVP deposit stub.
- `POST /v1/waves/:waveId/deposit-receipt`: submit a chain deposit receipt for verification and position application. This fails closed unless receipt verification is explicitly enabled.

### Wallet Binding

- `POST /v1/wallet/bind-intent`: create a wallet binding nonce and signable message.
- `POST /v1/wallet/bind`: verify a wallet signature and store a verified wallet binding. This fails closed unless a signature verifier mode is configured.
- `GET /v1/wallet/me`: list the authenticated user's verified wallets.

### Referrals

- `POST /v1/referrals/confirm`: bind inviter by email before the invitee's first qualifying deposit.

### Prices

- `GET /v1/prices/latest`: latest confirmed price round.

## Sprint 1 APIs

### Squads

- `POST /v1/waves/:waveId/squads`: create a squad; creator becomes captain and is inserted into `squad_members`.
- `GET /v1/waves/:waveId/squads`: list squads with `activated_member_count`, `total_locked`, and `rank`.
- `POST /v1/waves/:waveId/squads/:squadId/join`: join an open squad; one membership per user per wave.

Leaderboard ordering:

1. `activated_member_count DESC`
2. `total_locked DESC`
3. `created_at ASC`

### Rewards

- `GET /v1/rewards/summary`: current user's pending, approved, and claimed reward totals.
- `GET /v1/rewards?status=approved`: current user's reward ledgers, optionally filtered by status.
- `POST /v1/rewards/:ledgerId/claim`: claim an approved reward ledger through an off-chain status update stub.

When production chain writes are required, the off-chain reward claim endpoint
fails closed. Production reward status must follow a chain-backed or proof-backed
reward distribution flow.

Direct referral rewards are generated only when a referred user makes their first qualifying deposit and the inviter is not the same user.

### Risk

Risk endpoints are admin-only. The authenticated user's email must be listed in `ADMIN_EMAILS`.

- `GET /v1/risk/flags?entity_type=user&status=open`: list risk flags with optional filters.
- `POST /v1/risk/flags`: create a manual risk flag.
- `PATCH /v1/risk/flags/:flagId`: update risk flag status, severity, or note.

### Admin Operations

- `GET /v1/admin/controls`: list emergency controls.
- `PATCH /v1/admin/controls/:key`: update an emergency control such as `pause_deposits`, `pause_reward_claims`, `pause_referral_rewards`, or `maintenance_banner`.
- `GET /v1/admin/audit-logs`: list recent admin audit logs.
- `GET /v1/admin/chain-events`: list chain event apply/review records.

Automatic Sprint 1 flags:

- `self_referral_attempt`: high severity user flag.
- `rapid_deposit_burst`: medium severity user flag when recent deposits reach the configured burst rule.
- `high_value_first_lock`: medium severity position flag when a first qualifying deposit exceeds `HIGH_RISK_DEPOSIT_THRESHOLD`.
