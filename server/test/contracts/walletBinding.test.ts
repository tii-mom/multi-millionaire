import {
  createWalletBindingService,
  WalletBindingNotWiredError,
} from '../../src/services/contracts/walletBinding';

describe('wallet binding service skeleton', () => {
  it('exposes a stub state and stays disconnected from runtime routes', () => {
    const service = createWalletBindingService({
      chainId: 'ton-mainnet',
      messageDomain: '72h.example.invalid',
      nonceTtlSeconds: 300,
    });

    expect(service.getState()).toEqual(expect.objectContaining({
      kind: 'stub',
      component: 'wallet_binding',
      chainId: 'ton-mainnet',
    }));
  });

  it('fails closed for bind intent creation', async () => {
    const service = createWalletBindingService({
      chainId: 'ton-mainnet',
      messageDomain: '72h.example.invalid',
      nonceTtlSeconds: 300,
    });

    await expect(service.createBindIntent('user-1', 'wallet-1')).rejects.toMatchObject({
      code: 'WALLET_BINDING_NOT_WIRED',
    });
    await expect(service.verifyBindSignature(
      {
        userId: 'user-1',
        chainId: 'ton-mainnet',
        messageDomain: '72h.example.invalid',
        nonce: 'nonce',
        expiresAt: '2026-04-23T00:00:00.000Z',
        signableMessage: 'message',
      },
      'signature',
      'wallet-1'
    )).rejects.toBeInstanceOf(WalletBindingNotWiredError);
  });
});

