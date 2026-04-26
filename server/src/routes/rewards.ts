import express from 'express';
import { claimReward, getMerkleClaimProof, listRewards, rewardSummary, submitMerkleClaimReceipt } from '../controllers/rewardController';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

router.get('/summary', requireAuth, rewardSummary);
router.get('/', requireAuth, listRewards);
router.get('/:ledgerId/merkle-proof', requireAuth, getMerkleClaimProof);
router.post('/:ledgerId/claim-receipt', requireAuth, submitMerkleClaimReceipt);
router.post('/:ledgerId/staging-mvp/claim', requireAuth, claimReward);
router.post('/:ledgerId/claim', requireAuth, claimReward);

export default router;
