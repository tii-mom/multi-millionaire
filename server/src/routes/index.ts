import express from 'express';
import appRouter from './app';
import wavesRouter from './waves';
import authRouter from './auth';
import referralRouter from './referral';
import pricesRouter from './prices';
import rewardsRouter from './rewards';
import riskRouter from './risk';
import adminRouter from './admin';
import walletRouter from './wallet';
import seasonWarRouter from './seasonWar';

const router = express.Router();

router.use('/app', appRouter);
router.use('/waves', wavesRouter);
router.use('/auth', authRouter);
router.use('/referrals', referralRouter);
router.use('/prices', pricesRouter);
router.use('/rewards', rewardsRouter);
router.use('/risk', riskRouter);
router.use('/admin', adminRouter);
router.use('/wallet', walletRouter);
router.use('/season-war', seasonWarRouter);

export default router;
