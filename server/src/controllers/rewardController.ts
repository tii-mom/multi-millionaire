import { Request, Response, NextFunction } from 'express';
import {
  getRewardLedgerById,
  getRewardSummary,
  listRewardLedgers,
  markRewardClaimed,
  RewardStatus,
} from '../models/rewardModel';
import { hasBlockingRiskForRewardClaim } from '../models/riskModel';
import { isControlEnabled, productionChainRequired, riskReviewEnabled } from '../services/productionGuards';
import { getMerkleProofForLedger, markMerkleClaimVerified } from '../models/merkleRewardModel';
import { encodeMerkleProofCell, hashLedgerId, MerkleClaimVerificationError, verifyMerkleClaimReceipt } from '../services/merkleRewards';
import { withTransaction } from '../db';
import { insertChainEvent } from '../models/chainEventModel';

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
    const hasBlockingRisk = riskReviewEnabled() && await hasBlockingRiskForRewardClaim(ledgerId, user.id);
    if (hasBlockingRisk) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'RISK_REVIEW_REQUIRED', message: 'Reward requires risk review before claim' } });
    }

    const claimed = await markRewardClaimed(ledgerId, user.id);
    return res.json({ request_id: req.id || '', data: claimed });
  } catch (err) {
    return next(err);
  }
}

export async function getMerkleClaimProof(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const ledgerId = req.params.ledgerId;
    const ledger = await getRewardLedgerById(ledgerId);
    if (!ledger || ledger.beneficiary_user_id !== user.id) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'REWARD_NOT_FOUND', message: 'Reward ledger not found' } });
    }
    const hasBlockingRisk = riskReviewEnabled() && await hasBlockingRiskForRewardClaim(ledgerId, user.id);
    if (hasBlockingRisk) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'RISK_REVIEW_REQUIRED', message: 'Reward requires risk review before claim' } });
    }
    const proof = await getMerkleProofForLedger(ledgerId, user.id);
    if (!proof || proof.batch_status !== 'active') {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'MERKLE_PROOF_NOT_AVAILABLE', message: 'Merkle proof is not available for this reward' } });
    }
    const contractBatchId = typeof proof.batch_metadata?.contract_batch_id === 'string'
      ? proof.batch_metadata.contract_batch_id
      : '';
    return res.json({
      request_id: req.id || '',
      data: {
        ...proof,
        contract_batch_id: contractBatchId,
        ledger_id_hash: hashLedgerId(ledgerId),
        proof_boc: encodeMerkleProofCell(proof.proof),
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function submitMerkleClaimReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (await isControlEnabled('pause_reward_claims')) {
      return res.status(423).json({ request_id: req.id || '', error: { code: 'REWARD_CLAIMS_PAUSED', message: 'Reward claims are temporarily paused' } });
    }
    const ledgerId = req.params.ledgerId;
    const txHash = typeof req.body.txHash === 'string' ? req.body.txHash.trim() : '';
    if (!txHash) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'txHash is required' } });
    }
    const ledger = await getRewardLedgerById(ledgerId);
    if (!ledger || ledger.beneficiary_user_id !== user.id) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'REWARD_NOT_FOUND', message: 'Reward ledger not found' } });
    }
    const hasBlockingRisk = riskReviewEnabled() && await hasBlockingRiskForRewardClaim(ledgerId, user.id);
    if (hasBlockingRisk) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'RISK_REVIEW_REQUIRED', message: 'Reward requires risk review before claim' } });
    }

    const proof = await getMerkleProofForLedger(ledgerId, user.id);
    if (!proof || proof.batch_status !== 'active') {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'MERKLE_PROOF_NOT_AVAILABLE', message: 'Merkle proof is not available for this reward' } });
    }

    const receipt = await verifyMerkleClaimReceipt({
      txHash,
      beneficiaryWallet: proof.beneficiary_wallet,
      amountRaw: proof.amount_raw,
      ledgerIdHash: hashLedgerId(ledgerId),
      batchId: typeof proof.batch_metadata?.contract_batch_id === 'string' ? proof.batch_metadata.contract_batch_id : undefined,
    });
    const result = await withTransaction(async (tx) => {
      const eventResult = await insertChainEvent({
        chainId: proof.chain_id,
        contractAddress: receipt.contractAddress,
        contractRole: 'merkle_claim',
        eventName: 'ClaimReward',
        txHash: receipt.txHash,
        logIndex: receipt.logIndex,
        blockNumber: receipt.blockNumber,
        blockTime: receipt.blockTime,
        finalized: receipt.finalized,
        payload: {
          txHash: receipt.txHash,
          beneficiaryWallet: receipt.beneficiaryWallet,
          recipient: receipt.recipient,
          amountRaw: receipt.amountRaw,
          ledgerIdHash: receipt.ledgerIdHash,
          batchId: receipt.batchId,
        },
        applyStatus: 'applied',
        executor: tx,
      });
      if (!eventResult.inserted) {
        return { eventResult, proof: null, ledger: null };
      }

      const claimedProof = await markMerkleClaimVerified({
        ledgerId,
        userId: user.id,
        claimTxHash: receipt.txHash,
        chainEventId: eventResult.event.id,
      }, tx);
      const claimedLedger = await markRewardClaimed(ledgerId, user.id, tx);
      return { eventResult, proof: claimedProof, ledger: claimedLedger };
    });

    if (!result.eventResult.inserted || !result.proof || !result.ledger) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'DUPLICATE_CLAIM_RECEIPT', message: 'Claim receipt was already submitted or reward is no longer claimable' } });
    }

    return res.json({ request_id: req.id || '', data: { proof: result.proof, reward: result.ledger, chain_event: result.eventResult.event } });
  } catch (err) {
    if (err instanceof MerkleClaimVerificationError) {
      return res.status(err.status).json({ request_id: req.id || '', error: { code: err.code, message: err.message } });
    }
    return next(err);
  }
}
