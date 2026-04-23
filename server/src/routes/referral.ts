import express from 'express';
import { confirmReferral } from '../controllers/referralController';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

// POST /v1/referrals/confirm
router.post('/confirm', requireAuth, confirmReferral);

export default router;