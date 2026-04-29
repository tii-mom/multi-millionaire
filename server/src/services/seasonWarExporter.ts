import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Address } from '@ton/core';
import { query } from '../db';
import {
  assertSeasonClaimProofCapacityForVersion,
  buildSeasonRewardMerkleTree,
  calculateSeasonWarPoolAmountsForRounds,
  encodeSeasonClaimProofCellForVersion,
  getSeasonClaimProofFormat,
  normalizeSeasonClaimVersion,
  SEASON_CLAIM_SINGLE_CELL_MAX_LEAVES,
  SeasonClaimVersion,
  SeasonRewardLeafInput,
  SeasonRewardPool,
} from './seasonRewards';
import { readPublicV2Tokenomics } from './contracts/v2Tokenomics';

const LEADERBOARD_WEIGHTS = [30, 20, 15, 10, 7, 5, 4, 3, 3, 3];
export const SEASON_CLAIM_V2_PLACEHOLDER_ADDRESS = '0:2222222222222222222222222222222222222222222222222222222222222222';

export interface SeasonWarExportInput {
  seasonId: number;
  successfulRoundCount: number;
  successfulWaveIds: number[];
  outDir: string;
  chainId?: string;
  tokenAddress?: string;
  seasonClaimAddress?: string;
  claimVersion?: SeasonClaimVersion;
  rehearsal?: boolean;
  openAt?: number;
}

interface PositionCandidateRow {
  position_id: string;
  user_id: string;
  wave_id: number;
  amount_raw: string;
  onchain_position_id: string;
  qualifies_for_activation: boolean;
  withdrawn: boolean;
  is_first_qualifying_for_user: boolean;
  position_created_at: Date;
  wallet_address: string | null;
  normalized_address: string | null;
  chain_event_id: string | null;
  tx_hash: string | null;
  log_index: number | null;
  block_number: string | null;
  block_time: Date | null;
  chain_payload: Record<string, unknown> | null;
}

interface ReferralCandidateRow {
  id: string;
  invitee_user_id: string;
  inviter_user_id: string | null;
  status: string;
  locked_at: Date | null;
  created_at: Date;
  inviter_wallet: string | null;
  inviter_normalized_address: string | null;
  invitee_wallet: string | null;
  invitee_normalized_address: string | null;
}

interface SquadMembershipRow {
  wave_id: number;
  squad_id: number;
  squad_name: string;
  squad_created_at: Date;
  user_id: string;
  role: string;
  status: string;
}

interface RiskFlagRow {
  id: string;
  entity_type: 'user' | 'position' | 'reward_ledger';
  entity_id: string;
  flag_type: string;
  severity: string;
  status: string;
  note: string | null;
}

interface RewardLedgerRiskRow {
  id: string;
  beneficiary_user_id: string;
  source_user_id: string;
  source_position_id: string;
}

interface IncludedPosition {
  positionId: string;
  userId: string;
  waveId: number;
  amountRaw: string;
  amount: bigint;
  onchainPositionId: string;
  wallet: string;
  walletRaw: string;
  chainEventId: string;
  txHash: string;
  createdAt: string;
}

interface QuarantineRow {
  entity_type: string;
  entity_id: string;
  reasons: string[];
  user_id?: string;
  position_id?: string;
  wave_id?: number;
  details?: Record<string, unknown>;
}

interface Target {
  id: string;
  contribution: bigint;
  rank: number;
  walletRaw: string;
}

interface UserTarget extends Target {
  userId: string;
  wallet: string;
}

interface SquadMemberContribution {
  userId: string;
  wallet: string;
  walletRaw: string;
  contribution: bigint;
}

interface SquadContribution extends Target {
  squadId: string;
  name: string;
  members: Map<string, SquadMemberContribution>;
}

export interface ExportArtifacts {
  manifest: Record<string, unknown>;
  sourceRows: Record<string, unknown>;
  quarantineRows: QuarantineRow[];
  leaves: Array<Record<string, unknown>>;
  operatorRegisterSeasonClaim: Record<string, unknown>;
}

function normalizePositiveInteger(value: number, name: string, max?: number): number {
  if (!Number.isInteger(value) || value <= 0 || (max !== undefined && value > max)) {
    throw new Error(`${name} must be an integer between 1 and ${max ?? 'unbounded'}`);
  }
  return value;
}

