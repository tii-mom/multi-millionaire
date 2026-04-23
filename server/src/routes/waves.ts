import express from 'express';
import { getCurrent, getById } from '../controllers/waveController';
import { claimPass } from '../controllers/passController';
import { depositPrecheck, deposit } from '../controllers/positionController';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

// GET /v1/waves/current
router.get('/current', getCurrent);

// GET /v1/waves/:waveId
router.get('/:waveId', getById);

// POST /v1/waves/:waveId/passes
router.post('/:waveId/passes', claimPass);

// POST /v1/waves/:waveId/deposit-precheck
router.post('/:waveId/deposit-precheck', requireAuth, depositPrecheck);

// POST /v1/waves/:waveId/deposit
router.post('/:waveId/deposit', requireAuth, deposit);

export default router;