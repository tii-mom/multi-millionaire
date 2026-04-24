import { query, QueryExecutor } from '../db';

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

export async function markRewardClaimed(ledgerId: string, userId: string): Promise<RewardLedger | null> {
  const result = await query<RewardLedger>(
    `UPDATE reward_ledgers
     SET status = 'claimed', updated_at = NOW()
     WHERE id = $1 AND beneficiary_user_id = $2 AND status = 'approved'
     RETURNING ${rewardLedgerColumns}`,
    [ledgerId, userId]
  );
  return result.rows[0] || null;
}
