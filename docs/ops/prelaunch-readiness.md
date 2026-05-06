# Prelaunch Readiness Gate

This gate turns the launch assessment into a repeatable pre-release check. It
does not deploy, migrate, register users, submit deposits, claim rewards,
publish Merkle roots, or call production admin endpoints.

## Decision

The current release line may be evaluated for a restricted gray launch or
closed beta only. It is not approved for public real-funds operation until the
production chain, Merkle claim, anti-sybil, support, and rollback gates below
are complete.

Allowed release posture before those gates:

- closed beta,
- infrastructure canary,
- receipt-required chain rehearsal,
- off-chain MVP records,
- reward eligibility records.

Prohibited release posture before those gates:

- public production is live,
- database rewards are claimable tokens,
- deposits are real chain locks before backend receipt verification,
- streak rewards are chain-claimable before Merkle proof and claim verification.

## Command

Run from the repository root:

```bash
npm run check:prelaunch
```

Use JSON output for release records:

```bash
npm run check:prelaunch -- production --json
```

Use `--allow-dirty` only for local diagnosis. A release candidate should not use
it because dirty or untracked files make the build non-reproducible.

## Required Verification

Before a release tag or production promotion, run and archive the output from:

```bash
npm run audit:release-scope
npm run lint
npm run build
npm test
cd server && npm run build
cd server && npm test
cd server && npm run check:schema
npm run test:nav
npm run test:i18n
npm run cf:backend:check
API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-readonly
```

`smoke:production-readonly` is the infrastructure canary profile. It checks
only health, readiness, and bootstrap guardrails. Restricted gray launch also
requires:

```bash
API_BASE_URL="$PRODUCTION_API_BASE_URL" npm run smoke:production-gray-readonly
```

The gray profile remains GET-only, but it requires production active/upcoming
wave and Season War data. Any mutating production canary still requires a named
operator, canary wallet, amount cap, wave id, and rollback window approved
separately.

## Blocker Classes

- `release freeze`: the working tree must be clean before a release tag.
- `release scope`: changed paths must be reviewed with
  `npm run audit:release-scope`; unknown buckets must be triaged before tag.
- `production env`: `cd server && npm run check:env -- production --json`
  must have no required failures.
- `production campaign data`: restricted gray launch requires current wave and
  Season War data; infrastructure canary alone does not prove user readiness.
- `chain writes`: `CHAIN_MAINLINE_WRITES_ENABLED=true` requires the named
  canary approval and mainnet evidence gates in
  `docs/ops/mainnet-canary-checklist.md`.
- `public launch`: `PRODUCTION_PUBLIC_LAUNCH_ENABLED=true` requires
  `ANTI_SYBIL_PUBLIC_LAUNCH_APPROVED=true`, external oracle approval, and the
  public-launch communication guardrails.
- `reward claims`: reward ledgers are eligibility records until a Merkle batch,
  proof availability, and verified claim event are present.
- `streak rewards`: 7-day and 30-day streak ledgers must be rehearsed into a
  Merkle batch before they are shown as claimable.

## Operator Evidence

Capture the following in each release record:

- commit SHA and clean working tree confirmation,
- prelaunch readiness JSON,
- environment check JSON,
- schema check output,
- frontend/backend build and test output,
- Cloudflare staging dry-run output,
- production read-only smoke JSON,
- production gray read-only smoke JSON when restricted gray launch is in scope,
- staging emergency pause/restore evidence,
- Merkle batch/proof rehearsal ids for referral and streak rewards,
- mainnet canary evidence URL when chain writes are in scope.

## Related Runbooks

- `docs/ops/launch-blocker-register.md`
- `docs/ops/production-env-template.md`
- `docs/ops/restricted-gray-launch-runbook.md`
