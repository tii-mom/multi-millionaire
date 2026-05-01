import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  getAdminDashboard,
  listAdminRewards,
  listAdminRiskFlags,
  listAdminSquads,
  listAdminWaves,
} from '../src/models/adminReadModel';
import { createAdminAuditLog, listAdminAuditLogs, listAppControls, setAppControl } from '../src/models/opsModel';
import { listChainEvents } from '../src/models/chainEventModel';
import { listMerkleRewardBatches, listMerkleRewardProofs } from '../src/models/merkleRewardModel';
import { createDraftMerkleRewardBatch, getMerkleClaimVerifierDiagnostics } from '../src/services/merkleRewards';

jest.mock('../src/models/adminReadModel', () => ({
  getAdminDashboard: jest.fn(),
  listAdminWaves: jest.fn(),
  listAdminRiskFlags: jest.fn(),
  listAdminRewards: jest.fn(),
  listAdminSquads: jest.fn(),
}));

jest.mock('../src/models/opsModel', () => ({
  createAdminAuditLog: jest.fn(),
  listAdminAuditLogs: jest.fn(),
  listAppControls: jest.fn(),
  setAppControl: jest.fn(),
}));

jest.mock('../src/models/chainEventModel', () => ({
  listChainEvents: jest.fn(),
}));

jest.mock('../src/models/merkleRewardModel', () => ({
  listMerkleRewardBatches: jest.fn(),
  listMerkleRewardProofs: jest.fn(),
}));

jest.mock('../src/services/merkleRewards', () => ({
  createDraftMerkleRewardBatch: jest.fn(),
  getMerkleClaimVerifierDiagnostics: jest.fn(),
}));

const getAdminDashboardMock = getAdminDashboard as jest.Mock;
const listAdminWavesMock = listAdminWaves as jest.Mock;
const listAdminRiskFlagsMock = listAdminRiskFlags as jest.Mock;
const listAdminRewardsMock = listAdminRewards as jest.Mock;
const listAdminSquadsMock = listAdminSquads as jest.Mock;
const createAdminAuditLogMock = createAdminAuditLog as jest.Mock;
const listAdminAuditLogsMock = listAdminAuditLogs as jest.Mock;
const listAppControlsMock = listAppControls as jest.Mock;
const setAppControlMock = setAppControl as jest.Mock;
const listChainEventsMock = listChainEvents as jest.Mock;
const listMerkleRewardBatchesMock = listMerkleRewardBatches as jest.Mock;
const listMerkleRewardProofsMock = listMerkleRewardProofs as jest.Mock;
const createDraftMerkleRewardBatchMock = createDraftMerkleRewardBatch as jest.Mock;
const getMerkleClaimVerifierDiagnosticsMock = getMerkleClaimVerifierDiagnostics as jest.Mock;

const adminToken = jwt.sign({ userId: 'admin-user', email: 'admin@example.com' }, 'secret');
const userToken = jwt.sign({ userId: 'normal-user', email: 'user@example.com' }, 'secret');

