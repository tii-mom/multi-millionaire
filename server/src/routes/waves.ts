import express from 'express';
import { getCurrent, getById } from '../controllers/waveController';
import { claimPass } from '../controllers/passController';
import { depositPrecheck, deposit } from '../controllers/positionController';
import { depositReceipt, deriveJettonWallet } from '../controllers/chainController';
import { requireAuth } from '../middlewares/auth';
import squadsRouter from './squads';
import { requireFields, requirePositiveIntParam } from '../middlewares/validation';
import { createRouteRateLimiter } from '../middlewares/rateLimit';

const router = express.Router();
const depositRateLimit = createRouteRateLimiter('DEPOSIT_RATE_LIMIT', 10 * 60 * 1000, 20);

// GET /v1/waves/current
router.get('/current', getCurrent);

// GET /v1/waves/chain/jetton-wallet?owner=<wallet>
router.get('/chain/jetton-wallet', requireAuth, deriveJettonWallet);

// GET /v1/waves/:waveId
router.get('/:waveId', requirePositiveIntParam('waveId'), getById);

// /v1/waves/:waveId/squads
router.use('/:waveId/squads', squadsRouter);

// POST /v1/waves/:waveId/passes
router.post('/:waveId/passes', requireAuth, requirePositiveIntParam('waveId'), claimPass);

// POST /v1/waves/:waveId/deposit-precheck
router.post('/:waveId/deposit-precheck', requireAuth, requirePositiveIntParam('waveId'), depositPrecheck);

const stagingMvpDepositHandlers = [
  requireAuth,
  depositRateLimit,
  requirePositiveIntParam('waveId'),
  requireFields('body', ['amount']),
  deposit,
] as const;

// POST /v1/waves/:waveId/staging-mvp/deposit
router.post('/:waveId/staging-mvp/deposit', ...stagingMvpDepositHandlers);

// Legacy alias kept for existing staging clients. Production still fails closed.
router.post('/:waveId/deposit', ...stagingMvpDepositHandlers);

// POST /v1/waves/:waveId/deposit-receipt
router.post(
  '/:waveId/deposit-receipt',
  requireAuth,
  depositRateLimit,
  requirePositiveIntParam('waveId'),
  requireFields('body', ['txHash']),
  depositReceipt
);

export default router;
