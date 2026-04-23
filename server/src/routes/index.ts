import express from 'express';
import appRouter from './app';
import wavesRouter from './waves';
import authRouter from './auth';
import referralRouter from './referral';
import pricesRouter from './prices';

const router = express.Router();

router.use('/app', appRouter);
router.use('/waves', wavesRouter);
router.use('/auth', authRouter);
router.use('/referrals', referralRouter);
router.use('/prices', pricesRouter);

export default router;
