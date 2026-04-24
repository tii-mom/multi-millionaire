import express from 'express';
import {
  getAuditLogs,
  getChainEvents,
  getControls,
  getDashboard,
  getOpsDiagnostics,
  getMerkleBatches,
  getMerkleProofs,
  getRewards,
  getRiskFlags,
  getSquads,
  getWaves,
  patchControl,
  postMerkleDraftBatch,
} from '../controllers/adminController';
import { requireAdmin } from '../middlewares/admin';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/dashboard', getDashboard);
router.get('/waves', getWaves);
router.get('/risk/flags', getRiskFlags);
router.get('/rewards', getRewards);
router.get('/squads', getSquads);
router.get('/controls', getControls);
router.patch('/controls/:key', patchControl);
router.get('/audit-logs', getAuditLogs);
router.get('/chain-events', getChainEvents);
router.get('/ops', getOpsDiagnostics);
router.get('/merkle/batches', getMerkleBatches);
router.post('/merkle/batches/draft', postMerkleDraftBatch);
router.get('/merkle/proofs', getMerkleProofs);

export default router;
