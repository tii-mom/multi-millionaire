import { Request, Response, NextFunction } from 'express';
import {
  getRewardLedgerById,
  getRewardSummary,
  listRewardLedgers,
  markRewardClaimed,
  RewardStatus,
} from '../models/rewardModel';
import { hasBlockingRiskForRewardClaim } from '../models/riskModel';
import { isControlEnabled, productionChainRequired } from '../services/productionGuards';

const allowedStatuses = new Set<RewardStatus>(['pending', 'approved', 'claimed', 'rejected']);

export async function rewardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const summary = await getRewardSummary(user.id);
    return res.json({ request_id: req.id || '', data: summary });
  } catch (err) {
    return next(err);
  }
}

export async function listRewards(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !allowedStatuses.has(status as RewardStatus)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_STATUS', message: 'Invalid reward status' } });
    }

    const rewards = await listRewardLedgers(user.id, status as RewardStatus | undefined);
    return res.json({ request_id: req.id || '', data: rewards });
  } catch (err) {
    return next(err);
  }
}

/**
 * Off-chain reward claim stub.
 *
 * Sprint 1 does not transfer tokens on-chain. This endpoint only validates
 * ownership/status and records the ledger as claimed in PostgreSQL. Real
 * contract-backed reward distribution belongs in Sprint 2.
 */
export async function claimReward(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (await isControlEnabled('pause_reward_claims')) {
      return res.status(423).json({ request_id: req.id || '', error: { code: 'REWARD_CLAIMS_PAUSED', message: 'Reward claims are temporarily paused' } });
    }
    if (productionChainRequired()) {
      return res.status(409).json({
        request_id: req.id || '',
        error: {
          code: 'CHAIN_REWARD_CLAIM_REQUIRED',
          message: 'Production reward claims must be confirmed by the chain-backed reward distribution flow',
        },
      });
    }

    const ledgerId = req.params.ledgerId;
    const ledger = await getRewardLedgerById(ledgerId);
    if (!ledger || ledger.beneficiary_user_id !== user.id) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'REWARD_NOT_FOUND', message: 'Reward ledger not found' } });
    }
    if (ledger.status !== 'approved') {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'REWARD_NOT_APPROVED', message: 'Only approved rewards can be claimed' } });
    }
    const hasBlockingRisk = await hasBlockingRiskForRewardClaim(ledgerId, user.id);
    if (hasBlockingRisk) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'RISK_REVIEW_REQUIRED', message: 'Reward requires risk review before claim' } });
    }

    const claimed = await markRewardClaimed(ledgerId, user.id);
    return res.json({ request_id: req.id || '', data: claimed });
  } catch (err) {
    return next(err);
  }
}
