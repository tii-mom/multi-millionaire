import express from 'express';
import { confirmReferral } from '../controllers/referralController';
import { requireAuth } from '../middlewares/auth';
import { requireFields } from '../middlewares/validation';

const router = express.Router();

// POST /v1/referrals/confirm
router.post('/confirm', requireAuth, requireFields('body', ['inviterEmail']), confirmReferral);

export default router;
