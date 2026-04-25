import { Address, beginCell } from '@ton/core';
import { ReceiptVerificationError, getReceiptVerifierDiagnostics, verifyDepositReceipt } from '../src/services/receiptVerifier';
import { deriveLockVaultPositionId, LOCK_VAULT_DEPOSIT_OPCODE } from '../src/services/tonMessages';

describe('chain receipt verifier selection', () => {
  const originalEnv = { ...process.env };
  const lockVaultAddress = 'kQDdFuJo_tCecQe0ejR7iyTKd8ld5A6ur25jRdO6sGcEklRt';
  const senderAddress = 'kQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQRIl';
  const otherAddress = 'kQBgpmYcdBHoG1D4t0AfSF8CLrOU4Ad4Sg94KmjzYs6JDKWg';
  const vaultJettonWalletAddress = '0:1111111111111111111111111111111111111111111111111111111111111111';

  function buildDepositBody(input: { waveId?: number; amountRaw?: string; sender?: string } = {}): string {
    return beginCell()
      .storeUint(LOCK_VAULT_DEPOSIT_OPCODE, 32)
      .storeUint(BigInt('1'), 64)
      .storeCoins(BigInt(input.amountRaw || '1000'))
      .storeAddress(Address.parse(input.sender || senderAddress))
      .storeBit(false)
      .storeUint(input.waveId ?? 7, 32)
      .endCell()
      .toBoc()
      .toString('base64');
  }

  function mockTonDepositTransaction(input: {
    destination?: string;
    source?: string;
    body?: string;
    description?: any;
    position?: { ownerAddress?: string; amountRaw?: string; waveId?: number; status?: number };
  } = {}) {
    return jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: [{
          transaction_id: { lt: '123', hash: 'tx-hash' },
          utime: 1777027651,
          description: Object.prototype.hasOwnProperty.call(input, 'description')
            ? input.description
            : { aborted: false, compute_ph: { success: true }, action: { success: true } },
          in_msg: {
            source: input.source || vaultJettonWalletAddress,
            destination: input.destination || lockVaultAddress,
            body: input.body || buildDepositBody(),
          },
        }],
      }),
    } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            position: {
              ownerAddress: input.position?.ownerAddress || senderAddress,
              amountRaw: input.position?.amountRaw || '1000',
              waveId: input.position?.waveId ?? 7,
              status: input.position?.status ?? 0,
            },
          },
        }),
      } as any);
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RECEIPT_VERIFICATION_ENABLED;
    delete process.env.CHAIN_RECEIPT_VERIFIER;
    delete process.env.CHAIN_RECEIPT_TEST_MODE;
    delete process.env.LOCK_VAULT_ADDRESS;
    delete process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS;
    delete process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET;
    delete process.env.TON_TRANSACTIONS_API_URL;
    delete process.env.NODE_ENV;
    delete process.env.CHAIN_MAINLINE_WRITES_ENABLED;
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

  it('rejects explicit test receipts in production runtime', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'test';

    await expect(verifyDepositReceipt({
      txHash: '0xtx',
      walletAddress: 'wallet-1',
      contractAddress: 'vault-1',
      amountRaw: '100',
      positionId: 'position-1',
      finalized: true,
    })).rejects.toMatchObject({
      status: 503,
      code: 'RECEIPT_VERIFIER_NOT_CONFIGURED',
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

  it('does not use testnet vault Jetton wallet fallback for production mainnet verification', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_ID = 'ton-mainnet';
    process.env.CHAIN_RPC_URL = 'https://toncenter.com/api/v2/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET = vaultJettonWalletAddress;

    await expect(verifyDepositReceipt({
      txHash: 'tx-hash',
      waveId: 7,
      amountRaw: '1000',
      walletAddress: senderAddress,
    })).rejects.toMatchObject({
      status: 503,
      code: 'LOCK_VAULT_JETTON_WALLET_NOT_CONFIGURED',
    });
  });

  it('verifies TON deposit receipts through RPC responses', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_ID = 'ton-testnet';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction();
    const expectedPositionId = deriveLockVaultPositionId({ senderAddress, queryId: '1' });

    const receipt = await verifyDepositReceipt({
      txHash: 'tx-hash',
      waveId: 7,
      amountRaw: '1000',
      walletAddress: senderAddress,
    });

    expect(receipt).toMatchObject({
      chainId: 'ton-testnet',
      txHash: 'tx-hash',
      walletAddress: Address.parse(senderAddress).toRawString().toLowerCase(),
      amountRaw: '1000',
      positionId: expectedPositionId,
      finalized: true,
    });
    fetchMock.mockRestore();
  });

  it('uses Toncenter v3 transactions when the RPC host supports it', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_ID = 'ton-testnet';
    process.env.CHAIN_RPC_URL = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const body = buildDepositBody();
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [{
            hash: 'tx-hash',
            lt: '123',
            now: 1777027651,
            description: { aborted: false, compute_ph: { success: true }, action: { success: true } },
            in_msg: {
              source: vaultJettonWalletAddress,
              destination: lockVaultAddress,
              message_content: { body },
            },
          }],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            stack: [
              ['cell', { bytes: beginCell().storeAddress(Address.parse(senderAddress)).endCell().toBoc().toString('base64') }],
              ['num', '0x3e8'],
              ['num', '0x7'],
              ['num', '0x69ec6b39'],
              ['num', '0x0'],
            ],
          },
        }),
      } as any);

    const receipt = await verifyDepositReceipt({
      txHash: 'tx-hash',
      waveId: 7,
      amountRaw: '1000',
      walletAddress: senderAddress,
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v3/transactions');
    expect(receipt).toMatchObject({
      chainId: 'ton-testnet',
      txHash: 'tx-hash',
      blockNumber: 123,
      blockTime: '2026-04-24T10:47:31.000Z',
      finalized: true,
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts for the wrong LockVault contract', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction({ destination: otherAddress });

    await expect(verifyDepositReceipt({ txHash: 'tx-hash' })).rejects.toMatchObject({
      status: 404,
      code: 'RECEIPT_NOT_FOUND',
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts for the wrong sender wallet', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction();

    await expect(verifyDepositReceipt({
      txHash: 'tx-hash',
      walletAddress: otherAddress,
    })).rejects.toMatchObject({
      status: 409,
      code: 'WALLET_MISMATCH',
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts for the wrong amount', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction();

    await expect(verifyDepositReceipt({
      txHash: 'tx-hash',
      amountRaw: '999',
    })).rejects.toMatchObject({
      status: 409,
      code: 'AMOUNT_MISMATCH',
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts for the wrong wave', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction();

    await expect(verifyDepositReceipt({
      txHash: 'tx-hash',
      waveId: 8,
    })).rejects.toMatchObject({
      status: 409,
      code: 'WAVE_MISMATCH',
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts missing execution description', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction({ description: null });

    await expect(verifyDepositReceipt({ txHash: 'tx-hash' })).rejects.toMatchObject({
      status: 409,
      code: 'TON_TX_NOT_FINALIZED',
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts from the wrong vault Jetton wallet', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction({ source: otherAddress });

    await expect(verifyDepositReceipt({ txHash: 'tx-hash' })).rejects.toMatchObject({
      status: 409,
      code: 'JETTON_WALLET_MISMATCH',
    });
    fetchMock.mockRestore();
  });

  it('rejects TON deposit receipts when on-chain position does not match', async () => {
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.CHAIN_RPC_URL = 'https://ton-testnet.api.onfinality.io/public/jsonRPC';
    process.env.LOCK_VAULT_ADDRESS = lockVaultAddress;
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = vaultJettonWalletAddress;
    const fetchMock = mockTonDepositTransaction({ position: { amountRaw: '999' } });

    await expect(verifyDepositReceipt({ txHash: 'tx-hash' })).rejects.toMatchObject({
      status: 409,
      code: 'POSITION_AMOUNT_MISMATCH',
    });
    fetchMock.mockRestore();
  });
});
