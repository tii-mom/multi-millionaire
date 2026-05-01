import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  buildSeasonRewardMerkleTree,
  calculateSeasonWarPoolAmountsForRounds,
  encodeSeasonClaimProofCellForVersion,
  getSeasonClaimProofFormat,
  SeasonClaimVersion,
} from '../services/seasonRewards';
import {
  PUBLIC_72H_V3_MAINNET,
} from '../services/contracts/v3Tokenomics';

const DEFAULT_LEAF_COUNT = 128;
const DEFAULT_SEASON_ID = 1;
const DEFAULT_SUCCESSFUL_ROUND_COUNT = 1;
const DEFAULT_OPEN_AT = 1_800_000_000;
const DEFAULT_GENERATED_AT = '2026-04-28T00:00:00.000Z';
const DEFAULT_OUT_DIR = '../tmp/season-war/rehearsal-v2-large';
const DEFAULT_CHAIN_ID = 'ton-testnet';
const CLAIM_VERSION: SeasonClaimVersion = 'season-claim-v2';

function readArg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return null;
}

function parsePositiveInteger(value: string | null, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function splitPool(totalRaw: string, count: number): string[] {
  const total = BigInt(totalRaw);
  const base = total / BigInt(count);
  const remainder = Number(total % BigInt(count));
  return Array.from({ length: count }, (_, index) => (base + (index < remainder ? BigInt(1) : BigInt(0))).toString());
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: string): string {
  return `0x${crypto.createHash('sha256').update(value).digest('hex')}`;
}

async function main() {
  const outDir = path.resolve(process.cwd(), readArg('out') || DEFAULT_OUT_DIR);
  const leafCount = parsePositiveInteger(readArg('leaf-count'), DEFAULT_LEAF_COUNT, 'leaf-count');
  if (leafCount < DEFAULT_LEAF_COUNT) {
    throw new Error(`--leaf-count must be at least ${DEFAULT_LEAF_COUNT} for the large v2 rehearsal`);
  }
  const seasonId = parsePositiveInteger(readArg('season-id'), DEFAULT_SEASON_ID, 'season-id');
  const successfulRoundCount = parsePositiveInteger(
    readArg('successful-round-count'),
    DEFAULT_SUCCESSFUL_ROUND_COUNT,
    'successful-round-count'
  );
  const openAt = parsePositiveInteger(readArg('open-at'), DEFAULT_OPEN_AT, 'open-at');
  const generatedAt = readArg('generated-at') || DEFAULT_GENERATED_AT;
  const chainId = readArg('chain-id') || DEFAULT_CHAIN_ID;
  const tokenAddress = readArg('token-address') || PUBLIC_72H_V3_MAINNET.token_address;
  const seasonClaimV2Address = readArg('season-claim-address');
  if (!seasonClaimV2Address) {
    throw new Error('--season-claim-address is required for v2-large rehearsal; wait for the confirmed SeasonClaimV2 address');
  }
  const bridgeAddress = readArg('season-claim-v2-legacy-bridge-address');
  const sourceEvidence = readArg('evidence');
  const sourceEvidenceStatus = readArg('evidence-status');
  const successfulWaveIds = Array.from({ length: successfulRoundCount }, (_, index) => index + 1);
  const proofFormat = getSeasonClaimProofFormat(CLAIM_VERSION);
  const note = `Synthetic ${leafCount}-wallet SeasonClaimV2 ref-chain rehearsal fixture. Not sourced from production DB and not publishable.`;

  const totals = calculateSeasonWarPoolAmountsForRounds(successfulRoundCount);
  const personal = splitPool(totals.personal, leafCount);
  const team = splitPool(totals.team, leafCount);
  const referral = splitPool(totals.referral, leafCount);
  const leaderboard = splitPool(totals.leaderboard, leafCount);
  const leafInputs = Array.from({ length: leafCount }, (_, index) => ({
    seasonId,
    beneficiaryUserId: `rehearsal-v2-user-${index + 1}`,
    recipientWallet: `0:${(0x1000 + index).toString(16).padStart(64, '0')}`,
    personalAmountRaw: personal[index],
    teamAmountRaw: team[index],
    referralAmountRaw: referral[index],
    leaderboardAmountRaw: leaderboard[index],
  }));
  const tree = buildSeasonRewardMerkleTree(leafInputs, {
    tokenAddress,
    contractAddress: seasonClaimV2Address,
    successfulRoundCount,
  });
  const leaves = tree.leaves.map((leaf) => ({
    ...leaf,
    proofCellBase64: encodeSeasonClaimProofCellForVersion(leaf.proof, CLAIM_VERSION),
  }));
  const sourceRows = {
    rehearsal: true,
    production_root_publishable: false,
    synthetic_fixture: true,
    note,
    positions: leafInputs.map((leaf, index) => ({
      position_id: `rehearsal-v2-position-${index + 1}`,
      user_id: leaf.beneficiaryUserId,
      wave_id: 1,
      amount_raw: (
        BigInt(leaf.personalAmountRaw)
        + BigInt(leaf.teamAmountRaw)
        + BigInt(leaf.referralAmountRaw)
        + BigInt(leaf.leaderboardAmountRaw)
      ).toString(),
      wallet: leaf.recipientWallet,
    })),
    allocations: {
      method: 'equal synthetic split per pool with remainder assigned by ascending fixture index',
      pools: tree.poolTotals,
    },
  };
  const evidencePayload = {
    rehearsal: true,
    synthetic_fixture: true,
    season_id: seasonId,
    successful_round_count: successfulRoundCount,
    successful_wave_ids: successfulWaveIds,
    chain_id: chainId,
    token_address: tokenAddress,
    claim_contract_version: CLAIM_VERSION,
    proof_format: proofFormat,
    claim_contract_address: seasonClaimV2Address,
    season_claim_address: seasonClaimV2Address,
    season_claim_v2_address: seasonClaimV2Address,
    ...(bridgeAddress ? { season_claim_v2_legacy_bridge_address: bridgeAddress } : {}),
    ...(sourceEvidence ? { source_evidence: sourceEvidence } : {}),
    ...(sourceEvidenceStatus ? { source_evidence_status: sourceEvidenceStatus } : {}),
    source_rows: sourceRows,
    quarantine_rows: [],
  };
  const evidenceHash = sha256Hex(canonicalStringify(evidencePayload));
  const manifest = {
    generated_at: generatedAt,
    rehearsal: true,
    synthetic_fixture: true,
    production_root_publishable: false,
    claim_contract_version: CLAIM_VERSION,
    proof_format: proofFormat,
    claim_contract_address: seasonClaimV2Address,
    season_id: seasonId,
    successful_round_count: successfulRoundCount,
    successful_wave_ids: successfulWaveIds,
    chain_id: chainId,
    note,
    ...(sourceEvidence ? { source_evidence: sourceEvidence } : {}),
    ...(sourceEvidenceStatus ? { source_evidence_status: sourceEvidenceStatus } : {}),
    contracts: {
      token_address: tokenAddress,
      season_claim_address: seasonClaimV2Address,
      season_claim_v2_address: seasonClaimV2Address,
      ...(bridgeAddress ? { season_claim_v2_legacy_bridge_address: bridgeAddress } : {}),
      selected_claim_contract_address: seasonClaimV2Address,
      season_vault_address: PUBLIC_72H_V3_MAINNET.season_vault_address,
    },
    pool_totals: tree.poolTotals,
    total_amount_raw: tree.totalAmountRaw,
    root: tree.root,
    evidence_hash: evidenceHash,
    leafCount: leaves.length,
    counts: {
      leaves: leaves.length,
      quarantine: 0,
    },
    quarantine_summary: { total: 0, by_reason: {} },
  };
  const operatorRegisterSeasonClaim = {
    rehearsal: true,
    synthetic_fixture: true,
    production_root_publishable: false,
    claim_contract_version: CLAIM_VERSION,
    proof_format: proofFormat,
    contract_address: seasonClaimV2Address,
    message: 'RegisterSeasonClaim',
    params: {
      seasonId,
      merkleRoot: tree.root,
      totalAmount72H: tree.totalAmountRaw,
      personalDepositTotal72H: tree.poolTotals.personal,
      teamDepositTotal72H: tree.poolTotals.team,
      referralTotal72H: tree.poolTotals.referral,
      leaderboardTotal72H: tree.poolTotals.leaderboard,
      openAt,
      evidenceHash,
    },
  };

  await fs.mkdir(outDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    fs.writeFile(path.join(outDir, 'source-rows.json'), `${JSON.stringify(sourceRows, null, 2)}\n`),
    fs.writeFile(path.join(outDir, 'quarantine-rows.json'), `${JSON.stringify([], null, 2)}\n`),
    fs.writeFile(path.join(outDir, 'leaves.json'), `${JSON.stringify(leaves, null, 2)}\n`),
    fs.writeFile(path.join(outDir, 'operator-register-season-claim.json'), `${JSON.stringify(operatorRegisterSeasonClaim, null, 2)}\n`),
  ]);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    outDir,
    root: tree.root,
    leafCount: leaves.length,
    claimContractVersion: CLAIM_VERSION,
    proofFormat,
    productionRootPublishable: false,
  }, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
