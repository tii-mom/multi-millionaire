export interface WalletBindingServiceConfig {
  chainId: string;
  messageDomain: string;
  nonceTtlSeconds: number;
}

export interface WalletBindIntent {
  userId: string;
  chainId: string;
  messageDomain: string;
  nonce: string;
  expiresAt: string;
  signableMessage: string;
}

export interface VerifiedWalletBinding {
  userId: string;
  chainId: string;
  walletAddress: string;
  normalizedAddress: string;
  walletType: string | null;
  status: 'pending' | 'verified' | 'revoked';
  isPrimary: boolean;
  verifiedAt: string | null;
}

export interface WalletBindingResolution {
  kind: 'resolved' | 'missing' | 'review_required';
  userId: string | null;
  chainId: string;
  walletAddress: string;
  reason: string;
}

export interface WalletBindingServiceState {
  kind: 'stub';
  component: 'wallet_binding';
  chainId: string;
  messageDomain: string;
  nonceTtlSeconds: number;
  message: string;
}

export class WalletBindingNotWiredError extends Error {
  readonly code = 'WALLET_BINDING_NOT_WIRED';

  constructor(component: string) {
    super(`${component} is a Sprint 2 wallet binding stub and is not wired to runtime routes.`);
    this.name = 'WalletBindingNotWiredError';
  }
}

function raiseWalletBindingStub(component: string): never {
  throw new WalletBindingNotWiredError(component);
}

export interface WalletBindingService {
  getState(): WalletBindingServiceState;
  createBindIntent(userId: string, walletAddress: string): Promise<WalletBindIntent>;
  verifyBindSignature(intent: WalletBindIntent, signature: string, walletAddress: string): Promise<VerifiedWalletBinding>;
  upsertVerifiedWallet(binding: VerifiedWalletBinding): Promise<VerifiedWalletBinding>;
  resolveUserByWallet(chainId: string, walletAddress: string): Promise<WalletBindingResolution>;
}

class StubWalletBindingService implements WalletBindingService {
  constructor(private readonly config: WalletBindingServiceConfig) {}

  getState(): WalletBindingServiceState {
    return {
      kind: 'stub',
      component: 'wallet_binding',
      chainId: this.config.chainId,
      messageDomain: this.config.messageDomain,
      nonceTtlSeconds: this.config.nonceTtlSeconds,
      message: 'Wallet binding is a Sprint 2 sidecar and is not wired to runtime routes.',
    };
  }

  async createBindIntent(_userId: string, _walletAddress: string): Promise<WalletBindIntent> {
    raiseWalletBindingStub('WalletBinding.createBindIntent');
  }

  async verifyBindSignature(
    _intent: WalletBindIntent,
    _signature: string,
    _walletAddress: string
  ): Promise<VerifiedWalletBinding> {
    raiseWalletBindingStub('WalletBinding.verifyBindSignature');
  }

  async upsertVerifiedWallet(_binding: VerifiedWalletBinding): Promise<VerifiedWalletBinding> {
    raiseWalletBindingStub('WalletBinding.upsertVerifiedWallet');
  }

  async resolveUserByWallet(_chainId: string, _walletAddress: string): Promise<WalletBindingResolution> {
    raiseWalletBindingStub('WalletBinding.resolveUserByWallet');
  }
}

export function createWalletBindingService(config: WalletBindingServiceConfig): WalletBindingService {
  return new StubWalletBindingService(config);
}
