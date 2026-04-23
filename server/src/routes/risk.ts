import express from 'express';
import { createManualRiskFlag, getRiskFlags, patchRiskFlag } from '../controllers/riskController';
import { requireAdmin } from '../middlewares/admin';
import { requireAuth } from '../middlewares/auth';
import { createRouteRateLimiter } from '../middlewares/rateLimit';
import { requireAnyBodyField, requireFields } from '../middlewares/validation';

const router = express.Router();
const riskAdminRateLimit = createRouteRateLimiter('RISK_ADMIN_RATE_LIMIT', 60 * 1000, 30);

router.use(requireAuth, requireAdmin, riskAdminRateLimit);

router.get('/flags', getRiskFlags);
router.post('/flags', requireFields('body', ['entity_type', 'entity_id', 'flag_type', 'severity']), createManualRiskFlag);
router.patch('/flags/:flagId', requireAnyBodyField(['severity', 'status', 'note']), patchRiskFlag);

export default router;
