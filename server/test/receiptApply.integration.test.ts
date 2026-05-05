import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app';
import { closePool, query } from '../src/db';
import { verifyDepositReceipt } from '../src/services/receiptVerifier';
import { hashLedgerId, verifyMerkleClaimReceipt } from '../src/services/merkleRewards';
import {
  assertSafeReceiptApplyIntegrationDatabase,
  receiptApplyIntegrationEnabled,
} from './receiptApplyIntegrationGuard';

jest.mock('../src/services/receiptVerifier', () => ({
  ...jest.requireActual('../src/services/receiptVerifier'),
  verifyDepositReceipt: jest.fn(),
}));

jest.mock('../src/services/merkleRewards', () => ({
  ...jest.requireActual('../src/services/merkleRewards'),
  verifyMerkleClaimReceipt: jest.fn(),
}));

const describeReceiptApply = receiptApplyIntegrationEnabled() ? describe : describe.skip;

const verifyDepositReceiptMock = verifyDepositReceipt as jest.MockedFunction<typeof verifyDepositReceipt>;
const verifyMerkleClaimReceiptMock = verifyMerkleClaimReceipt as jest.MockedFunction<typeof verifyMerkleClaimReceipt>;

const originalEnv = { ...process.env };
const jwtSecret = 'receipt-apply-integration-secret';
const chainId = 'receipt-apply-test';
const walletAddress = 'receipt-apply-wallet';
const userId = '00000000-0000-4000-8000-000000000101';
const sourceUserId = '00000000-0000-4000-8000-000000000102';
const sourcePositionId = '00000000-0000-4000-8000-000000000201';
const rewardLedgerId = '00000000-0000-4000-8000-000000000301';
const merkleBatchId = '00000000-0000-4000-8000-000000000401';
const merkleProofId = '00000000-0000-4000-8000-000000000501';
const waveId = 980001;

function authToken() {
  return jwt.sign({ userId, email: 'receipt-apply-user@example.test' }, jwtSecret);
}

async function cleanupReceiptApplyRows() {
  await query('DELETE FROM merkle_reward_proofs WHERE id = $1 OR reward_ledger_id = $2', [merkleProofId, rewardLedgerId]);
  await query('DELETE FROM merkle_reward_batches WHERE id = $1', [merkleBatchId]);
  await query('DELETE FROM reward_ledgers WHERE id = $1', [rewardLedgerId]);
  await query('DELETE FROM chain_events WHERE chain_id = $1 OR tx_hash LIKE $2', [chainId, 'receipt-apply-%']);
  await query('DELETE FROM positions WHERE id = $1 OR user_id IN ($2, $3) OR onchain_position_id IN ($4, $5)', [
    sourcePositionId,
    userId,
    sourceUserId,
    '980001000000',
    '980001000001',
  ]);
  await query('DELETE FROM wallet_bindings WHERE user_id IN ($1, $2) OR chain_id = $3', [userId, sourceUserId, chainId]);
  await query('DELETE FROM wallet_bind_intents WHERE user_id IN ($1, $2) OR chain_id = $3', [userId, sourceUserId, chainId]);
  await query('DELETE FROM users WHERE id IN ($1, $2)', [userId, sourceUserId]);
  await query('DELETE FROM waves WHERE wave_id = $1', [waveId]);
}

async function seedReceiptApplyRows() {
  await query(
    `INSERT INTO users (id, email, password_hash, created_at, updated_at)
     VALUES
       ($1, 'receipt-apply-user@example.test', 'not-used', NOW(), NOW()),
       ($2, 'receipt-apply-source@example.test', 'not-used', NOW(), NOW())`,
    [userId, sourceUserId]
  );
  await query(
    `INSERT INTO waves (
       wave_id, code, name, status, start_time, end_time, min_lock_amount,
       unlock_multiplier_bps, reward_budget, direct_reward_rate_bps,
       per_invite_cap, inviter_wave_cap, claim_min_amount
     )
     VALUES ($1, 'RECEIPT_APPLY_TEST', 'Receipt Apply Integration', 'live',
       NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', 1, 15000, 0, 0, 0, 0, 0)`,
    [waveId]
  );
  await query(
    `INSERT INTO wallet_bindings (
       user_id, chain_id, wallet_address, normalized_address, wallet_type,
       status, is_primary, verified_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $3, 'integration', 'verified', TRUE, NOW(), NOW(), NOW())`,
    [userId, chainId, walletAddress]
  );
  await query(
    `INSERT INTO positions (
       id, user_id, wave_id, amount_raw, onchain_position_id, entry_price,
       unlock_multiplier_bps, qualifies_for_activation,
       is_first_qualifying_for_user, withdrawn, created_at, updated_at
     )
     VALUES ($1, $2, $3, 10, 980001000000, 100, 15000, TRUE, TRUE, FALSE, NOW(), NOW())`,
    [sourcePositionId, sourceUserId, waveId]
  );
  await query(
    `INSERT INTO reward_ledgers (
       id, beneficiary_user_id, source_user_id, source_position_id, wave_id,
       reward_type, gross_amount, final_amount, status, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'receipt_apply_integration', 25, 25, 'approved', NOW(), NOW())`,
    [rewardLedgerId, userId, sourceUserId, sourcePositionId, waveId]
  );
  await query(
    `INSERT INTO merkle_reward_batches (
       id, chain_id, token_address, merkle_root, total_amount_raw,
       status, metadata, created_at, updated_at
     )
     VALUES ($1, $2, 'token-test', '0xreceiptapplyroot', 25, 'active',
       $3::jsonb, NOW(), NOW())`,
    [merkleBatchId, chainId, JSON.stringify({ contract_batch_id: '980001' })]
  );
  await query(
    `INSERT INTO merkle_reward_proofs (
       id, batch_id, reward_ledger_id, beneficiary_user_id, beneficiary_wallet,
       amount_raw, leaf_hash, proof, claim_status, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 25, '0xreceiptapplyleaf', '[]'::jsonb,
       'proof_available', NOW(), NOW())`,
    [merkleProofId, merkleBatchId, rewardLedgerId, userId, walletAddress]
  );
}