function normalizeWaveIds(values: number[]): number[] {
  const unique = [...new Set(values.map((value) => normalizePositiveInteger(value, 'successfulWaveId')))];
  return unique.sort((a, b) => a - b);
}

function normalizeAmount(value: string, name: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function walletRaw(wallet: string): string {
  return Address.parse(wallet).toRawString();
}

function compareTargets(a: Target, b: Target): number {
  if (a.contribution !== b.contribution) {
    return a.contribution > b.contribution ? -1 : 1;
  }
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  const walletCompare = a.walletRaw.localeCompare(b.walletRaw);
  if (walletCompare !== 0) {
    return walletCompare;
  }
  return a.id.localeCompare(b.id);
}

function allocateProRata(budget: bigint, targets: Target[], label: string): Map<string, bigint> {
  const eligible = targets.filter((target) => target.contribution > BigInt(0));
  if (budget > BigInt(0) && eligible.length === 0) {
    throw new Error(`Season War ${label} pool has no qualified contribution`);
  }
  const totalContribution = eligible.reduce((sum, target) => sum + target.contribution, BigInt(0));
  const allocations = new Map<string, bigint>();
  let allocated = BigInt(0);
  for (const target of eligible) {
    const amount = (budget * target.contribution) / totalContribution;
    allocations.set(target.id, amount);
    allocated += amount;
  }
  const remainder = Number(budget - allocated);
  const sorted = [...eligible].sort(compareTargets);
  for (let i = 0; i < remainder; i += 1) {
    const target = sorted[i];
    allocations.set(target.id, (allocations.get(target.id) || BigInt(0)) + BigInt(1));
  }
  return allocations;
}

function allocateWeights(budget: bigint, rankedTargets: Target[], label: string): Map<string, bigint> {
  const top = rankedTargets.filter((target) => target.contribution > BigInt(0)).slice(0, LEADERBOARD_WEIGHTS.length);
  if (budget > BigInt(0) && top.length === 0) {
    throw new Error(`Season War ${label} leaderboard has no qualified contribution`);
  }
  const activeWeights = LEADERBOARD_WEIGHTS.slice(0, top.length);
  const totalWeight = activeWeights.reduce((sum, weight) => sum + weight, 0);
  const allocations = new Map<string, bigint>();
  let allocated = BigInt(0);
  top.forEach((target, index) => {
    const amount = (budget * BigInt(activeWeights[index])) / BigInt(totalWeight);
    allocations.set(target.id, amount);
    allocated += amount;
  });
  const remainder = Number(budget - allocated);
  const sorted = [...top].sort(compareTargets);
  for (let i = 0; i < remainder; i += 1) {
    const target = sorted[i];
    allocations.set(target.id, (allocations.get(target.id) || BigInt(0)) + BigInt(1));
  }
  return allocations;
}

function addPoolAmount(
  map: Map<string, Record<SeasonRewardPool, bigint>>,
  userId: string,
  pool: SeasonRewardPool,
  amount: bigint
) {
  if (amount === BigInt(0)) {
    return;
  }
  const current = map.get(userId) || {
    personal: BigInt(0),
    team: BigInt(0),
    referral: BigInt(0),
    leaderboard: BigInt(0),
  };
  current[pool] += amount;
  map.set(userId, current);
}

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
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

function resolveSeasonClaimAddress(
  claimVersion: SeasonClaimVersion,
  inputAddress: string | undefined,
  deployedSeasonClaimAddress: string
): string {
  if (inputAddress) {
    return inputAddress;
  }
  return claimVersion === 'season-claim-v2'
    ? SEASON_CLAIM_V2_PLACEHOLDER_ADDRESS
    : deployedSeasonClaimAddress;
}

function summarizeQuarantine(rows: QuarantineRow[]) {
  const byReason: Record<string, number> = {};
  for (const row of rows) {
    for (const reason of row.reasons) {
      byReason[reason] = (byReason[reason] || 0) + 1;
    }
  }
  return { total: rows.length, by_reason: byReason };
}

async function listPositionCandidates(waveIds: number[], chainId: string): Promise<PositionCandidateRow[]> {
  const result = await query<PositionCandidateRow>(
    `SELECT
       p.id::text AS position_id,
       p.user_id::text AS user_id,
       p.wave_id,
       p.amount_raw::text AS amount_raw,
       p.onchain_position_id::text AS onchain_position_id,
       p.qualifies_for_activation,
       p.withdrawn,
       p.is_first_qualifying_for_user,
       p.created_at AS position_created_at,
       wb.wallet_address,
       wb.normalized_address,
       ce.id::text AS chain_event_id,
       ce.tx_hash,
       ce.log_index,
       ce.block_number::text AS block_number,
       ce.block_time,
       ce.payload AS chain_payload
     FROM positions p
     LEFT JOIN wallet_bindings wb
       ON wb.user_id = p.user_id
      AND wb.status = 'verified'
      AND wb.is_primary = TRUE
      AND wb.chain_id = $2
     LEFT JOIN LATERAL (
       SELECT id, tx_hash, log_index, block_number, block_time, payload
       FROM chain_events ce
       WHERE ce.chain_id = $2
         AND ce.contract_role = 'lock_vault'
         AND ce.event_name = 'Deposited'
         AND ce.apply_status = 'applied'
         AND ce.finalized = TRUE
         AND (
           ce.payload->>'positionId' = p.onchain_position_id::text
           OR ce.payload->>'position_id' = p.onchain_position_id::text
           OR ce.payload->>'onchainPositionId' = p.onchain_position_id::text
         )
         AND (
           ce.payload->>'amountRaw' = p.amount_raw::text
           OR ce.payload->>'amount_raw' = p.amount_raw::text
           OR ce.payload->>'amount' = p.amount_raw::text
         )
         AND (
           ce.payload->>'waveId' = p.wave_id::text
           OR ce.payload->>'wave_id' = p.wave_id::text
         )
       ORDER BY ce.block_number ASC NULLS LAST, ce.log_index ASC
       LIMIT 1
     ) ce ON TRUE
     WHERE p.wave_id = ANY($1::int[])
     ORDER BY p.wave_id ASC, p.created_at ASC, p.id ASC`,
    [waveIds, chainId]
  );
  return result.rows;
}

async function listReferralCandidates(chainId: string): Promise<ReferralCandidateRow[]> {
  const result = await query<ReferralCandidateRow>(
    `SELECT
       r.id::text AS id,
       r.invitee_user_id::text AS invitee_user_id,
       r.inviter_user_id::text AS inviter_user_id,
       r.status,
       r.locked_at,
       r.created_at,
       inviter_wb.wallet_address AS inviter_wallet,
       inviter_wb.normalized_address AS inviter_normalized_address,
       invitee_wb.wallet_address AS invitee_wallet,
       invitee_wb.normalized_address AS invitee_normalized_address
     FROM referrals r
     LEFT JOIN wallet_bindings inviter_wb
       ON inviter_wb.user_id = r.inviter_user_id
      AND inviter_wb.status = 'verified'
      AND inviter_wb.is_primary = TRUE
      AND inviter_wb.chain_id = $1
     LEFT JOIN wallet_bindings invitee_wb
       ON invitee_wb.user_id = r.invitee_user_id
      AND invitee_wb.status = 'verified'
      AND invitee_wb.is_primary = TRUE
      AND invitee_wb.chain_id = $1
     WHERE r.status = 'locked'
     ORDER BY r.locked_at ASC NULLS LAST, r.created_at ASC, r.id ASC`,
    [chainId]
  );
  return result.rows;
}

async function listSquadMemberships(waveIds: number[]): Promise<SquadMembershipRow[]> {
  const result = await query<SquadMembershipRow>(
    `SELECT
       sm.wave_id,
       sm.squad_id,
       s.name AS squad_name,
       s.created_at AS squad_created_at,
       sm.user_id::text AS user_id,
       sm.role,
       sm.status
     FROM squad_members sm
     JOIN squads s ON s.id = sm.squad_id AND s.wave_id = sm.wave_id
     WHERE sm.wave_id = ANY($1::int[])
       AND sm.status = 'activated'
       AND s.status <> 'archived'
     ORDER BY sm.wave_id ASC, sm.squad_id ASC, sm.user_id ASC`,
    [waveIds]
  );
  return result.rows;
}

async function listBlockingRiskFlags(): Promise<RiskFlagRow[]> {
  const result = await query<RiskFlagRow>(
    `SELECT id::text, entity_type, entity_id, flag_type, severity, status, note
     FROM risk_flags
     WHERE status IN ('open', 'reviewing')
     ORDER BY created_at ASC, id ASC`
  );
  return result.rows;
}

async function listRewardLedgersForRiskFlags(riskFlags: RiskFlagRow[]): Promise<RewardLedgerRiskRow[]> {
  const rewardLedgerIds = riskFlags
    .filter((flag) => flag.entity_type === 'reward_ledger')
    .map((flag) => flag.entity_id);
  if (rewardLedgerIds.length === 0) {
    return [];
  }
  const result = await query<RewardLedgerRiskRow>(
    `SELECT
       id::text,
       beneficiary_user_id::text,
       source_user_id::text,
       source_position_id::text
     FROM reward_ledgers
     WHERE id = ANY($1::uuid[])`,
    [rewardLedgerIds]
  );
  return result.rows;
}

function rankUsers(contributions: Map<string, bigint>, walletByUser: Map<string, string>): UserTarget[] {
  return [...contributions.entries()]
    .map(([userId, contribution]) => {
      const wallet = walletByUser.get(userId);
      if (!wallet) {
        throw new Error(`Missing recipient wallet for user ${userId}`);
      }
      return {
        id: userId,
        userId,
        wallet,
        walletRaw: walletRaw(wallet),
        contribution,
        rank: 0,
      };
    })
    .sort((a, b) => compareTargets({ ...a, rank: Number.MAX_SAFE_INTEGER }, { ...b, rank: Number.MAX_SAFE_INTEGER }))
    .map((target, index) => ({ ...target, rank: index + 1 }));
}

function rankSquads(squads: Map<string, SquadContribution>): SquadContribution[] {
  return [...squads.values()]
    .sort((a, b) => compareTargets({ ...a, rank: Number.MAX_SAFE_INTEGER }, { ...b, rank: Number.MAX_SAFE_INTEGER }))
    .map((target, index) => ({ ...target, rank: index + 1 }));
}

function buildLeafInputs(
  userAmounts: Map<string, Record<SeasonRewardPool, bigint>>,
  walletByUser: Map<string, string>,
  seasonId: number
): SeasonRewardLeafInput[] {
  const byWallet = new Map<string, SeasonRewardLeafInput & { beneficiaryUserIds: string[]; walletRaw: string }>();
  for (const [userId, pools] of userAmounts.entries()) {
    const total = pools.personal + pools.team + pools.referral + pools.leaderboard;
    if (total === BigInt(0)) {
      continue;
    }
    const wallet = walletByUser.get(userId);
    if (!wallet) {
      throw new Error(`Missing recipient wallet for user ${userId}`);
    }
    const raw = walletRaw(wallet);
    const current = byWallet.get(raw);
    if (current) {
      current.personalAmountRaw = (BigInt(current.personalAmountRaw) + pools.personal).toString();
      current.teamAmountRaw = (BigInt(current.teamAmountRaw) + pools.team).toString();
      current.referralAmountRaw = (BigInt(current.referralAmountRaw) + pools.referral).toString();
      current.leaderboardAmountRaw = (BigInt(current.leaderboardAmountRaw) + pools.leaderboard).toString();
      current.beneficiaryUserIds.push(userId);
      continue;
    }
    byWallet.set(raw, {
      seasonId,
      beneficiaryUserId: userId,
      beneficiaryUserIds: [userId],
      recipientWallet: wallet,
      walletRaw: raw,
      personalAmountRaw: pools.personal.toString(),
      teamAmountRaw: pools.team.toString(),
      referralAmountRaw: pools.referral.toString(),
      leaderboardAmountRaw: pools.leaderboard.toString(),
    });
  }
  return [...byWallet.values()]
    .sort((a, b) => a.walletRaw.localeCompare(b.walletRaw))
    .map(({ beneficiaryUserIds: _beneficiaryUserIds, walletRaw: _walletRaw, ...input }) => input);
}

export async function buildSeasonWarExport(input: SeasonWarExportInput): Promise<ExportArtifacts> {
  const seasonId = normalizePositiveInteger(input.seasonId, 'seasonId', 10);
  const successfulRoundCount = normalizePositiveInteger(input.successfulRoundCount, 'successfulRoundCount', 18);
  const successfulWaveIds = normalizeWaveIds(input.successfulWaveIds);
  const claimVersion = normalizeSeasonClaimVersion(input.claimVersion);
  const proofFormat = getSeasonClaimProofFormat(claimVersion);
  const rehearsal = input.rehearsal === true;
  const productionRootPublishable = false;
  if (successfulWaveIds.length !== successfulRoundCount) {
    throw new Error('successful-wave-ids count must equal successfulRoundCount');
  }

  const publicTokenomics = readPublicV2Tokenomics();
  const chainId = input.chainId || publicTokenomics.chain_id;
  const tokenAddress = input.tokenAddress || publicTokenomics.token_address;
  const seasonClaimAddress = resolveSeasonClaimAddress(claimVersion, input.seasonClaimAddress, publicTokenomics.season_claim_address);
  if (!tokenAddress || !seasonClaimAddress) {
    throw new Error('Season War export requires tokenAddress and seasonClaimAddress');
  }

  const [positionRows, referralRows, squadRows, riskFlags] = await Promise.all([
    listPositionCandidates(successfulWaveIds, chainId),
    listReferralCandidates(chainId),
    listSquadMemberships(successfulWaveIds),
    listBlockingRiskFlags(),
  ]);
  const rewardLedgerRiskRows = await listRewardLedgersForRiskFlags(riskFlags);

  const userRisk = new Map<string, RiskFlagRow[]>();
  const positionRisk = new Map<string, RiskFlagRow[]>();
  for (const flag of riskFlags) {
    if (flag.entity_type === 'user') {
      userRisk.set(flag.entity_id, [...(userRisk.get(flag.entity_id) || []), flag]);
    }
    if (flag.entity_type === 'position') {
      positionRisk.set(flag.entity_id, [...(positionRisk.get(flag.entity_id) || []), flag]);
    }
  }

  const rewardLedgerRiskByPosition = new Map<string, RewardLedgerRiskRow[]>();
  const rewardLedgerRiskByUser = new Map<string, RewardLedgerRiskRow[]>();
  for (const row of rewardLedgerRiskRows) {
    rewardLedgerRiskByPosition.set(row.source_position_id, [...(rewardLedgerRiskByPosition.get(row.source_position_id) || []), row]);
    rewardLedgerRiskByUser.set(row.beneficiary_user_id, [...(rewardLedgerRiskByUser.get(row.beneficiary_user_id) || []), row]);
    rewardLedgerRiskByUser.set(row.source_user_id, [...(rewardLedgerRiskByUser.get(row.source_user_id) || []), row]);
  }

  const quarantineRows: QuarantineRow[] = [];
  const includedPositions: IncludedPosition[] = [];
  const walletByUser = new Map<string, string>();

  for (const row of positionRows) {
    const reasons: string[] = [];
    if (!row.qualifies_for_activation) reasons.push('position_not_qualifying');
    if (row.withdrawn) reasons.push('position_withdrawn');
    if (!row.normalized_address) reasons.push('missing_verified_primary_wallet');
    if (!row.chain_event_id) reasons.push('missing_finalized_deposit_event');
    if (userRisk.has(row.user_id)) reasons.push('user_risk_flag');
    if (positionRisk.has(row.position_id)) reasons.push('position_risk_flag');
    if (rewardLedgerRiskByPosition.has(row.position_id)) reasons.push('reward_source_risk_flag');

    if (reasons.length > 0) {
      quarantineRows.push({
        entity_type: 'position',
        entity_id: row.position_id,
        user_id: row.user_id,
        position_id: row.position_id,
        wave_id: row.wave_id,
        reasons,
        details: {
          onchain_position_id: row.onchain_position_id,
          amount_raw: row.amount_raw,
          chain_event_id: row.chain_event_id,
        },
      });
      continue;
    }

    const wallet = row.normalized_address!;
    const amount = normalizeAmount(row.amount_raw, `position ${row.position_id} amount_raw`);
    walletByUser.set(row.user_id, wallet);
    includedPositions.push({
      positionId: row.position_id,
      userId: row.user_id,
      waveId: row.wave_id,
      amountRaw: row.amount_raw,
      amount,
      onchainPositionId: row.onchain_position_id,
      wallet,
      walletRaw: walletRaw(wallet),
      chainEventId: row.chain_event_id!,
      txHash: row.tx_hash!,
      createdAt: row.position_created_at.toISOString(),
    });
  }

  const positionsByUser = new Map<string, IncludedPosition[]>();
  const personalContributions = new Map<string, bigint>();
  for (const position of includedPositions) {
    positionsByUser.set(position.userId, [...(positionsByUser.get(position.userId) || []), position]);
    personalContributions.set(position.userId, (personalContributions.get(position.userId) || BigInt(0)) + position.amount);
  }
  for (const positions of positionsByUser.values()) {
    positions.sort((a, b) => a.waveId - b.waveId || a.createdAt.localeCompare(b.createdAt) || a.positionId.localeCompare(b.positionId));
  }

  const membershipByWaveUser = new Map<string, SquadMembershipRow>();
  for (const row of squadRows) {
    membershipByWaveUser.set(`${row.wave_id}:${row.user_id}`, row);
  }

  const squadContributions = new Map<string, SquadContribution>();
  for (const position of includedPositions) {
    const membership = membershipByWaveUser.get(`${position.waveId}:${position.userId}`);
    if (!membership) {
      continue;
    }
    const squadId = String(membership.squad_id);
    const current = squadContributions.get(squadId) || {
      id: squadId,
      squadId,
      name: membership.squad_name,
      contribution: BigInt(0),
      rank: 0,
      walletRaw: squadId.padStart(20, '0'),
      members: new Map<string, SquadMemberContribution>(),
    };
    current.contribution += position.amount;
    const member = current.members.get(position.userId) || {
      userId: position.userId,
      wallet: position.wallet,
      walletRaw: position.walletRaw,
      contribution: BigInt(0),
    };
    member.contribution += position.amount;
    current.members.set(position.userId, member);
    squadContributions.set(squadId, current);
  }

  const referralContributions = new Map<string, bigint>();
  const includedReferrals: Record<string, unknown>[] = [];
  const seenInvitees = new Set<string>();
  for (const row of referralRows) {
    const reasons: string[] = [];
    if (!row.inviter_user_id) reasons.push('missing_inviter');
    if (row.inviter_user_id && row.inviter_user_id === row.invitee_user_id) reasons.push('self_referral');
    if (seenInvitees.has(row.invitee_user_id)) reasons.push('duplicate_referral_invitee');
    if (!row.inviter_normalized_address) reasons.push('missing_inviter_verified_primary_wallet');
    if (!row.invitee_normalized_address) reasons.push('missing_invitee_verified_primary_wallet');
    if (userRisk.has(row.invitee_user_id)) reasons.push('invitee_user_risk_flag');
    if (row.inviter_user_id && userRisk.has(row.inviter_user_id)) reasons.push('inviter_user_risk_flag');
    if (rewardLedgerRiskByUser.has(row.invitee_user_id)) reasons.push('invitee_reward_source_risk_flag');
    if (row.inviter_user_id && rewardLedgerRiskByUser.has(row.inviter_user_id)) reasons.push('inviter_reward_source_risk_flag');

    const firstPosition = positionsByUser.get(row.invitee_user_id)?.[0] || null;
    if (!firstPosition) reasons.push('missing_valid_invitee_first_lock');
    if (firstPosition && rewardLedgerRiskByPosition.has(firstPosition.positionId)) reasons.push('invitee_position_reward_source_risk_flag');

    seenInvitees.add(row.invitee_user_id);
    if (reasons.length > 0) {
      quarantineRows.push({
        entity_type: 'referral',
        entity_id: row.id,
        user_id: row.inviter_user_id || row.invitee_user_id,
        reasons,
        details: {
          invitee_user_id: row.invitee_user_id,
          inviter_user_id: row.inviter_user_id,
          source_position_id: firstPosition?.positionId || null,
        },
      });
      continue;
    }

    const inviterId = row.inviter_user_id!;
    walletByUser.set(inviterId, row.inviter_normalized_address!);
    referralContributions.set(inviterId, (referralContributions.get(inviterId) || BigInt(0)) + firstPosition!.amount);
    includedReferrals.push({
      id: row.id,
      invitee_user_id: row.invitee_user_id,
      inviter_user_id: inviterId,
      source_position_id: firstPosition!.positionId,
      source_amount_raw: firstPosition!.amountRaw,
      inviter_wallet: row.inviter_normalized_address,
    });
  }

  const expectedTotals = calculateSeasonWarPoolAmountsForRounds(successfulRoundCount);
  const rankedUsers = rankUsers(personalContributions, walletByUser);
  const rankedReferralUsers = rankUsers(referralContributions, walletByUser);
  const rankedSquads = rankSquads(squadContributions);
  const userAmounts = new Map<string, Record<SeasonRewardPool, bigint>>();

  const personalAllocations = allocateProRata(BigInt(expectedTotals.personal), rankedUsers, 'personal');
  for (const [userId, amount] of personalAllocations.entries()) {
    addPoolAmount(userAmounts, userId, 'personal', amount);
  }

  const teamSquadAllocations = allocateProRata(BigInt(expectedTotals.team), rankedSquads, 'team');
  for (const squad of rankedSquads) {
    const squadAmount = teamSquadAllocations.get(squad.id) || BigInt(0);
    const members = [...squad.members.values()]
      .sort((a, b) => {
        if (a.contribution !== b.contribution) return a.contribution > b.contribution ? -1 : 1;
        const walletCompare = a.walletRaw.localeCompare(b.walletRaw);
        return walletCompare !== 0 ? walletCompare : a.userId.localeCompare(b.userId);
      })
      .map((member, index) => ({ id: member.userId, contribution: member.contribution, rank: index + 1, walletRaw: member.walletRaw }));
    const memberAllocations = allocateProRata(squadAmount, members, `team squad ${squad.id}`);
    for (const [userId, amount] of memberAllocations.entries()) {
      addPoolAmount(userAmounts, userId, 'team', amount);
    }
  }

  const referralAllocations = allocateProRata(BigInt(expectedTotals.referral), rankedReferralUsers, 'referral');
  for (const [userId, amount] of referralAllocations.entries()) {
    addPoolAmount(userAmounts, userId, 'referral', amount);
  }

  const leaderboardBudget = BigInt(expectedTotals.leaderboard);
  const personalLeaderboardBudget = leaderboardBudget / BigInt(2);
  const squadLeaderboardBudget = leaderboardBudget - personalLeaderboardBudget;
  const personalLeaderboardAllocations = allocateWeights(personalLeaderboardBudget, rankedUsers, 'personal');
  for (const [userId, amount] of personalLeaderboardAllocations.entries()) {
    addPoolAmount(userAmounts, userId, 'leaderboard', amount);
  }
  const squadLeaderboardAllocations = allocateWeights(squadLeaderboardBudget, rankedSquads, 'squad');
  for (const squad of rankedSquads) {
    const squadAmount = squadLeaderboardAllocations.get(squad.id) || BigInt(0);
    const members = [...squad.members.values()]
      .sort((a, b) => {
        if (a.contribution !== b.contribution) return a.contribution > b.contribution ? -1 : 1;
        const walletCompare = a.walletRaw.localeCompare(b.walletRaw);
        return walletCompare !== 0 ? walletCompare : a.userId.localeCompare(b.userId);
      })
      .map((member, index) => ({ id: member.userId, contribution: member.contribution, rank: index + 1, walletRaw: member.walletRaw }));
    const memberAllocations = allocateProRata(squadAmount, members, `squad leaderboard ${squad.id}`);
    for (const [userId, amount] of memberAllocations.entries()) {
      addPoolAmount(userAmounts, userId, 'leaderboard', amount);
    }
  }

  const leafInputs = buildLeafInputs(userAmounts, walletByUser, seasonId);
  assertSeasonClaimProofCapacityForVersion(leafInputs.length, claimVersion);
  const tree = buildSeasonRewardMerkleTree(leafInputs, {
    tokenAddress,
    contractAddress: seasonClaimAddress,
    successfulRoundCount,
  });

  const leaves = tree.leaves.map((leaf) => ({
    ...leaf,
    proofCellBase64: encodeSeasonClaimProofCellForVersion(leaf.proof, claimVersion),
  })).map((leaf) => (
    claimVersion === 'season-claim-v1'
      ? { ...leaf, seasonClaimProofCellBase64: leaf.proofCellBase64 }
      : leaf
  ));

  const sourceRows = {
    positions: includedPositions.map((position) => ({
      position_id: position.positionId,
      user_id: position.userId,
      wave_id: position.waveId,
      amount_raw: position.amountRaw,
      onchain_position_id: position.onchainPositionId,
      wallet: position.wallet,
      chain_event_id: position.chainEventId,
      tx_hash: position.txHash,
      created_at: position.createdAt,
    })),
    referrals: includedReferrals,
    squads: rankedSquads.map((squad) => ({
      squad_id: squad.squadId,
      name: squad.name,
      rank: squad.rank,
      contribution_raw: squad.contribution.toString(),
      members: [...squad.members.values()].map((member) => ({
        user_id: member.userId,
        wallet: member.wallet,
        contribution_raw: member.contribution.toString(),
      })),
    })),
    allocations: {
      personal: Object.fromEntries([...personalAllocations.entries()].map(([key, value]) => [key, value.toString()])),
      team_squads: Object.fromEntries([...teamSquadAllocations.entries()].map(([key, value]) => [key, value.toString()])),
      referral: Object.fromEntries([...referralAllocations.entries()].map(([key, value]) => [key, value.toString()])),
      leaderboard_personal: Object.fromEntries([...personalLeaderboardAllocations.entries()].map(([key, value]) => [key, value.toString()])),
      leaderboard_squads: Object.fromEntries([...squadLeaderboardAllocations.entries()].map(([key, value]) => [key, value.toString()])),
    },
  };
  const evidencePayload = {
    season_id: seasonId,
    successful_round_count: successfulRoundCount,
    successful_wave_ids: successfulWaveIds,
    chain_id: chainId,
    token_address: tokenAddress,
    claim_contract_version: claimVersion,
    proof_format: proofFormat,
    claim_contract_address: seasonClaimAddress,
    season_claim_address: claimVersion === 'season-claim-v1' ? seasonClaimAddress : publicTokenomics.season_claim_address,
    ...(claimVersion === 'season-claim-v2' ? { season_claim_v2_address: seasonClaimAddress } : {}),
    source_rows: sourceRows,
    quarantine_rows: quarantineRows,
  };
  const evidenceHash = sha256Hex(canonicalStringify(serialize(evidencePayload)));
  const openAt = input.openAt || Math.floor(Date.now() / 1000);

  const manifest = {
    generated_at: new Date().toISOString(),
    rehearsal,
    production_root_publishable: productionRootPublishable,
    claim_contract_version: claimVersion,
    proof_format: proofFormat,
    claim_contract_address: seasonClaimAddress,
    ...(claimVersion === 'season-claim-v1' ? { max_supported_single_cell_leaves: SEASON_CLAIM_SINGLE_CELL_MAX_LEAVES } : {}),
    season_id: seasonId,
    successful_round_count: successfulRoundCount,
    successful_wave_ids: successfulWaveIds,
    chain_id: chainId,
    contracts: {
      token_address: tokenAddress,
      season_claim_address: claimVersion === 'season-claim-v1' ? seasonClaimAddress : publicTokenomics.season_claim_address,
      ...(claimVersion === 'season-claim-v2' ? { season_claim_v2_address: seasonClaimAddress } : {}),
      selected_claim_contract_address: seasonClaimAddress,
      season_vault_address: publicTokenomics.season_vault_address,
    },
    pool_totals: tree.poolTotals,
    total_amount_raw: tree.totalAmountRaw,
    root: tree.root,
    evidence_hash: evidenceHash,
    leafCount: leaves.length,
    counts: {
      candidate_positions: positionRows.length,
      included_positions: includedPositions.length,
      included_referrals: includedReferrals.length,
      included_squads: rankedSquads.length,
      leaves: leaves.length,
    },
    quarantine_summary: summarizeQuarantine(quarantineRows),
  };

  const operatorRegisterSeasonClaim = {
    rehearsal,
    production_root_publishable: productionRootPublishable,
    claim_contract_version: claimVersion,
    proof_format: proofFormat,
    contract_address: seasonClaimAddress,
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

  return {
    manifest,
    sourceRows,
    quarantineRows,
    leaves,
    operatorRegisterSeasonClaim,
  };
}

export async function exportSeasonWar(input: SeasonWarExportInput): Promise<ExportArtifacts> {
  const artifacts = await buildSeasonWarExport(input);
  await fs.mkdir(input.outDir, { recursive: true });
  const files: Array<[string, unknown]> = [
    ['manifest.json', artifacts.manifest],
    ['source-rows.json', artifacts.sourceRows],
    ['quarantine-rows.json', artifacts.quarantineRows],
    ['leaves.json', artifacts.leaves],
    ['operator-register-season-claim.json', artifacts.operatorRegisterSeasonClaim],
  ];
  await Promise.all(files.map(([fileName, payload]) =>
    fs.writeFile(path.join(input.outDir, fileName), `${JSON.stringify(payload, null, 2)}\n`)
  ));
  return artifacts;
}
