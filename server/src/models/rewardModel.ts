import { query, QueryExecutor } from '../db';
import { getMySquadView, listSquadsForWave } from './squadModel';
import {
  calculateSeasonWarPoolAmounts,
  SEASON_WAR_POOL_BPS,
  SEASON_WAR_ROUND_REWARD_RAW,
  SeasonRewardPool,
} from '../services/seasonRewards';

export type RewardStatus = 'pending' | 'approved' | 'claimed' | 'rejected';

export interface RewardLedger {
  id: string;
  beneficiary_user_id: string;
  source_user_id: string;
  source_position_id: string;
  wave_id: number;
  reward_type: string;
  gross_amount: string;
  final_amount: string;
  status: RewardStatus;
  created_at: Date;
  updated_at: Date;
}

export interface RewardSummary {
  pending_amount: string;
  approved_amount: string;
  claimed_amount: string;
}

export interface RewardEstimateCategory {
  category: SeasonRewardPool;
  bps: number;
  pool_amount_raw: string;
  estimate_amount_raw: string;
  basis: string;
}

export interface RewardEstimate {
  wave_id: number;
  token_decimals: number;
  release_amount_raw: string;
  categories: RewardEstimateCategory[];
  total_estimate_raw: string;
  ledger_totals: {
    pending_amount_raw: string;
    approved_amount_raw: string;
    claimed_amount_raw: string;
  };
  context: {
    user_locked_raw: string;
    wave_locked_raw: string;
    squad_locked_raw: string;
    ranked_squad_count: number;
    squad_rank: number | null;
  };
}

interface CreateRewardLedgerInput {
  beneficiaryUserId: string;
  sourceUserId: string;
  sourcePositionId: string;
  waveId: number;
  rewardType?: string;
  grossAmount: string;
  finalAmount: string;
  status: RewardStatus;
}

const rewardLedgerColumns = `
  id, beneficiary_user_id, source_user_id, source_position_id, wave_id,
  reward_type, gross_amount, final_amount, status, created_at, updated_at
`;

export async function createRewardLedger(input: CreateRewardLedgerInput, executor?: QueryExecutor): Promise<RewardLedger | null> {
  const db = executor || { query };
  const result = await db.query<RewardLedger>(
    `INSERT INTO reward_ledgers (
       beneficiary_user_id, source_user_id, source_position_id, wave_id,
       reward_type, gross_amount, final_amount, status, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (source_position_id, reward_type) DO NOTHING
     RETURNING ${rewardLedgerColumns}`,
    [
      input.beneficiaryUserId,
      input.sourceUserId,
      input.sourcePositionId,
      input.waveId,
      input.rewardType || 'direct_referral',
      input.grossAmount,
      input.finalAmount,
      input.status,
    ]
  );
  return result.rows[0] || null;
}

export async function getRewardSummary(userId: string): Promise<RewardSummary> {
  const result = await query<RewardSummary>(
    `SELECT
       COALESCE(SUM(final_amount) FILTER (WHERE status = 'pending'), 0)::text AS pending_amount,
       COALESCE(SUM(final_amount) FILTER (WHERE status = 'approved'), 0)::text AS approved_amount,
       COALESCE(SUM(final_amount) FILTER (WHERE status = 'claimed'), 0)::text AS claimed_amount
     FROM reward_ledgers
     WHERE beneficiary_user_id = $1`,
    [userId]
  );
  return result.rows[0] || { pending_amount: '0', approved_amount: '0', claimed_amount: '0' };
}

function safeProportionalAmount(poolRaw: string, numeratorRaw: string, denominatorRaw: string): string {
  const pool = BigInt(poolRaw || '0');
  const numerator = BigInt(numeratorRaw || '0');
  const denominator = BigInt(denominatorRaw || '0');
  if (pool <= BigInt(0) || numerator <= BigInt(0) || denominator <= BigInt(0)) {
    return '0';
  }
  return ((pool * numerator) / denominator).toString();
}