describeReceiptApply('receipt apply integration safety harness', () => {
  beforeAll(async () => {
    assertSafeReceiptApplyIntegrationDatabase();
    process.env.JWT_SECRET = jwtSecret;
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    process.env.RISK_REVIEW_ENABLED = 'false';
    process.env.ADMIN_OPERATIONS_ENABLED = 'false';
    delete process.env.CHAIN_MAINLINE_WRITES_ENABLED;
    delete process.env.APP_CONTROLS_DB_ENABLED;
  });

  beforeEach(async () => {
    verifyDepositReceiptMock.mockReset();
    verifyMerkleClaimReceiptMock.mockReset();
    await cleanupReceiptApplyRows();
    await seedReceiptApplyRows();
  });

  afterEach(async () => {
    await cleanupReceiptApplyRows();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await closePool();
  });

  it('applies a verified deposit receipt once and rejects the duplicate without a second position', async () => {
    verifyDepositReceiptMock.mockResolvedValue({
      chainId,
      txHash: 'receipt-apply-deposit-tx',
      logIndex: 0,
      walletAddress,
      contractAddress: 'lock-vault-integration',
      amountRaw: '10',
      positionId: '980001000001',
      seasonId: null,
      waveId,
      targetUsd9: null,
      blockNumber: 980001,
      blockTime: '2026-04-25T00:00:00.000Z',
      finalized: true,
    });

    const first = await request(app)
      .post(`/v1/waves/${waveId}/deposit-receipt`)
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ txHash: 'receipt-apply-deposit-tx', amount: '10' });

    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post(`/v1/waves/${waveId}/deposit-receipt`)
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ txHash: 'receipt-apply-deposit-tx', amount: '10' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_CHAIN_EVENT');

    const events = await query<{ count: string; apply_status: string }>(
      `SELECT COUNT(*)::text AS count, MIN(apply_status) AS apply_status
       FROM chain_events
       WHERE chain_id = $1 AND tx_hash = 'receipt-apply-deposit-tx'
       GROUP BY chain_id, tx_hash`,
      [chainId]
    );
    const positions = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM positions
       WHERE user_id = $1 AND onchain_position_id = 980001000001`,
      [userId]
    );

    expect(events.rows[0]).toMatchObject({ count: '1', apply_status: 'applied' });
    expect(positions.rows[0]).toMatchObject({ count: '1' });
  });

  it('applies a verified Merkle claim receipt once and rejects the duplicate without reopening the ledger', async () => {
    verifyMerkleClaimReceiptMock.mockResolvedValue({
      txHash: 'receipt-apply-claim-tx',
      logIndex: 0,
      contractAddress: 'merkle-claim-integration',
      beneficiaryWallet: walletAddress,
      recipient: walletAddress,
      amountRaw: '25',
      ledgerIdHash: hashLedgerId(rewardLedgerId),
      batchId: '980001',
      blockNumber: 980002,
      blockTime: '2026-04-25T00:01:00.000Z',
      finalized: true,
    });

    const first = await request(app)
      .post(`/v1/rewards/${rewardLedgerId}/claim-receipt`)
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ txHash: 'receipt-apply-claim-tx' });

    expect(first.status).toBe(200);

    const duplicate = await request(app)
      .post(`/v1/rewards/${rewardLedgerId}/claim-receipt`)
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ txHash: 'receipt-apply-claim-tx' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_CLAIM_RECEIPT');

    const ledger = await query<{ status: string }>('SELECT status FROM reward_ledgers WHERE id = $1', [rewardLedgerId]);
    const proof = await query<{ claim_status: string; claim_tx_hash: string }>(
      'SELECT claim_status, claim_tx_hash FROM merkle_reward_proofs WHERE id = $1',
      [merkleProofId]
    );
    const events = await query<{ count: string; apply_status: string }>(
      `SELECT COUNT(*)::text AS count, MIN(apply_status) AS apply_status
       FROM chain_events
       WHERE chain_id = $1 AND tx_hash = 'receipt-apply-claim-tx'
       GROUP BY chain_id, tx_hash`,
      [chainId]
    );

    expect(ledger.rows[0]).toMatchObject({ status: 'claimed' });
    expect(proof.rows[0]).toMatchObject({ claim_status: 'claimed', claim_tx_hash: 'receipt-apply-claim-tx' });
    expect(events.rows[0]).toMatchObject({ count: '1', apply_status: 'applied' });
  });
});
