import { Request, Response, NextFunction } from 'express';
import { loadContractIntegrationConfig } from '../services/contracts/config';
import {
  createWalletBindIntent,
  getWalletBindIntentForUser,
  listWalletBindingsForUser,
  markWalletBindIntentExpired,
  markWalletBindIntentVerified,
  normalizeWalletAddress,
  upsertVerifiedWalletBinding,
} from '../models/walletBindingModel';
import {
  isPlausibleWalletAddress,
  verifyWalletSignature,
  WalletSignatureVerificationError,
} from '../services/walletSignatureVerifier';

function walletBindingEnabled(): boolean {
  return process.env.WALLET_BINDING_ENABLED === 'true';
}

export async function createBindIntent(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (!walletBindingEnabled()) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'WALLET_BINDING_DISABLED', message: 'Wallet binding is not enabled' } });
    }

    const walletAddress = typeof req.body.walletAddress === 'string' ? req.body.walletAddress.trim() : '';
    if (!walletAddress) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'walletAddress is required' } });
    }
    if (!isPlausibleWalletAddress(walletAddress)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WALLET_ADDRESS', message: 'walletAddress is not valid for the configured chain' } });
    }

    const config = loadContractIntegrationConfig();
    const domain = config.walletBinding.messageDomain || process.env.WALLET_BINDING_MESSAGE_DOMAIN;
    if (!domain) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'WALLET_BINDING_NOT_CONFIGURED', message: 'Wallet binding domain is not configured' } });
    }

    const intent = await createWalletBindIntent({
      userId: user.id,
      chainId: config.chainId,
      walletAddress,
      messageDomain: domain,
      nonceTtlSeconds: config.walletBinding.nonceTtlSeconds,
    });

    return res.status(201).json({ request_id: req.id || '', data: intent });
  } catch (err) {
    return next(err);
  }
}

export async function bindWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    if (!walletBindingEnabled()) {
      return res.status(503).json({ request_id: req.id || '', error: { code: 'WALLET_BINDING_DISABLED', message: 'Wallet binding is not enabled' } });
    }

    const nonce = typeof req.body.nonce === 'string' ? req.body.nonce.trim() : '';
    const walletAddress = typeof req.body.walletAddress === 'string' ? req.body.walletAddress.trim() : '';
    const signature = typeof req.body.signature === 'string' ? req.body.signature.trim() : '';
    const walletType = typeof req.body.walletType === 'string' ? req.body.walletType.trim() : null;

    if (!nonce || !walletAddress || !signature) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'nonce, walletAddress, and signature are required' } });
    }
    if (!isPlausibleWalletAddress(walletAddress)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_WALLET_ADDRESS', message: 'walletAddress is not valid for the configured chain' } });
    }

    const intent = await getWalletBindIntentForUser(user.id, nonce);
    if (!intent || intent.status !== 'pending') {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'BIND_INTENT_NOT_FOUND', message: 'Wallet bind intent not found' } });
    }
    if (intent.expires_at.getTime() <= Date.now()) {
      await markWalletBindIntentExpired(intent.id);
      return res.status(409).json({ request_id: req.id || '', error: { code: 'BIND_INTENT_EXPIRED', message: 'Wallet bind intent expired' } });
    }
    if (normalizeWalletAddress(intent.wallet_address) !== normalizeWalletAddress(walletAddress)) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'WALLET_MISMATCH', message: 'Wallet address does not match bind intent' } });
    }

    verifyWalletSignature({ nonce, walletAddress, signature, signableMessage: intent.signable_message });

    const binding = await upsertVerifiedWalletBinding({
      userId: user.id,
      chainId: intent.chain_id,
      walletAddress,
      walletType,
      isPrimary: true,
    });
    if (!binding) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'WALLET_ALREADY_BOUND', message: 'Wallet is already bound to another user' } });
    }
    await markWalletBindIntentVerified(intent.id);

    return res.status(201).json({ request_id: req.id || '', data: binding });
  } catch (err) {
    if (err instanceof WalletSignatureVerificationError) {
      return res.status(err.status).json({ request_id: req.id || '', error: { code: err.code, message: err.message } });
    }
    return next(err);
  }
}

export async function listMyWallets(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const wallets = await listWalletBindingsForUser(user.id);
    return res.json({ request_id: req.id || '', data: wallets });
  } catch (err) {
    return next(err);
  }
}
