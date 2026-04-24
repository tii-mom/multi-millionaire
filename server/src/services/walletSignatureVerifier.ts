import { normalizeWalletAddress } from '../models/walletBindingModel';

export type WalletSignatureVerifierStatus = 'disabled' | 'test' | 'not_configured';

export interface WalletSignatureInput {
  nonce: string;
  walletAddress: string;
  signature: string;
  signableMessage: string;
}

export interface WalletSignatureVerifierDiagnostics {
  configured: boolean;
  status: WalletSignatureVerifierStatus;
  mode: string;
  walletBindingEnabled: boolean;
}

export class WalletSignatureVerificationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WalletSignatureVerificationError';
    this.status = status;
    this.code = code;
  }
}

function getRequestedMode(): string {
  return (process.env.WALLET_SIGNATURE_MODE || '').trim().toLowerCase();
}

function walletBindingEnabled(): boolean {
  return process.env.WALLET_BINDING_ENABLED === 'true';
}

function isProductionRuntime(): boolean {
  return ['production', 'prod'].includes((process.env.NODE_ENV || '').trim().toLowerCase());
}

export function isPlausibleWalletAddress(walletAddress: string): boolean {
  const normalized = walletAddress.trim();
  if (/^[EU]Q[A-Za-z0-9_-]{46}$/.test(normalized)) {
    return true;
  }
  if (/^(?:-?1|0):[a-fA-F0-9]{64}$/.test(normalized)) {
    return true;
  }
  if (/^wallet-[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    return !isProductionRuntime();
  }
  return false;
}

export function getWalletSignatureVerifierDiagnostics(): WalletSignatureVerifierDiagnostics {
  const requested = getRequestedMode();
  if (!walletBindingEnabled()) {
    return {
      configured: false,
      status: 'disabled',
      mode: requested || 'disabled',
      walletBindingEnabled: false,
    };
  }
  if (requested === 'test') {
    return {
      configured: !isProductionRuntime(),
      status: isProductionRuntime() ? 'not_configured' : 'test',
      mode: 'test',
      walletBindingEnabled: true,
    };
  }
  return {
    configured: false,
    status: 'not_configured',
    mode: requested || 'disabled',
    walletBindingEnabled: true,
  };
}

export function verifyWalletSignature(input: WalletSignatureInput): void {
  const diagnostics = getWalletSignatureVerifierDiagnostics();
  if (diagnostics.status === 'disabled') {
    throw new WalletSignatureVerificationError(503, 'WALLET_BINDING_DISABLED', 'Wallet binding is not enabled');
  }
  if (diagnostics.mode === 'test' && diagnostics.status === 'not_configured') {
    throw new WalletSignatureVerificationError(503, 'SIGNATURE_VERIFIER_NOT_CONFIGURED', 'Test wallet signature mode is not allowed in production');
  }
  if (diagnostics.status !== 'test') {
    throw new WalletSignatureVerificationError(503, 'SIGNATURE_VERIFIER_NOT_CONFIGURED', 'Production wallet signature verifier is not configured');
  }

  const expected = `test:${input.nonce}:${normalizeWalletAddress(input.walletAddress)}`;
  if (input.signature !== expected) {
    throw new WalletSignatureVerificationError(401, 'INVALID_WALLET_SIGNATURE', 'Wallet signature is invalid');
  }
}
