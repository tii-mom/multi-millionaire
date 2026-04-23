import express from 'express';
import { getDashboard, getRewards, getRiskFlags, getSquads, getWaves } from '../controllers/adminController';
import { requireAdmin } from '../middlewares/admin';
import { requireAuth } from '../middlewares/auth';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/dashboard', getDashboard);
router.get('/waves', getWaves);
router.get('/risk/flags', getRiskFlags);
router.get('/rewards', getRewards);
router.get('/squads', getSquads);

export default router;
