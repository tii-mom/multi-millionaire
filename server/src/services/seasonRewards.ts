import crypto from 'crypto';
import { Address, beginCell, Cell } from '@ton/core';

export const SEASON_WAR_APP_ID = 1;
export const SEASON_WAR_ROUND_REWARD_RAW = '500000000000000000';
export const SEASON_WAR_POOL_BPS = {
  personal: 5000,
  team: 2500,
  referral: 1500,
  leaderboard: 1000,
} as const;

export const SEASON_WAR_POOL_AMOUNTS_RAW = {
  personal: '250000000000000000',
  team: '125000000000000000',
  referral: '75000000000000000',
  leaderboard: '50000000000000000',
} as const;

export type SeasonRewardPool = keyof typeof SEASON_WAR_POOL_AMOUNTS_RAW;
export type SeasonClaimVersion = 'season-claim-v1' | 'season-claim-v2';
export const SEASON_CLAIM_V1_PROOF_FORMAT = 'single-cell:siblingOnLeft-bool+sibling-uint256';
export const SEASON_CLAIM_V2_PROOF_FORMAT = 'ref-chain:siblingOnLeft-bool+sibling-uint256';
export const SEASON_CLAIM_PROOF_ENTRY_BITS = 257;
export const SEASON_CLAIM_SINGLE_CELL_PROOF_MAX_DEPTH = Math.floor(1023 / SEASON_CLAIM_PROOF_ENTRY_BITS);
export const SEASON_CLAIM_SINGLE_CELL_MAX_LEAVES = 2 ** SEASON_CLAIM_SINGLE_CELL_PROOF_MAX_DEPTH;

export interface SeasonRewardLeafInput {
  seasonId: string | number;
  beneficiaryUserId?: string;
  recipientWallet: string;
  personalAmountRaw: string;
  teamAmountRaw: string;
  referralAmountRaw: string;
  leaderboardAmountRaw: string;
}

export interface SeasonRewardLeaf extends Omit<SeasonRewardLeafInput, 'seasonId'> {
  seasonId: string;
  totalAmountRaw: string;
  leafHash: string;
}

export interface SeasonRewardTreeOptions {
  tokenAddress: string;
  contractAddress: string;
  successfulRoundCount?: string | number | bigint;
  requireFullRoundAllocation?: boolean;
}

export interface SeasonRewardTreeBuild {
  root: string;
  leaves: Array<SeasonRewardLeaf & { proof: string[] }>;
  poolTotals: Record<SeasonRewardPool, string>;
  totalAmountRaw: string;
}