describe('Admin read API', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'secret';
    delete process.env.NODE_ENV;
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.RECEIPT_VERIFICATION_ENABLED;
    delete process.env.CHAIN_RECEIPT_VERIFIER;
    getAdminDashboardMock.mockReset();
    listAdminWavesMock.mockReset();
    listAdminRiskFlagsMock.mockReset();
    listAdminRewardsMock.mockReset();
    listAdminSquadsMock.mockReset();
    createAdminAuditLogMock.mockReset();
    listAdminAuditLogsMock.mockReset();
    listAppControlsMock.mockReset();
    setAppControlMock.mockReset();
    listChainEventsMock.mockReset();
    listMerkleRewardBatchesMock.mockReset();
    listMerkleRewardProofsMock.mockReset();
    createDraftMerkleRewardBatchMock.mockReset();
    getMerkleClaimVerifierDiagnosticsMock.mockReset();
    getMerkleClaimVerifierDiagnosticsMock.mockReturnValue({
      configured: false,
      status: 'not_configured',
      model: 'legacy_stub',
    });
  });

  it('requires admin access for dashboard reads', async () => {
    const res = await request(app)
      .get('/v1/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_REQUIRED');
    expect(getAdminDashboardMock).not.toHaveBeenCalled();
  });

  it('returns the dashboard aggregation for admins', async () => {
    getAdminDashboardMock.mockResolvedValue({
      current_wave: { wave_id: 1, code: 'W001', status: 'live' },
      total_users: 2,
      total_positions: 3,
      total_rewards_pending: '100',
      total_rewards_claimed: '50',
      open_risk_flags: 1,
    });

    const res = await request(app)
      .get('/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total_users).toBe(2);
    expect(res.body.data.total_rewards_pending).toBe('100');
    expect(getAdminDashboardMock).toHaveBeenCalledTimes(1);
  });

  it('exposes rewards as a read-only admin list', async () => {
    listAdminRewardsMock.mockResolvedValue({
      rows: [
        {
          id: 'ledger-1',
          beneficiary_user_id: 'beneficiary-1',
          beneficiary_email: 'beneficiary@example.com',
          source_user_id: 'source-1',
          source_email: 'source@example.com',
          source_position_id: 'position-1',
          wave_id: 1,
          reward_type: 'direct_referral',
          gross_amount: '100',
          final_amount: '80',
          status: 'approved',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      page: 2,
      page_size: 25,
      total: 31,
      page_count: 2,
      search: 'approved',
    });

    const res = await request(app)
      .get('/v1/admin/rewards?page=2&page_size=25&search=approved')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0].status).toBe('approved');
    expect(res.body.data.total).toBe(31);
    expect(listAdminRewardsMock).toHaveBeenCalledWith({ page: 2, pageSize: 25, search: 'approved' });
  });

  it('passes server-side list pagination through for all admin lists', async () => {
    const emptyPage = {
      rows: [],
      page: 3,
      page_size: 8,
      total: 0,
      page_count: 1,
      search: 'wallet',
    };
    listAdminWavesMock.mockResolvedValue(emptyPage);
    listAdminRiskFlagsMock.mockResolvedValue(emptyPage);
    listAdminRewardsMock.mockResolvedValue(emptyPage);
    listAdminSquadsMock.mockResolvedValue(emptyPage);

    for (const path of ['/v1/admin/waves', '/v1/admin/risk/flags', '/v1/admin/rewards', '/v1/admin/squads']) {
      const res = await request(app)
        .get(`${path}?page=3&pageSize=8&q=wallet`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ page: 3, page_size: 8, total: 0, search: 'wallet' });
    }

    const expected = { page: 3, pageSize: 8, search: 'wallet' };
    expect(listAdminWavesMock).toHaveBeenCalledWith(expected);
    expect(listAdminRiskFlagsMock).toHaveBeenCalledWith(expected);
    expect(listAdminRewardsMock).toHaveBeenCalledWith(expected);
    expect(listAdminSquadsMock).toHaveBeenCalledWith(expected);
  });

  it('exposes ops diagnostics for admins', async () => {
    const res = await request(app)
      .get('/v1/admin/ops')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.receipt_verifier).toMatchObject({
      configured: false,
      status: 'disabled',
      mode: 'disabled',
    });
    expect(res.body.data.wallet_signature_verifier).toMatchObject({
      configured: false,
      status: 'disabled',
    });
    expect(res.body.data.merkle_claim_verifier).toMatchObject({
      configured: false,
      status: 'not_configured',
    });
    expect(res.body.data.runtime_path).toBe('staging-mvp');
    expect(res.body.data.merkle_draft_writes_enabled).toBe(true);
    expect(res.body.data.contract_integration).toHaveProperty('readyForReads');
    expect(res.body.data.season_claim).toBe('EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b');
    expect(res.body.data.season_claim_v2).toBe('EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b');
    expect(res.body.data.v3_tokenomics.token_address).toBe('EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3');
  });

  it('blocks Merkle draft writes in production without canary approval', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'production-admin-test-secret';
    delete process.env.MERKLE_DRAFT_WRITES_ENABLED;
    delete process.env.PRODUCTION_CANARY_APPROVED;
    const productionAdminToken = jwt.sign(
      { userId: 'admin-user', email: 'admin@example.com' },
      process.env.JWT_SECRET,
    );

    const res = await request(app)
      .post('/v1/admin/merkle/batches/draft')
      .set('Authorization', `Bearer ${productionAdminToken}`)
      .send({ chainId: 'ton-mainnet', tokenAddress: 'token-1' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MERKLE_DRAFT_WRITES_DISABLED');
    expect(createDraftMerkleRewardBatchMock).not.toHaveBeenCalled();
  });

  it('requires admin access for operations controls', async () => {
    const res = await request(app)
      .get('/v1/admin/controls')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_REQUIRED');
    expect(listAppControlsMock).not.toHaveBeenCalled();
  });

  it.each([
    ['GET /v1/admin/controls', 'get', '/v1/admin/controls', undefined],
    ['PATCH /v1/admin/controls/:key', 'patch', '/v1/admin/controls/pause_deposits', { enabled: true, reason: 'blocked' }],
    ['GET /v1/admin/audit-logs', 'get', '/v1/admin/audit-logs', undefined],
    ['GET /v1/admin/chain-events?apply_status=applied', 'get', '/v1/admin/chain-events?apply_status=applied', undefined],
    ['GET /v1/admin/ops', 'get', '/v1/admin/ops', undefined],
  ] as const)('requires admin access for %s', async (_label, method, path, body) => {
    const pending = request(app)[method](path).set('Authorization', `Bearer ${userToken}`);
    const res = body ? await pending.send(body) : await pending;

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_REQUIRED');
    expect(listAppControlsMock).not.toHaveBeenCalled();
    expect(setAppControlMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(listAdminAuditLogsMock).not.toHaveBeenCalled();
    expect(listChainEventsMock).not.toHaveBeenCalled();
  });

  it('lists operations controls for admins', async () => {
    listAppControlsMock.mockResolvedValue([
      { key: 'pause_deposits', enabled: false, reason: null, updated_by: null, updated_at: new Date() },
    ]);

    const res = await request(app)
      .get('/v1/admin/controls')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].key).toBe('pause_deposits');
  });

  it('updates operations controls and writes an audit log', async () => {
    setAppControlMock.mockResolvedValue({
      key: 'pause_deposits',
      enabled: true,
      reason: 'canary rollback',
      updated_by: 'admin-user',
      updated_at: new Date(),
    });
    createAdminAuditLogMock.mockResolvedValue({ id: 'audit-1' });

    const res = await request(app)
      .patch('/v1/admin/controls/pause_deposits')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true, reason: 'canary rollback' });

    expect(res.status).toBe(200);
    expect(setAppControlMock).toHaveBeenCalledWith({
      key: 'pause_deposits',
      enabled: true,
      reason: 'canary rollback',
      actorUserId: 'admin-user',
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin-user',
      actorEmail: 'admin@example.com',
      action: 'app_control.update',
      entityType: 'app_control',
      entityId: 'pause_deposits',
      metadata: { enabled: true, reason: 'canary rollback' },
    }));
  });

  it('rejects invalid operations control updates', async () => {
    const res = await request(app)
      .patch('/v1/admin/controls/pause_deposits')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: 'true' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(setAppControlMock).not.toHaveBeenCalled();
  });

  it('lists audit logs for admins', async () => {
    listAdminAuditLogsMock.mockResolvedValue([
      { id: 'audit-1', action: 'app_control.update', entity_type: 'app_control' },
    ]);

    const res = await request(app)
      .get('/v1/admin/audit-logs?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('audit-1');
    expect(listAdminAuditLogsMock).toHaveBeenCalledWith(10);
  });

  it('passes chain event status filters through for admins', async () => {
    listChainEventsMock.mockResolvedValue([
      { id: 'event-1', apply_status: 'applied' },
    ]);

    const res = await request(app)
      .get('/v1/admin/chain-events?apply_status=applied')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe('event-1');
    expect(listChainEventsMock).toHaveBeenCalledWith({
      applyStatus: 'applied',
      limit: 50,
    });
  });

  it('lists Merkle reward batches and proofs for admins', async () => {
    listMerkleRewardBatchesMock.mockResolvedValue([{ id: 'batch-1', status: 'draft' }]);
    listMerkleRewardProofsMock.mockResolvedValue([{ id: 'proof-1', batch_id: 'batch-1' }]);

    const batches = await request(app)
      .get('/v1/admin/merkle/batches')
      .set('Authorization', `Bearer ${adminToken}`);
    const proofs = await request(app)
      .get('/v1/admin/merkle/proofs?batch_id=batch-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(batches.status).toBe(200);
    expect(batches.body.data[0].id).toBe('batch-1');
    expect(proofs.status).toBe(200);
    expect(proofs.body.data[0].id).toBe('proof-1');
    expect(listMerkleRewardProofsMock).toHaveBeenCalledWith({ batchId: 'batch-1', userId: undefined, limit: 50 });
  });

  it('creates Merkle draft batches and writes audit logs', async () => {
    createDraftMerkleRewardBatchMock.mockResolvedValue({
      batch: { id: 'batch-1', merkle_root: '0xroot' },
      proofs: [{ id: 'proof-1' }],
    });
    createAdminAuditLogMock.mockResolvedValue({ id: 'audit-1' });

    const res = await request(app)
      .post('/v1/admin/merkle/batches/draft')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ chainId: 'ton-mainnet', tokenAddress: 'token-1' });

    expect(res.status).toBe(201);
    expect(createDraftMerkleRewardBatchMock).toHaveBeenCalledWith({
      chainId: 'ton-mainnet',
      tokenAddress: 'token-1',
      createdBy: 'admin-user',
    });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(expect.objectContaining({
      actorEmail: 'admin@example.com',
      action: 'merkle_reward_batch.create_draft',
      entityType: 'merkle_reward_batch',
      entityId: 'batch-1',
    }));
  });
});
