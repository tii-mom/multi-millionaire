import express from 'express';
import { claimReward, listRewards, rewardSummary } from '../controllers/rewardController';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

router.get('/summary', requireAuth, rewardSummary);
router.get('/', requireAuth, listRewards);
router.post('/:ledgerId/claim', requireAuth, claimReward);

export default router;
