# Sprint 2 Kickoff Checklist

Use this checklist when the chain sidecar is ready to move from documentation into implementation work. Nothing here should be interpreted as permission to modify the RC1 deposit controller.

## Preconditions

- [ ] PR #5 remains draft and isolated from RC1.
- [ ] Current deposit and reward claim endpoints remain unchanged.
- [ ] Chain config loader and dry-run parser skeletons are present.
- [ ] Wallet binding flow doc exists.
- [ ] Receipt mapping doc exists.
- [ ] Fixture logs are available for deposit, price, reward batch, and reward claim cases.

## Required Resources

- [ ] RPC URL and finality window
- [ ] 72H token address
- [ ] LockVault address and deployment block
- [ ] Oracle address and deployment block
- [ ] RewardDistributor address and deployment block
- [ ] ABI or generated wrapper artifacts
- [ ] Wallet signature standard
- [ ] Sample deposit receipt
- [ ] Sample price confirmation log
- [ ] Sample reward batch log
- [ ] Sample reward claim log

## Local Readiness

- [ ] Parser tests pass for deposit, price, reward batch, and reward claim dry-run plans.
- [ ] Config loader fails closed when required chain fields are missing.
- [ ] Wallet binding service skeleton returns stub state and fails closed.
- [ ] No service imports touch `positionController` or `rewardController`.
- [ ] No code path performs a live RPC call.

## Merge Gate

- [ ] RC1 release line has been confirmed stable.
- [ ] Chain-backed writes remain behind an explicit feature flag.
- [ ] Receipt-to-position behavior has a dedicated implementation plan.

