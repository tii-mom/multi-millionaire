import express from 'express';
import { bindWallet, createBindIntent, listMyWallets } from '../controllers/walletController';
import { requireAuth } from '../middlewares/auth';
import { requireFields } from '../middlewares/validation';

const router = express.Router();

router.post('/bind-intent', requireAuth, requireFields('body', ['walletAddress']), createBindIntent);
router.post('/bind', requireAuth, requireFields('body', ['nonce', 'walletAddress', 'signature']), bindWallet);
router.get('/me', requireAuth, listMyWallets);

export default router;
