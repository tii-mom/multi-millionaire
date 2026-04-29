import { QueryExecutor } from '../db';
import { createPosition, Position } from '../models/positionModel';
import { getLatestConfirmedPrice } from '../models/priceModel';
import { getReferral, lockReferral } from '../models/referralModel';
import { createRewardLedger } from '../models/rewardModel';
import { createRiskFlag } from '../models/riskModel';
import { activateSquadMember } from '../models/squadModel';
import { Wave } from '../models/waveModel';
import { isControlEnabled, riskReviewEnabled } from './productionGuards';

export type DepositApplySource = 'offchain_stub' | 'chain_receipt';

export interface ApplyDepositInput {
  userId: string;
  wave: Wave;
  amountRaw: string;
  onchainPositionId: string;
  unlockMultiplierBps: number;
  source: DepositApplySource;
  trackRapidDepositBurst: boolean;
  executor: QueryExecutor;
}

export interface ApplyDepositResult {
  position: Position;
  qualifies: boolean;
  isFirstQualifyingForUser: boolean;
}

function calculateDirectReward(amountRaw: string, rewardRateBps: number, perInviteCapRaw: string): { grossAmount: string; finalAmount: string } {
  const grossAmount = (BigInt(amountRaw) * BigInt(rewardRateBps)) / BigInt(10000);
  const cap = BigInt(perInviteCapRaw || '0');
  const finalAmount = cap > BigInt(0) && grossAmount > cap ? cap : grossAmount;
  return { grossAmount: grossAmount.toString(), finalAmount: finalAmount.toString() };
}

async function calculateCappedDirectReward(input: {
  executor: QueryExecutor;
  wave: Wave;
  inviterUserId: string;
  grossAmount: string;
  perInviteFinalAmount: string;
}): Promise<string> {
  let finalAmount = BigInt(input.perInviteFinalAmount);
  const inviterWaveCap = BigInt(input.wave.inviter_wave_cap || '0');
  if (inviterWaveCap > BigInt(0)) {
    const inviterAllocated = await input.executor.query<{ allocated_amount_raw: string }>(
      `SELECT COALESCE(SUM(final_amount), 0)::text AS allocated_amount_raw
       FROM reward_ledgers
       WHERE wave_id = $1
         AND beneficiary_user_id = $2
         AND reward_type = 'direct_referral'
         AND status <> 'rejected'`,
      [input.wave.wave_id, input.inviterUserId]
    );
    const used = BigInt(inviterAllocated.rows[0]?.allocated_amount_raw || '0');
    const remaining = inviterWaveCap > used ? inviterWaveCap - used : BigInt(0);
    finalAmount = finalAmount > remaining ? remaining : finalAmount;
  }

  const rewardBudget = BigInt(input.wave.reward_budget || '0');
  if (rewardBudget > BigInt(0)) {
    const waveAllocated = await input.executor.query<{ allocated_amount_raw: string }>(
      `SELECT COALESCE(SUM(final_amount), 0)::text AS allocated_amount_raw
       FROM reward_ledgers
       WHERE wave_id = $1
         AND reward_type = 'direct_referral'
         AND status <> 'rejected'`,
      [input.wave.wave_id]
    );
    const used = BigInt(waveAllocated.rows[0]?.allocated_amount_raw || '0');
    const remaining = rewardBudget > used ? rewardBudget - used : BigInt(0);
    finalAmount = finalAmount > remaining ? remaining : finalAmount;
  }

  return finalAmount.toString();
}

function getHighRiskDepositThreshold(): bigint | null {
  const raw = process.env.HIGH_RISK_DEPOSIT_THRESHOLD;
  if (!raw) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function highRiskNote(source: DepositApplySource, threshold: bigint) {
  const qualifier = source === 'chain_receipt' ? 'chain lock' : 'lock';
  return `First qualifying ${qualifier} exceeded configured threshold ${threshold.toString()}`;
}

export async function applyDeposit(input: ApplyDepositInput): Promise<ApplyDepositResult> {
  const shouldRunRiskReview = riskReviewEnabled();
  const amount = BigInt(input.amountRaw);
  const qualifies = amount >= BigInt(input.wave.min_lock_amount);
  const existing = await input.executor.query<{ count: string }>(
    `SELECT COUNT(*) FROM positions WHERE user_id = $1 AND qualifies_for_activation = TRUE`,
    [input.userId]
  );
  const isFirstQualifyingForUser = qualifies && existing.rows[0].count === '0';
  const price = await getLatestConfirmedPrice();
  const position = await createPosition(
    input.userId,
    input.wave.wave_id,
    input.amountRaw,
    input.onchainPositionId,
    price ? price.price : '0',
    input.unlockMultiplierBps,
    qualifies,
    isFirstQualifyingForUser,
    input.executor
  );

  if (qualifies && isFirstQualifyingForUser && !(await isControlEnabled('pause_referral_rewards'))) {
    const referral = await getReferral(input.userId, input.executor);
    if (referral?.inviter_user_id && referral.inviter_user_id !== input.userId) {
      const rewardAmounts = calculateDirectReward(input.amountRaw, input.wave.direct_reward_rate_bps, input.wave.per_invite_cap);
      const finalAmount = await calculateCappedDirectReward({
        executor: input.executor,
        wave: input.wave,
        inviterUserId: referral.inviter_user_id,
        grossAmount: rewardAmounts.grossAmount,
        perInviteFinalAmount: rewardAmounts.finalAmount,
      });
      if (BigInt(finalAmount) > BigInt(0)) {
        await createRewardLedger({
          beneficiaryUserId: referral.inviter_user_id,
          sourceUserId: input.userId,
          sourcePositionId: position.id,
          waveId: input.wave.wave_id,
          grossAmount: rewardAmounts.grossAmount,
          finalAmount,
          status: 'approved',
        }, input.executor);
      }
    }
  }

  if (isFirstQualifyingForUser) {
    await lockReferral(input.userId, input.executor);
  }
  if (qualifies) {
    await activateSquadMember(input.wave.wave_id, input.userId, input.executor);
  }

  if (shouldRunRiskReview && input.trackRapidDepositBurst) {
    const recentDeposits = await input.executor.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM positions
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '10 minutes'`,
      [input.userId]
    );
    if (Number(recentDeposits.rows[0]?.count || 0) >= 3) {
      await createRiskFlag({
        entityType: 'user',
        entityId: input.userId,
        flagType: 'rapid_deposit_burst',
        severity: 'medium',
        note: 'User reached at least 3 deposits in 10 minutes',
      }, input.executor);
    }
  }

  const highRiskThreshold = shouldRunRiskReview ? getHighRiskDepositThreshold() : null;
  if (qualifies && isFirstQualifyingForUser && highRiskThreshold !== null && amount > highRiskThreshold) {
    await createRiskFlag({
      entityType: 'position',
      entityId: position.id,
      flagType: 'high_value_first_lock',
      severity: 'medium',
      note: highRiskNote(input.source, highRiskThreshold),
    }, input.executor);
  }

  return { position, qualifies, isFirstQualifyingForUser };
}
