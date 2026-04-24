import { ReceiptVerificationError, getReceiptVerifierDiagnostics, verifyDepositReceipt } from '../src/services/receiptVerifier';

describe('chain receipt verifier selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RECEIPT_VERIFICATION_ENABLED;
    delete process.env.CHAIN_RECEIPT_VERIFIER;
    delete process.env.CHAIN_RECEIPT_TEST_MODE;
    delete process.env.LOCK_VAULT_ADDRESS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails closed when receipt verification is not enabled', async () => {
    await expect(verifyDepositReceipt({ txHash: '0xtx' })).rejects.toMatchObject({
      status: 503,
      code: 'RECEIPT_VERIFICATION_DISABLED',
    });

    expect(getReceiptVerifierDiagnostics()).toMatchObject({
      configured: false,
      status: 'disabled',
      receiptVerificationEnabled: false,
    });
  });

  it('fails closed in production when no verifier implementation is configured', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';

    await expect(verifyDepositReceipt({ txHash: '0xtx' })).rejects.toMatchObject({
      status: 503,
      code: 'RECEIPT_VERIFIER_NOT_CONFIGURED',
    });

    expect(getReceiptVerifierDiagnostics()).toMatchObject({
      configured: false,
      status: 'not_configured',
      receiptVerificationEnabled: true,
    });
  });

  it('does not enable the test verifier via the legacy test-mode flag alone', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_TEST_MODE = 'true';

    await expect(verifyDepositReceipt({ txHash: '0xtx' })).rejects.toMatchObject({
      code: 'RECEIPT_VERIFIER_NOT_CONFIGURED',
    });
  });

  it('verifies explicit test receipts without pretending production chain success', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'test';
    process.env.CHAIN_ID = 'test-chain';
    process.env.LOCK_VAULT_ADDRESS = 'vault-1';

    const receipt = await verifyDepositReceipt({
      txHash: '0xtx',
      logIndex: 2,
      walletAddress: 'wallet-1',
      contractAddress: 'vault-1',
      amountRaw: '100',
      positionId: 'position-1',
      blockNumber: 12,
      blockTime: '2026-04-24T00:00:00.000Z',
      finalized: true,
    });

    expect(receipt).toMatchObject({
      chainId: 'test-chain',
      txHash: '0xtx',
      logIndex: 2,
      walletAddress: 'wallet-1',
      contractAddress: 'vault-1',
      amountRaw: '100',
      positionId: 'position-1',
      finalized: true,
    });
    expect(getReceiptVerifierDiagnostics()).toMatchObject({
      configured: true,
      status: 'test',
    });
  });

  it('rejects unfinished explicit test receipts', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'test';

    await expect(verifyDepositReceipt({
      txHash: '0xtx',
      walletAddress: 'wallet-1',
      contractAddress: 'vault-1',
      amountRaw: '100',
      positionId: 'position-1',
      finalized: false,
    })).rejects.toBeInstanceOf(ReceiptVerificationError);
  });
});
