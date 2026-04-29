import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { createWalletBindIntent, getWalletBindIntentForUser, listWalletBindingsForUser } from '../src/models/walletBindingModel';
import { getRewardLedgerById, markRewardClaimed } from '../src/models/rewardModel';
import { ReceiptVerificationError, verifyDepositReceipt } from '../src/services/receiptVerifier';
import { insertChainEvent } from '../src/models/chainEventModel';
import { withTransaction } from '../src/db';
import { createPosition } from '../src/models/positionModel';

jest.mock('../src/models/walletBindingModel', () => ({
  createWalletBindIntent: jest.fn(),
  getWalletBindIntentForUser: jest.fn(),
  listWalletBindingsForUser: jest.fn(),
  findVerifiedWalletBinding: jest.fn(),
  markWalletBindIntentExpired: jest.fn(),
  markWalletBindIntentVerified: jest.fn(),
  normalizeWalletAddress: jest.fn((value: string) => value.trim().toLowerCase()),
  upsertVerifiedWalletBinding: jest.fn(),
}));

jest.mock('../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

jest.mock('../src/services/receiptVerifier', () => ({
  ReceiptVerificationError: class ReceiptVerificationError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  verifyDepositReceipt: jest.fn(),
}));

jest.mock('../src/models/chainEventModel', () => ({
  insertChainEvent: jest.fn(),
  listChainEvents: jest.fn(),
}));

jest.mock('../src/models/waveModel', () => ({
  getCurrentWave: jest.fn(),
  getWaveById: jest.fn().mockResolvedValue({
    wave_id: 1,
    code: 'W001',
    name: 'Test Wave',
    status: 'live',
    start_time: new Date(),
    end_time: new Date(),
    min_lock_amount: '100',
    unlock_multiplier_bps: 15000,
    price_freshness_ttl_seconds: 3600,
    reward_budget: '0',
    direct_reward_rate_bps: 1000,
    per_invite_cap: '0',
    inviter_wave_cap: '0',
    claim_min_amount: '0',
    counted_member_cap: null,
    settle_delay_seconds: 0,
    deposits_disabled: false,
  }),
}));

jest.mock('../src/models/priceModel', () => ({
  getLatestConfirmedPrice: jest.fn().mockResolvedValue({
    price: '100',
    status: 'confirmed',
  }),
}));

jest.mock('../src/models/positionModel', () => ({
  createPosition: jest.fn(),
}));

jest.mock('../src/models/referralModel', () => ({
  getReferral: jest.fn().mockResolvedValue(null),
  lockReferral: jest.fn(),
}));

jest.mock('../src/models/squadModel', () => ({
  activateSquadMember: jest.fn(),
  createSquadWithCaptain: jest.fn(),
  getMembershipForWave: jest.fn(),
  getSquadById: jest.fn(),
  joinSquad: jest.fn(),
  listSquadsForWave: jest.fn(),
}));

jest.mock('../src/models/rewardModel', () => ({
  createRewardLedger: jest.fn(),
  getRewardSummary: jest.fn(),
  listRewardLedgers: jest.fn(),
  getRewardLedgerById: jest.fn(),
  markRewardClaimed: jest.fn(),
}));

jest.mock('../src/models/riskModel', () => ({
  createRiskFlag: jest.fn(),
  hasBlockingRiskForRewardClaim: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/models/opsModel', () => ({
  getAppControl: jest.fn().mockResolvedValue(null),
}));

const createWalletBindIntentMock = createWalletBindIntent as jest.Mock;
const getWalletBindIntentForUserMock = getWalletBindIntentForUser as jest.Mock;
const listWalletBindingsForUserMock = listWalletBindingsForUser as jest.Mock;
const walletBindingModel = jest.requireMock('../src/models/walletBindingModel');
const upsertVerifiedWalletBindingMock = walletBindingModel.upsertVerifiedWalletBinding as jest.Mock;
const findVerifiedWalletBindingMock = walletBindingModel.findVerifiedWalletBinding as jest.Mock;
const getRewardLedgerByIdMock = getRewardLedgerById as jest.Mock;
const markRewardClaimedMock = markRewardClaimed as jest.Mock;
const verifyDepositReceiptMock = verifyDepositReceipt as jest.Mock;
const insertChainEventMock = insertChainEvent as jest.Mock;
const withTransactionMock = withTransaction as jest.Mock;
const createPositionMock = createPosition as jest.Mock;

const userId = '00000000-0000-0000-0000-000000000777';
const token = jwt.sign({ userId, email: 'user@example.com' }, 'secret');
const canaryWallet = '0:b1274e7279ac155a5b0de527c9fa86da8e08769457df47e3bb79b1ffb3fc2a41';

describe('Production readiness gates', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    createWalletBindIntentMock.mockReset();
    getWalletBindIntentForUserMock.mockReset();
    listWalletBindingsForUserMock.mockReset();
    upsertVerifiedWalletBindingMock.mockReset();
    getRewardLedgerByIdMock.mockReset();
    markRewardClaimedMock.mockReset();
    verifyDepositReceiptMock.mockReset();
    insertChainEventMock.mockReset();
    findVerifiedWalletBindingMock.mockReset();
    createPositionMock.mockReset();
    withTransactionMock.mockReset();
    withTransactionMock.mockImplementation(async (fn: any) => fn({
      query: jest.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails wallet binding closed when the feature is disabled', async () => {
    delete process.env.WALLET_BINDING_ENABLED;

    const res = await request(app)
      .post('/v1/wallet/bind-intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ walletAddress: 'wallet-1' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('WALLET_BINDING_DISABLED');
    expect(createWalletBindIntentMock).not.toHaveBeenCalled();
  });

  it('creates wallet bind intents only when explicitly enabled and configured', async () => {
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_BINDING_MESSAGE_DOMAIN = 'multi-millionaire.example';
    createWalletBindIntentMock.mockResolvedValue({
      id: 'intent-1',
      user_id: userId,
      chain_id: 'ton-mainnet',
      wallet_address: 'wallet-1',
      normalized_address: 'wallet-1',
      nonce: 'nonce-1',
      signable_message: 'message',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000),
    });

    const res = await request(app)
      .post('/v1/wallet/bind-intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ walletAddress: 'wallet-1' });

    expect(res.status).toBe(201);
    expect(createWalletBindIntentMock).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      walletAddress: 'wallet-1',
      messageDomain: 'multi-millionaire.example',
    }));
  });

  it('does not accept wallet signatures until a verifier mode is configured', async () => {
    process.env.WALLET_BINDING_ENABLED = 'true';
    getWalletBindIntentForUserMock.mockResolvedValue({
      id: 'intent-1',
      user_id: userId,
      chain_id: 'ton-mainnet',
      wallet_address: 'wallet-1',
      normalized_address: 'wallet-1',
      nonce: 'nonce-1',
      signable_message: 'message',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000),
    });

    const res = await request(app)
      .post('/v1/wallet/bind')
      .set('Authorization', `Bearer ${token}`)
      .send({ nonce: 'nonce-1', walletAddress: 'wallet-1', signature: 'signature' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SIGNATURE_VERIFIER_NOT_CONFIGURED');
  });

  it('rejects wallets already bound to another user', async () => {
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_SIGNATURE_MODE = 'test';
    getWalletBindIntentForUserMock.mockResolvedValue({
      id: 'intent-1',
      user_id: userId,
      chain_id: 'ton-mainnet',
      wallet_address: 'wallet-1',
      normalized_address: 'wallet-1',
      nonce: 'nonce-1',
      signable_message: 'message',
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000),
    });
    upsertVerifiedWalletBindingMock.mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/wallet/bind')
      .set('Authorization', `Bearer ${token}`)
      .send({ nonce: 'nonce-1', walletAddress: 'wallet-1', signature: 'test:nonce-1:wallet-1' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WALLET_ALREADY_BOUND');
  });

  it('blocks the off-chain deposit stub when production chain writes are required', async () => {
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'true';

    for (const path of ['/v1/waves/1/deposit', '/v1/waves/1/staging-mvp/deposit']) {
      const res = await request(app)
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: '1000' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CHAIN_RECEIPT_REQUIRED');
    }
  });

  it('blocks the off-chain reward claim stub when production chain writes are required', async () => {
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'true';
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: userId,
      status: 'approved',
    });

    for (const path of ['/v1/rewards/ledger-1/claim', '/v1/rewards/ledger-1/staging-mvp/claim']) {
      const res = await request(app)
        .post(path)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CHAIN_REWARD_CLAIM_REQUIRED');
    }
    expect(markRewardClaimedMock).not.toHaveBeenCalled();
  });

  it('lists verified wallets for the current user', async () => {
    listWalletBindingsForUserMock.mockResolvedValue([{ id: 'wallet-binding-1', user_id: userId }]);

    const res = await request(app)
      .get('/v1/wallet/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listWalletBindingsForUserMock).toHaveBeenCalledWith(userId);
  });

  it('requires receipt verification for the chain deposit endpoint', async () => {
    verifyDepositReceiptMock.mockRejectedValue(
      new ReceiptVerificationError(503, 'RECEIPT_VERIFICATION_DISABLED', 'disabled')
    );

    const res = await request(app)
      .post('/v1/waves/1/deposit-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: '0xtx' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('RECEIPT_VERIFICATION_DISABLED');
    expect(insertChainEventMock).not.toHaveBeenCalled();
  });

  it('fails closed for production chain canary deposits without an allowlist', async () => {
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'true';
    delete process.env.CHAIN_CANARY_ALLOWLIST;
    verifyDepositReceiptMock.mockResolvedValue({
      chainId: 'ton-mainnet',
      txHash: '0xtx',
      logIndex: 0,
      walletAddress: canaryWallet,
      contractAddress: 'lock-vault',
      amountRaw: '1000',
      positionId: 'chain-position-1',
      blockNumber: 123,
      blockTime: null,
      finalized: true,
    });

    const res = await request(app)
      .post('/v1/waves/1/deposit-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: '0xtx', amount: '1000' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CHAIN_CANARY_WALLET_NOT_ALLOWED');
    expect(findVerifiedWalletBindingMock).not.toHaveBeenCalled();
    expect(insertChainEventMock).not.toHaveBeenCalled();
  });

  it('rejects production chain canary deposits over the raw amount limit', async () => {
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'true';
    process.env.CHAIN_CANARY_ALLOWLIST = canaryWallet;
    process.env.CHAIN_CANARY_MAX_AMOUNT_RAW = '999';
    verifyDepositReceiptMock.mockResolvedValue({
      chainId: 'ton-mainnet',
      txHash: '0xtx',
      logIndex: 0,
      walletAddress: canaryWallet,
      contractAddress: 'lock-vault',
      amountRaw: '1000',
      positionId: 'chain-position-1',
      blockNumber: 123,
      blockTime: null,
      finalized: true,
    });

    const res = await request(app)
      .post('/v1/waves/1/deposit-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: '0xtx', amount: '1000' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CHAIN_CANARY_AMOUNT_LIMIT_EXCEEDED');
    expect(findVerifiedWalletBindingMock).not.toHaveBeenCalled();
    expect(insertChainEventMock).not.toHaveBeenCalled();
  });

  it('treats NODE_ENV=prod as production for legacy off-chain deposit and claim stubs', async () => {
    process.env.NODE_ENV = 'prod';
    process.env.JWT_SECRET = 'production-readiness-secret';
    const prodToken = jwt.sign({ userId, email: 'user@example.com' }, process.env.JWT_SECRET);
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: userId,
      status: 'approved',
    });

    const deposit = await request(app)
      .post('/v1/waves/1/deposit')
      .set('Authorization', `Bearer ${prodToken}`)
      .send({ amount: '1000' });
    const claim = await request(app)
      .post('/v1/rewards/ledger-1/claim')
      .set('Authorization', `Bearer ${prodToken}`)
      .send();

    expect(deposit.status).toBe(409);
    expect(deposit.body.error.code).toBe('CHAIN_RECEIPT_REQUIRED');
    expect(claim.status).toBe(409);
    expect(claim.body.error.code).toBe('CHAIN_REWARD_CLAIM_REQUIRED');
    expect(createPositionMock).not.toHaveBeenCalled();
    expect(markRewardClaimedMock).not.toHaveBeenCalled();
  });

  it('applies verified deposit receipts inside one transaction', async () => {
    verifyDepositReceiptMock.mockResolvedValue({
      chainId: 'ton-mainnet',
      txHash: '0xtx',
      logIndex: 0,
      walletAddress: 'wallet-1',
      contractAddress: 'lock-vault',
      amountRaw: '1000',
      positionId: 'chain-position-1',
      blockNumber: 123,
      blockTime: null,
      finalized: true,
    });
    findVerifiedWalletBindingMock.mockResolvedValue({
      user_id: userId,
      chain_id: 'ton-mainnet',
      normalized_address: 'wallet-1',
    });
    insertChainEventMock.mockResolvedValue({
      inserted: true,
      event: { id: 'event-1', tx_hash: '0xtx', log_index: 0, apply_status: 'applied' },
    });
    createPositionMock.mockResolvedValue({
      id: 'position-1',
      user_id: userId,
      wave_id: 1,
      amount_raw: '1000',
      onchain_position_id: 'chain-position-1',
    });

    const res = await request(app)
      .post('/v1/waves/1/deposit-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: '0xtx', amount: '1000' });

    expect(res.status).toBe(201);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    const tx = expect.objectContaining({ query: expect.any(Function) });
    expect(insertChainEventMock).toHaveBeenCalledWith(expect.objectContaining({ applyStatus: 'applied', executor: tx }));
    expect(createPositionMock).toHaveBeenCalledWith(
      userId,
      1,
      '1000',
      'chain-position-1',
      '100',
      15000,
      true,
      true,
      tx
    );
  });

  it('allows production chain canary deposits for allowlisted wallets within limits', async () => {
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'true';
    process.env.CHAIN_CANARY_ALLOWLIST = canaryWallet;
    process.env.CHAIN_CANARY_MAX_AMOUNT_RAW = '1000';
    process.env.CHAIN_CANARY_WAVE_IDS = '1';
    verifyDepositReceiptMock.mockResolvedValue({
      chainId: 'ton-mainnet',
      txHash: '0xtx',
      logIndex: 0,
      walletAddress: canaryWallet,
      contractAddress: 'lock-vault',
      amountRaw: '1000',
      positionId: 'chain-position-1',
      blockNumber: 123,
      blockTime: null,
      finalized: true,
    });
    findVerifiedWalletBindingMock.mockResolvedValue({
      user_id: userId,
      chain_id: 'ton-mainnet',
      normalized_address: canaryWallet,
    });
    insertChainEventMock.mockResolvedValue({
      inserted: true,
      event: { id: 'event-1', tx_hash: '0xtx', log_index: 0, apply_status: 'applied' },
    });
    createPositionMock.mockResolvedValue({
      id: 'position-1',
      user_id: userId,
      wave_id: 1,
      amount_raw: '1000',
      onchain_position_id: 'chain-position-1',
    });

    const res = await request(app)
      .post('/v1/waves/1/deposit-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: '0xtx', amount: '1000' });

    expect(res.status).toBe(201);
    expect(insertChainEventMock).toHaveBeenCalledWith(expect.objectContaining({ applyStatus: 'applied' }));
    expect(createPositionMock).toHaveBeenCalled();
  });

  it('does not treat a failed receipt apply as permanently duplicated', async () => {
    verifyDepositReceiptMock.mockResolvedValue({
      chainId: 'ton-mainnet',
      txHash: '0xtx',
      logIndex: 0,
      walletAddress: 'wallet-1',
      contractAddress: 'lock-vault',
      amountRaw: '1000',
      positionId: 'chain-position-1',
      blockNumber: 123,
      blockTime: null,
      finalized: true,
    });
    findVerifiedWalletBindingMock.mockResolvedValue({
      user_id: userId,
      chain_id: 'ton-mainnet',
      normalized_address: 'wallet-1',
    });
    insertChainEventMock.mockResolvedValue({
      inserted: true,
      event: { id: 'event-1', tx_hash: '0xtx', log_index: 0, apply_status: 'applied' },
    });
    createPositionMock.mockRejectedValue(new Error('position insert failed'));

    const res = await request(app)
      .post('/v1/waves/1/deposit-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: '0xtx', amount: '1000' });

    expect(res.status).toBe(500);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    expect(insertChainEventMock).toHaveBeenCalledWith(expect.objectContaining({ applyStatus: 'applied' }));
    expect(res.body.error.code).not.toBe('DUPLICATE_CHAIN_EVENT');
  });
});