function sha256(value: string): string {
  return `0x${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function cellHashHex(cell: Cell): string {
  return `0x${cell.hash().toString('hex')}`;
}

function normalizeSeasonId(value: string | number): bigint {
  const parsed = BigInt(value);
  if (parsed < BigInt(1) || parsed > BigInt(10)) {
    throw new Error('Season reward seasonId must be between 1 and 10');
  }
  return parsed;
}

function normalizeUint256Hex(value: string): bigint {
  return BigInt(value);
}

function normalizeAmount(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Season reward ${field} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function normalizeSuccessfulRoundCount(value: string | number | bigint = 1): bigint {
  const parsed = BigInt(value);
  if (parsed < BigInt(1) || parsed > BigInt(18)) {
    throw new Error('Season reward successfulRoundCount must be between 1 and 18');
  }
  return parsed;
}

function hashPair(left: string, right: string): string {
  return cellHashHex(beginCell()
    .storeUint(normalizeUint256Hex(left), 256)
    .storeUint(normalizeUint256Hex(right), 256)
    .endCell());
}

function parseProofItem(item: string): { siblingOnLeft: boolean; hash: string } {
  const [side, hash] = item.split(':');
  if ((side !== 'left' && side !== 'right') || !hash) {
    throw new Error(`Invalid SeasonClaim proof item: ${item}`);
  }
  return { siblingOnLeft: side === 'left', hash };
}

function sumLeafPools(input: SeasonRewardLeafInput): bigint {
  return normalizeAmount(input.personalAmountRaw, 'personalAmountRaw')
    + normalizeAmount(input.teamAmountRaw, 'teamAmountRaw')
    + normalizeAmount(input.referralAmountRaw, 'referralAmountRaw')
    + normalizeAmount(input.leaderboardAmountRaw, 'leaderboardAmountRaw');
}

export function calculateSeasonWarPoolAmounts(totalRewardRaw = SEASON_WAR_ROUND_REWARD_RAW): Record<SeasonRewardPool, string> {
  const total = normalizeAmount(totalRewardRaw, 'totalRewardRaw');
  const personal = (total * BigInt(SEASON_WAR_POOL_BPS.personal)) / BigInt(10000);
  const team = (total * BigInt(SEASON_WAR_POOL_BPS.team)) / BigInt(10000);
  const referral = (total * BigInt(SEASON_WAR_POOL_BPS.referral)) / BigInt(10000);
  const leaderboard = (total * BigInt(SEASON_WAR_POOL_BPS.leaderboard)) / BigInt(10000);
  const allocated = personal + team + referral + leaderboard;
  if (allocated !== total) {
    throw new Error('Season reward pool bps must allocate the full round reward');
  }
  return {
    personal: personal.toString(),
    team: team.toString(),
    referral: referral.toString(),
    leaderboard: leaderboard.toString(),
  };
}

export function calculateSeasonWarPoolAmountsForRounds(successfulRoundCount: string | number | bigint): Record<SeasonRewardPool, string> {
  const count = normalizeSuccessfulRoundCount(successfulRoundCount);
  return calculateSeasonWarPoolAmounts((BigInt(SEASON_WAR_ROUND_REWARD_RAW) * count).toString());
}

export function buildSeasonRewardLeaf(input: SeasonRewardLeafInput, options: SeasonRewardTreeOptions): SeasonRewardLeaf {
  const totalAmountRaw = sumLeafPools(input).toString();
  const seasonId = normalizeSeasonId(input.seasonId).toString();
  return {
    ...input,
    seasonId,
    totalAmountRaw,
    leafHash: cellHashHex(beginCell()
      .storeUint(SEASON_WAR_APP_ID, 32)
      .storeRef(beginCell()
        .storeAddress(Address.parse(options.tokenAddress))
        .storeAddress(Address.parse(options.contractAddress))
        .endCell())
      .storeRef(beginCell()
        .storeUint(BigInt(seasonId), 8)
        .storeAddress(Address.parse(input.recipientWallet))
        .storeCoins(BigInt(input.personalAmountRaw))
        .storeCoins(BigInt(input.teamAmountRaw))
        .storeCoins(BigInt(input.referralAmountRaw))
        .storeCoins(BigInt(input.leaderboardAmountRaw))
        .storeCoins(BigInt(totalAmountRaw))
        .endCell())
      .endCell()),
  };
}

export function calculateSeasonRewardPoolTotals(inputs: SeasonRewardLeafInput[]): Record<SeasonRewardPool, string> {
  const totals = {
    personal: BigInt(0),
    team: BigInt(0),
    referral: BigInt(0),
    leaderboard: BigInt(0),
  };
  for (const input of inputs) {
    totals.personal += normalizeAmount(input.personalAmountRaw, 'personalAmountRaw');
    totals.team += normalizeAmount(input.teamAmountRaw, 'teamAmountRaw');
    totals.referral += normalizeAmount(input.referralAmountRaw, 'referralAmountRaw');
    totals.leaderboard += normalizeAmount(input.leaderboardAmountRaw, 'leaderboardAmountRaw');
  }
  return {
    personal: totals.personal.toString(),
    team: totals.team.toString(),
    referral: totals.referral.toString(),
    leaderboard: totals.leaderboard.toString(),
  };
}

export function assertSeasonWarPoolTotals(
  inputs: SeasonRewardLeafInput[],
  expectedTotals: Record<SeasonRewardPool, string> = SEASON_WAR_POOL_AMOUNTS_RAW,
): Record<SeasonRewardPool, string> {
  const totals = calculateSeasonRewardPoolTotals(inputs);
  for (const pool of Object.keys(SEASON_WAR_POOL_AMOUNTS_RAW) as SeasonRewardPool[]) {
    if (totals[pool] !== expectedTotals[pool]) {
      throw new Error(`Season reward ${pool} pool total ${totals[pool]} does not match ${expectedTotals[pool]}`);
    }
  }
  return totals;
}

export function buildSeasonRewardMerkleTree(inputs: SeasonRewardLeafInput[], options: SeasonRewardTreeOptions): SeasonRewardTreeBuild {
  const expectedTotals = calculateSeasonWarPoolAmountsForRounds(options.successfulRoundCount ?? 1);
  const poolTotals = options.requireFullRoundAllocation === false
    ? calculateSeasonRewardPoolTotals(inputs)
    : assertSeasonWarPoolTotals(inputs, expectedTotals);
  const leaves = inputs.map((input) => buildSeasonRewardLeaf(input, options));
  if (leaves.length === 0) {
    return {
      root: cellHashHex(beginCell().endCell()),
      leaves: [],
      poolTotals,
      totalAmountRaw: '0',
    };
  }

  const proofs = new Map<string, string[]>();
  let level = leaves.map((leaf, index) => ({ hash: leaf.leafHash, indexes: [index] }));
  for (const leaf of level) {
    proofs.set(String(leaf.indexes[0]), []);
  }

  while (level.length > 1) {
    const next: Array<{ hash: string; indexes: number[] }> = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      for (const index of left.indexes) {
        proofs.get(String(index))?.push(`right:${right.hash}`);
      }
      for (const index of right.indexes) {
        if (right !== left) {
          proofs.get(String(index))?.push(`left:${left.hash}`);
        }
      }
      next.push({ hash: hashPair(left.hash, right.hash), indexes: [...left.indexes, ...right.indexes] });
    }
    level = next;
  }

  const totalAmountRaw = Object.values(poolTotals).reduce((sum, amount) => sum + BigInt(amount), BigInt(0)).toString();
  return {
    root: level[0].hash,
    leaves: leaves.map((leaf, index) => ({ ...leaf, proof: proofs.get(String(index)) || [] })),
    poolTotals,
    totalAmountRaw,
  };
}

export function calculateSeasonRewardRootFromProof(leafHash: string, proof: string[]): string {
  let current = leafHash;
  for (const item of proof) {
    const parsed = parseProofItem(item);
    current = parsed.siblingOnLeft
      ? hashPair(parsed.hash, current)
      : hashPair(current, parsed.hash);
  }
  return current;
}

export function assertSeasonClaimProofCapacity(leafCount: number) {
  if (!Number.isInteger(leafCount) || leafCount < 0) {
    throw new Error('SeasonClaim leaf count must be a non-negative integer');
  }
  if (leafCount > SEASON_CLAIM_SINGLE_CELL_MAX_LEAVES) {
    throw new Error(
      `SeasonClaim single-cell proof format supports at most ${SEASON_CLAIM_SINGLE_CELL_MAX_LEAVES} leaves; got ${leafCount}`
    );
  }
}

export function normalizeSeasonClaimVersion(value: string | undefined | null): SeasonClaimVersion {
  if (!value || value === 'season-claim-v1') {
    return 'season-claim-v1';
  }
  if (value === 'season-claim-v2') {
    return value;
  }
  throw new Error(`Unsupported SeasonClaim claim version: ${value}`);
}

export function getSeasonClaimProofFormat(version: SeasonClaimVersion): string {
  return version === 'season-claim-v2'
    ? SEASON_CLAIM_V2_PROOF_FORMAT
    : SEASON_CLAIM_V1_PROOF_FORMAT;
}

export function assertSeasonClaimProofCapacityForVersion(leafCount: number, version: SeasonClaimVersion) {
  if (version === 'season-claim-v1') {
    assertSeasonClaimProofCapacity(leafCount);
    return;
  }
  if (!Number.isInteger(leafCount) || leafCount < 0) {
    throw new Error('SeasonClaim leaf count must be a non-negative integer');
  }
}

export function encodeSeasonClaimV1ProofCell(proof: string[]): string {
  if (proof.length * SEASON_CLAIM_PROOF_ENTRY_BITS > 1023) {
    throw new Error('SeasonClaim proof exceeds the deployed single-cell proof format capacity');
  }
  const builder = beginCell();
  for (const item of proof) {
    const parsed = parseProofItem(item);
    builder
      .storeBit(parsed.siblingOnLeft)
      .storeUint(normalizeUint256Hex(parsed.hash), 256);
  }
  return builder.endCell().toBoc().toString('base64');
}

export function encodeSeasonClaimV2ProofCell(proof: string[]): string {
  let next: Cell | null = null;
  for (let offset = proof.length; offset > 0; offset -= SEASON_CLAIM_SINGLE_CELL_PROOF_MAX_DEPTH) {
    const start = Math.max(0, offset - SEASON_CLAIM_SINGLE_CELL_PROOF_MAX_DEPTH);
    const builder = beginCell();
    for (const item of proof.slice(start, offset)) {
      const parsed = parseProofItem(item);
      builder
        .storeBit(parsed.siblingOnLeft)
        .storeUint(normalizeUint256Hex(parsed.hash), 256);
    }
    if (next) {
      builder.storeRef(next);
    }
    next = builder.endCell();
  }
  return (next || beginCell().endCell()).toBoc().toString('base64');
}

export function encodeSeasonClaimProofCell(proof: string[]): string {
  return encodeSeasonClaimV1ProofCell(proof);
}

export function encodeSeasonClaimProofCellForVersion(proof: string[], version: SeasonClaimVersion): string {
  return version === 'season-claim-v2'
    ? encodeSeasonClaimV2ProofCell(proof)
    : encodeSeasonClaimV1ProofCell(proof);
}

export function hashSeasonRewardSourceId(seasonId: string | number, recipientWallet: string): string {
  return sha256(`season-war:${normalizeSeasonId(seasonId).toString()}:${Address.parse(recipientWallet).toRawString()}`);
}
