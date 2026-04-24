import { Request, Response, NextFunction } from 'express';
import { getLatestConfirmedPrice } from '../models/priceModel';
import { createPosition } from '../models/positionModel';
import { getReferral, lockReferral } from '../models/referralModel';
import { createRewardLedger } from '../models/rewardModel';
import { createRiskFlag } from '../models/riskModel';
import { activateSquadMember } from '../models/squadModel';
import { getWaveById } from '../models/waveModel';
import { query } from '../db';
import { insertChainEvent } from '../models/chainEventModel';
import { findVerifiedWalletBinding } from '../models/walletBindingModel';
import { isControlEnabled } from '../services/productionGuards';
import { ReceiptVerificationError, verifyDepositReceipt } from '../services/receiptVerifier';

function calculateDirectReward(amountRaw: string, rewardRateBps: number, perInviteCapRaw: string): { grossAmount: string; finalAmount: string } {
  const grossAmount = (BigInt(amountRaw) * BigInt(rewardRateBps)) / BigInt(10000);
  const cap = BigInt(perInviteCapRaw || '0');
  const finalAmount = cap > BigInt(0) && grossAmount > cap ? cap : grossAmount;
  return { grossAmount: grossAmount.toString(), finalAmount: finalAmount.toString() };
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

function receiptPayload(receipt: Awaited<ReturnType<typeof verifyDepositReceipt>>): Record<string, unknown> {
  return {
    chainId: receipt.chainId,
    txHash: receipt.txHash,
    logIndex: receipt.logIndex,
    walletAddress: receipt.walletAddress,
    contractAddress: receipt.contractAddress,
    amountRaw: receipt.amountRaw,
    positionId: receipt.positionId,
    blockNumber: receipt.blockNumber,
    blockTime: receipt.blockTime,
    finalized: receipt.finalized,
  };
}

export async function depositReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (await isControlEnabled('pause_deposits')) {
      return res.status(423).json({ request_id: req.id || '', error: { code: 'DEPOSITS_PAUSED', message: 'Deposits are temporarily paused' } });
    }

    const waveId = Number(req.params.waveId);
    const wave = await getWaveById(waveId);
    if (!wave || wave.status !== 'live' || wave.deposits_disabled) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WAVE', message: 'Wave is not live for deposits' } });
    }

    const receipt = await verifyDepositReceipt(req.body);
    if (receipt.amountRaw !== String(req.body.amount || receipt.amountRaw)) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'AMOUNT_MISMATCH', message: 'Receipt amount does not match submitted amount' } });
    }

    const wallet = await findVerifiedWalletBinding(receipt.chainId, receipt.walletAddress);
    if (!wallet || wallet.user_id !== user.id) {
      const inserted = await insertChainEvent({
        chainId: receipt.chainId,
        contractAddress: receipt.contractAddress,
        contractRole: 'lock_vault',
        eventName: 'Deposited',
        txHash: receipt.txHash,
        logIndex: receipt.logIndex,
        blockNumber: receipt.blockNumber,
        blockTime: receipt.blockTime,
        finalized: receipt.finalized,
        payload: receiptPayload(receipt),
        applyStatus: 'review_required',
        reviewReason: 'wallet_not_bound_to_user',
      });
      return res.status(409).json({
        request_id: req.id || '',
        error: { code: 'WALLET_REVIEW_REQUIRED', message: 'Receipt wallet is not verified for this user' },
        data: { chain_event_id: inserted.event.id },
      });
    }

    const eventResult = await insertChainEvent({
      chainId: receipt.chainId,
      contractAddress: receipt.contractAddress,
      contractRole: 'lock_vault',
      eventName: 'Deposited',
      txHash: receipt.txHash,
      logIndex: receipt.logIndex,
      blockNumber: receipt.blockNumber,
      blockTime: receipt.blockTime,
      finalized: receipt.finalized,
      payload: receiptPayload(receipt),
      applyStatus: 'applied',
    });
    if (!eventResult.inserted) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'DUPLICATE_CHAIN_EVENT', message: 'Deposit receipt was already submitted' } });
    }

    const amountRaw = BigInt(receipt.amountRaw);
    const qualifies = amountRaw >= BigInt(wave.min_lock_amount);
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) FROM positions WHERE user_id = $1 AND qualifies_for_activation = TRUE`,
      [user.id]
    );
    const isFirst = qualifies && existing.rows[0].count === '0';
    const price = await getLatestConfirmedPrice();
    const position = await createPosition(
      user.id,
      waveId,
      receipt.amountRaw,
      receipt.positionId,
      price ? price.price : '0',
      wave.unlock_multiplier_bps,
      qualifies,
      isFirst
    );

    if (qualifies && isFirst && !(await isControlEnabled('pause_referral_rewards'))) {
      const referral = await getReferral(user.id);
      if (referral?.inviter_user_id && referral.inviter_user_id !== user.id) {
        const rewardAmounts = calculateDirectReward(receipt.amountRaw, wave.direct_reward_rate_bps, wave.per_invite_cap);
        await createRewardLedger({
          beneficiaryUserId: referral.inviter_user_id,
          sourceUserId: user.id,
          sourcePositionId: position.id,
          waveId,
          grossAmount: rewardAmounts.grossAmount,
          finalAmount: rewardAmounts.finalAmount,
          status: 'approved',
        });
      }
    }
    if (isFirst) {
      await lockReferral(user.id);
    }
    if (qualifies) {
      await activateSquadMember(waveId, user.id);
    }

    const highRiskThreshold = getHighRiskDepositThreshold();
    if (qualifies && isFirst && highRiskThreshold !== null && amountRaw > highRiskThreshold) {
      await createRiskFlag({
        entityType: 'position',
        entityId: position.id,
        flagType: 'high_value_first_lock',
        severity: 'medium',
        note: `First qualifying chain lock exceeded configured threshold ${highRiskThreshold.toString()}`,
      });
    }

    return res.status(201).json({ request_id: req.id || '', data: { position, chain_event: eventResult.event } });
  } catch (err) {
    if (err instanceof ReceiptVerificationError) {
      return res.status(err.status).json({ request_id: req.id || '', error: { code: err.code, message: err.message } });
    }
    return next(err);
  }
}
