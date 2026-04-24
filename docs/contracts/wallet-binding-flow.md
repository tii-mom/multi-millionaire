# Wallet Binding Flow

This flow is the Sprint 2 handoff artifact for wallet ownership. It stays separate from the RC1 deposit path and only becomes operational once the chain sidecar is deliberately enabled.

## Flow Stages

1. Bind intent request.
2. Signature challenge generation.
3. Wallet signature submission.
4. Signature verification.
5. Verified wallet upsert.
6. Wallet resolution during receipt apply.

## Service Boundary

The wallet binding service skeleton in `server/src/services/contracts/walletBinding.ts` is intentionally fail-closed. It exists to define the API surface and error shape for future implementation, not to perform live signature verification yet.

## Expected Service Methods

- `createBindIntent(userId, walletAddress)`
- `verifyBindSignature(intent, signature, walletAddress)`
- `upsertVerifiedWallet(binding)`
- `resolveUserByWallet(chainId, walletAddress)`

## Events And Side Effects

- Bind intent creation should not mutate state.
- Signature verification should only produce a verified record when the wallet address and signature agree.
- Wallet resolution should be explicit about `resolved`, `missing`, or `review_required`.
- Any unresolved wallet during chain event apply should push the event to review instead of mutating `positions` or `reward_ledgers`.

## Out Of Scope

- No frontend wallet UI.
- No RPC-backed wallet verification.
- No change to `POST /v1/waves/:waveId/deposit`.
- No reward claim rewrite.

