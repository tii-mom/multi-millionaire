import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findByEmail } from '../models/userModel';
import { loadContractIntegrationConfig } from '../services/contracts/config';
import { isPlausibleWalletAddress, verifyWalletSignature, WalletSignatureVerificationError } from '../services/walletSignatureVerifier';
import { normalizeWalletAddress, upsertVerifiedWalletBinding } from '../models/walletBindingModel';
import { getJwtSecret } from '../services/authSecrets';

const SALT_ROUNDS = 10;
const WALLET_AUTH_INTENT_TTL_SECONDS = 300;

function signUserToken(user: { id: string; email: string }) {
  return jwt.sign({ userId: user.id, email: user.email }, getJwtSecret(), { expiresIn: '7d' });
}

function walletBindingEnabled(): boolean {
  return process.env.WALLET_BINDING_ENABLED === 'true';
}

/**
 * Register a new user. Requires an email and password in the body. Returns
 * a signed JWT on success. If the email is already taken, returns 409.
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Email and password required' } });
    }
    const existing = await findByEmail(email);
    if (existing) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'EMAIL_TAKEN', message: 'A user with this email already exists' } });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser(email, passwordHash);
    const token = signUserToken(user);
    return res.status(201).json({ request_id: req.id || '', data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Login a user by email and password. Returns a signed JWT on success. If
 * credentials are invalid, returns 401.
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Email and password required' } });
    }
    const user = await findByEmail(email);
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const token = signUserToken(user);
    return res.json({ request_id: req.id || '', data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    return next(err);
  }
}

export async function createWalletAuthIntent(req: Request, res: Response, next: NextFunction) {
  try {
    if (!walletBindingEnabled()) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'WALLET_BINDING_DISABLED', message: 'Wallet binding is not enabled' } });
    }
    const walletAddress = typeof req.body.walletAddress === 'string' ? req.body.walletAddress.trim() : '';
    if (walletAddress && !isPlausibleWalletAddress(walletAddress)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WALLET_ADDRESS', message: 'walletAddress is not valid for the configured chain' } });
    }
    const config = loadContractIntegrationConfig();
    const domain = config.walletBinding.messageDomain || process.env.WALLET_BINDING_MESSAGE_DOMAIN;
    if (!domain) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'WALLET_AUTH_NOT_CONFIGURED', message: 'Wallet auth domain is not configured' } });
    }
    const nonce = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + WALLET_AUTH_INTENT_TTL_SECONDS * 1000);
    const intentToken = jwt.sign(
      {
        type: 'wallet_auth_intent',
        chainId: config.chainId,
        walletAddress: walletAddress || null,
        normalizedAddress: walletAddress ? normalizeWalletAddress(walletAddress) : null,
        nonce,
      },
      getJwtSecret(),
      { expiresIn: WALLET_AUTH_INTENT_TTL_SECONDS }
    );
    return res.status(201).json({
      request_id: req.id || '',
      data: {
        chain_id: config.chainId,
        wallet_address: walletAddress || null,
        nonce,
        payload: nonce,
        domain,
        expires_at: expiresAt.toISOString(),
        intent_token: intentToken,
      },
    });
  } catch (err) {
    return next(err);
  }
}

export async function walletLogin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!walletBindingEnabled()) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'WALLET_BINDING_DISABLED', message: 'Wallet binding is not enabled' } });
    }
    const walletAddress = typeof req.body.walletAddress === 'string' ? req.body.walletAddress.trim() : '';
    const signature = typeof req.body.signature === 'string' ? req.body.signature.trim() : '';
    const intentToken = typeof req.body.intentToken === 'string' ? req.body.intentToken.trim() : '';
    const walletType = typeof req.body.walletType === 'string' ? req.body.walletType.trim() : 'tonconnect';
    if (!walletAddress || !signature || !intentToken) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'walletAddress, signature, and intentToken are required' } });
    }
    if (!isPlausibleWalletAddress(walletAddress)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WALLET_ADDRESS', message: 'walletAddress is not valid for the configured chain' } });
    }

    const decoded = jwt.verify(intentToken, getJwtSecret()) as {
      type?: string;
      chainId?: string;
      walletAddress?: string;
      normalizedAddress?: string;
      nonce?: string;
    };
    if (
      decoded.type !== 'wallet_auth_intent'
      || !decoded.nonce
      || !decoded.chainId
      || (decoded.normalizedAddress && decoded.normalizedAddress !== normalizeWalletAddress(walletAddress))
    ) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'WALLET_AUTH_INTENT_MISMATCH', message: 'Wallet auth intent does not match this wallet' } });
    }

    verifyWalletSignature({
      nonce: decoded.nonce,
      walletAddress,
      signature,
      signableMessage: decoded.nonce,
    });

    const normalized = normalizeWalletAddress(walletAddress);
    const walletEmail = `wallet.${decoded.chainId}.${normalized.replace(/[^a-z0-9_-]/gi, '_')}@72h.local`;
    let user = await findByEmail(walletEmail);
    if (!user) {
      user = await createUser(walletEmail, crypto.randomBytes(32).toString('hex'));
    }
    const binding = await upsertVerifiedWalletBinding({
      userId: user.id,
      chainId: decoded.chainId,
      walletAddress,
      walletType,
      isPrimary: true,
    });
    if (!binding) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'WALLET_ALREADY_BOUND', message: 'Wallet is already bound to another user' } });
    }
    const token = signUserToken(user);
    return res.json({ request_id: req.id || '', data: { token, user: { id: user.id, email: user.email }, wallet: binding } });
  } catch (err) {
    if (err instanceof WalletSignatureVerificationError) {
      return res.status(err.status).json({ request_id: req.id || '', error: { code: err.code, message: err.message } });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'INVALID_WALLET_AUTH_INTENT', message: 'Wallet auth intent is invalid or expired' } });
    }
    return next(err);
  }
}
