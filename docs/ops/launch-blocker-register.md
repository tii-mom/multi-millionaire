# Launch Blocker Register

This register is the operator-facing list of issues that block public
real-funds operation. It separates what can be fixed in the repository from
what requires environment, operator, chain, or support evidence.

## P0 Blockers

| Blocker | Current state | Required fix | Evidence |
| --- | --- | --- | --- |
| Release freeze | Working tree has modified/untracked files. | Review every changed path, commit the release scope, and tag from a clean tree. | `git status --short` is empty; `npm run audit:release-scope -- --json` archived. |
| Production env required fields | `NODE_ENV` is local and `CORS_ALLOWED_ORIGINS` is missing in local production check. | Configure production runtime values in the deployment platform, not in the repo. | `cd server && npm run check:env -- production --json` has no required failures. |
| Production wave/Season War data | Production infra canary can pass without active campaign data, but restricted gray launch cannot. | Configure an active or upcoming wave and Season War in production through an operator-approved data change. | `API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-gray-readonly` passes. |
| Public launch disabled | Public launch is not approved. | Keep `PRODUCTION_PUBLIC_LAUNCH_ENABLED=false` until all public-launch gates pass. | Prelaunch JSON shows no public-launch blocker. |
| Mainline chain writes disabled | Real-funds writes are not approved. | Keep `CHAIN_MAINLINE_WRITES_ENABLED=false` until named canary approval and receipt verification evidence exist. | Mainnet canary checklist is complete and signed off. |
| DepositVault testnet canary proof | V3 target-deposit testnet canary evidence is still required before mainnet planning can advance. | Record an active testnet DepositVault, initialized DepositVault Jetton wallet with increased balance, `supportedTarget`, `derivedDepositKey`, and `userState` agreement for a submitted receipt. | Testnet canary evidence artifact plus backend receipt apply evidence. |
| Wallet ownership | Production wallet binding is not part of the current public path. | Use `WALLET_SIGNATURE_MODE=ton_proof` with a production domain and nonce TTL. | Wallet binding tests plus staging canary record. |
| Reward claim proof | Ledger rows are eligibility records only. | Draft Merkle batch, expose proof, submit claim receipt, and verify claim event. | Batch id, root, proof ids, claim tx/event id. |
| Streak rewards | Week/month streak rewards are not claimable until Merkle rehearsal. | Include `deposit_streak_week` and `deposit_streak_month` ledgers in a batch rehearsal. | Streak ledger ids, batch id/root, proof status. |
| Anti-sybil | Public-launch anti-sybil approval is absent. | Approve allowlist/rate limits/wallet/IP/device/referral-graph review/reward freeze controls. | `ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED=true` with approval record. |
| Communications | User-facing wording must not imply live funds or claimable token rewards. | Use the gray-launch communication guardrails. | Announcement/support copy review record. |

## P1 Readiness Items

| Item | Required fix | Evidence |
| --- | --- | --- |
| Production infra read-only smoke | Run only GET health/readiness/bootstrap checks against production. | `API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-readonly` JSON. |
| Production gray read-only smoke | Run GET checks that require active wave and Season War configuration before restricted gray launch. | `API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-gray-readonly` JSON. |
| Staging migration rehearsal | Apply migrations through `007_deposit_streaks.sql` before production. | Schema check output and backup/snapshot id. |
| Admin pause controls | Exercise pause and restore for deposits, claims, referrals, and streak rewards. | Audit log ids for each control. |
| Observability | Confirm API logs, deploy logs, DB errors, receipt failures, and claim failures are visible. | Release observation record. |
| Rollback ownership | Assign release owner and rollback owner. | Release ticket or incident channel record. |

## Allowed Interim Posture

- Closed beta.
- Restricted gray launch.
- Off-chain MVP records.
- Receipt-required rehearsal.
- Reward eligibility records.

## Prohibited Interim Posture

- Public production is live.
- Real chain locks are final without backend receipt verification.
- Database reward ledgers are transferable or claimable tokens.
- Streak rewards are chain-claimable before Merkle proof and claim-event verification.
