import express from 'express';
import { getMyDepositStreak, saveDepositStreakGoal } from '../controllers/depositStreakController';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

router.get('/me', requireAuth, getMyDepositStreak);
router.post('/goal', requireAuth, saveDepositStreakGoal);

export default router;
