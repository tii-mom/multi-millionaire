import express from 'express';
import { getCurrent, getById } from '../controllers/waveController';
import { claimPass } from '../controllers/passController';
import { depositPrecheck, deposit } from '../controllers/positionController';
import { requireAuth } from '../middlewares/auth';
import squadsRouter from './squads';

const router = express.Router();

// GET /v1/waves/current
router.get('/current', getCurrent);

// GET /v1/waves/:waveId
router.get('/:waveId', getById);

// /v1/waves/:waveId/squads
router.use('/:waveId/squads', squadsRouter);

// POST /v1/waves/:waveId/passes
router.post('/:waveId/passes', requireAuth, claimPass);

// POST /v1/waves/:waveId/deposit-precheck
router.post('/:waveId/deposit-precheck', requireAuth, depositPrecheck);

// POST /v1/waves/:waveId/deposit
router.post('/:waveId/deposit', requireAuth, deposit);

export default router;
