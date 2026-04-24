import {
  getWalletSignatureVerifierDiagnostics,
  isPlausibleWalletAddress,
  verifyWalletSignature,
  WalletSignatureVerificationError,
} from '../src/services/walletSignatureVerifier';

describe('wallet signature verifier', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.WALLET_BINDING_ENABLED;
    delete process.env.WALLET_SIGNATURE_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts test signatures only outside production', () => {
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'test';

    expect(() => verifyWalletSignature({
      nonce: 'nonce-1',
      walletAddress: 'wallet-1',
      signature: 'test:nonce-1:wallet-1',
      signableMessage: 'message',
    })).not.toThrow();
  });

  it('rejects test signatures in production at runtime', () => {
    process.env.NODE_ENV = 'production';
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'test';

    expect(getWalletSignatureVerifierDiagnostics()).toMatchObject({
      configured: false,
      status: 'not_configured',
      mode: 'test',
    });
    expect(() => verifyWalletSignature({
      nonce: 'nonce-1',
      walletAddress: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      signature: 'test:nonce-1:eqaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signableMessage: 'message',
    })).toThrow(WalletSignatureVerificationError);
  });

  it('validates TON-friendly address shapes and keeps fake wallets out of production', () => {
    expect(isPlausibleWalletAddress('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
    expect(isPlausibleWalletAddress('0:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isPlausibleWalletAddress('not-a-wallet')).toBe(false);

    expect(isPlausibleWalletAddress('wallet-1')).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(isPlausibleWalletAddress('wallet-1')).toBe(false);
  });
});