export async function getRewardEstimate(waveId: number, userId: string): Promise<RewardEstimate> {
  const poolAmounts = calculateSeasonWarPoolAmounts();
  const [waveTotal, userTotal, ledgerTotals, mySquad, squads] = await Promise.all([
    query<{ wave_locked_raw: string }>(
      `SELECT COALESCE(SUM(amount_raw) FILTER (WHERE withdrawn = FALSE), 0)::text AS wave_locked_raw
       FROM positions
       WHERE wave_id = $1`,
      [waveId]
    ),
    query<{ user_locked_raw: string }>(
      `SELECT COALESCE(SUM(amount_raw) FILTER (WHERE withdrawn = FALSE), 0)::text AS user_locked_raw
       FROM positions
       WHERE wave_id = $1 AND user_id = $2`,
      [waveId, userId]
    ),
    query<{ pending_amount_raw: string; approved_amount_raw: string; claimed_amount_raw: string; approved_referral_amount_raw: string }>(
      `SELECT
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'pending'), 0)::text AS pending_amount_raw,
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'approved'), 0)::text AS approved_amount_raw,
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'claimed'), 0)::text AS claimed_amount_raw,
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'approved' AND reward_type = 'direct_referral'), 0)::text AS approved_referral_amount_raw
       FROM reward_ledgers
       WHERE wave_id = $1 AND beneficiary_user_id = $2`,
      [waveId, userId]
    ),
    getMySquadView(waveId, userId).catch(() => null),
    listSquadsForWave(waveId).catch(() => []),
  ]);

  const waveLockedRaw = waveTotal.rows[0]?.wave_locked_raw || '0';
  const userLockedRaw = userTotal.rows[0]?.user_locked_raw || '0';
  const squadLockedRaw = mySquad?.total_locked_raw || '0';
  const totalSquadLockedRaw = squads.reduce((sum, squad) => sum + BigInt(squad.total_locked || '0'), BigInt(0)).toString();
  const referralLedgerRaw = ledgerTotals.rows[0]?.approved_referral_amount_raw || '0';
  const leaderboardEstimateRaw = mySquad?.rank && mySquad.rank <= 10
    ? (BigInt(poolAmounts.leaderboard) / BigInt(10)).toString()
    : '0';

  const categories: RewardEstimateCategory[] = [
    {
      category: 'personal',
      bps: SEASON_WAR_POOL_BPS.personal,
      pool_amount_raw: poolAmounts.personal,
      estimate_amount_raw: safeProportionalAmount(poolAmounts.personal, userLockedRaw, waveLockedRaw),
      basis: 'user_locked_share',
    },
    {
      category: 'team',
      bps: SEASON_WAR_POOL_BPS.team,
      pool_amount_raw: poolAmounts.team,
      estimate_amount_raw: safeProportionalAmount(poolAmounts.team, squadLockedRaw, totalSquadLockedRaw),
      basis: 'squad_locked_share',
    },
    {
      category: 'referral',
      bps: SEASON_WAR_POOL_BPS.referral,
      pool_amount_raw: poolAmounts.referral,
      estimate_amount_raw: referralLedgerRaw,
      basis: 'current_approved_referral_ledgers',
    },
    {
      category: 'leaderboard',
      bps: SEASON_WAR_POOL_BPS.leaderboard,
      pool_amount_raw: poolAmounts.leaderboard,
      estimate_amount_raw: leaderboardEstimateRaw,
      basis: 'top_10_squad_rank_placeholder',
    },
  ];

  const totalEstimateRaw = categories.reduce((sum, category) => sum + BigInt(category.estimate_amount_raw || '0'), BigInt(0)).toString();

  return {
    wave_id: waveId,
    token_decimals: 9,
    release_amount_raw: SEASON_WAR_ROUND_REWARD_RAW,
    categories,
    total_estimate_raw: totalEstimateRaw,
    ledger_totals: ledgerTotals.rows[0] || {
      pending_amount_raw: '0',
      approved_amount_raw: '0',
      claimed_amount_raw: '0',
    },
    context: {
      user_locked_raw: userLockedRaw,
      wave_locked_raw: waveLockedRaw,
      squad_locked_raw: squadLockedRaw,
      ranked_squad_count: squads.length,
      squad_rank: mySquad?.rank ?? null,
    },
  };
}

export async function listRewardLedgers(userId: string, status?: RewardStatus): Promise<RewardLedger[]> {
  const params: any[] = [userId];
  let where = 'beneficiary_user_id = $1';
  if (status) {
    params.push(status);
    where += ' AND status = $2';
  }

  const result = await query<RewardLedger>(
    `SELECT ${rewardLedgerColumns}
     FROM reward_ledgers
     WHERE ${where}
     ORDER BY created_at DESC`,
    params
  );
  return result.rows;
}

export async function getRewardLedgerById(ledgerId: string): Promise<RewardLedger | null> {
  const result = await query<RewardLedger>(
    `SELECT ${rewardLedgerColumns}
     FROM reward_ledgers
     WHERE id = $1`,
    [ledgerId]
  );
  return result.rows[0] || null;
}

export async function markRewardClaimed(ledgerId: string, userId: string, executor?: QueryExecutor): Promise<RewardLedger | null> {
  const db = executor || { query };
  const result = await db.query<RewardLedger>(
    `UPDATE reward_ledgers
     SET status = 'claimed', updated_at = NOW()
     WHERE id = $1 AND beneficiary_user_id = $2 AND status = 'approved'
     RETURNING ${rewardLedgerColumns}`,
    [ledgerId, userId]
  );
  return result.rows[0] || null;
}
