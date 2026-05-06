# Wallet Binding Plan

Wallet binding is a prerequisite for any Sprint 2 path that wants to trust a wallet address on receipt, event apply, or reward claim. It must remain detached from the current RC1 deposit endpoint until the release line is ready to consume it.

## Goal

- Bind a verified wallet to a user account.
- Make wallet ownership explicit before `Deposited` or `RewardClaimed` events are allowed to affect business tables.
- Keep the current deposit stub behavior untouched until the chain-backed flow is ready.

## Minimal Data Model

| Field | Purpose |
| --- | --- |
| `user_id` | Existing app user. |
| `chain_id` | Chain on which the wallet is verified. |
| `wallet_address` | Raw wallet address as provided during binding. |
| `normalized_address` | Canonical address used for lookups and uniqueness. |
| `wallet_type` | Wallet provider or signing standard, if known. |
| `status` | `pending`, `verified`, or `revoked`. |
| `is_primary` | Marks the wallet used for chain receipt and claim resolution. |
| `verified_at` | Timestamp of successful signature verification. |

## Service Shape

The wallet binding service should be a pure service layer first, then routes can consume it later.

Suggested methods:

- `createBindIntent(userId, chainId)` returns a nonce, message domain, expiration, and signable payload.
- `verifyBindSignature(intent, signature, walletAddress)` verifies ownership and address normalization.
- `upsertVerifiedWallet(binding)` stores the verified wallet and marks one primary wallet per user and chain.
- `resolveUserByWallet(chainId, walletAddress)` returns the unique verified user or a review condition.

## Binding Flow

1. User requests a bind intent.
2. Server generates a nonce and a signed-message payload.
3. User signs the exact message in their wallet provider.
4. Server verifies the signature, normalized wallet address, and expiration.
5. Server stores the wallet as verified and, if needed, marks it primary.

## Invariants

- Never trust a wallet address from the client unless it verifies against the signed message.
- Enforce uniqueness on `(chain_id, normalized_address)` for active verified wallets.
- A single user may have multiple wallets, but only one primary wallet per chain should drive receipt mapping by default.
- If wallet resolution fails during event apply, the event should move to review instead of mutating `positions` or `reward_ledgers`.

## Failure Modes

- Signature invalid: reject binding.
- Message expired: request a new bind intent.
- Address mismatch: reject binding and mark the attempt suspicious.
- Wallet already bound to another user: return review required, not an automatic override.

## Deployment Boundary

Wallet binding can be built and tested before RC1 finishes, but it should not become a hard dependency for the current deposit endpoint. The current off-chain deposit path must continue to work without it.

