import express from 'express';
import { createManualRiskFlag, getRiskFlags, patchRiskFlag } from '../controllers/riskController';
import { requireAdmin } from '../middlewares/admin';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/flags', getRiskFlags);
router.post('/flags', createManualRiskFlag);
router.patch('/flags/:flagId', patchRiskFlag);

export default router;
