import express from 'express';
import { register, login, createWalletAuthIntent, walletLogin } from '../controllers/authController';
import { requireFields } from '../middlewares/validation';
import { createRouteRateLimiter } from '../middlewares/rateLimit';

const router = express.Router();
const authRateLimit = createRouteRateLimiter('AUTH_RATE_LIMIT', 15 * 60 * 1000, 10);

// POST /v1/auth/register
router.use(authRateLimit);
router.post('/register', requireFields('body', ['email', 'password']), register);

// POST /v1/auth/login
router.post('/login', requireFields('body', ['email', 'password']), login);
router.post('/wallet-intent', createWalletAuthIntent);
router.post('/wallet', requireFields('body', ['walletAddress', 'signature', 'intentToken']), walletLogin);

export default router;
