import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { getAdminDashboard, listAdminRewards } from '../src/models/adminReadModel';

jest.mock('../src/models/adminReadModel', () => ({
  getAdminDashboard: jest.fn(),
  listAdminWaves: jest.fn(),
  listAdminRiskFlags: jest.fn(),
  listAdminRewards: jest.fn(),
  listAdminSquads: jest.fn(),
}));

const getAdminDashboardMock = getAdminDashboard as jest.Mock;
const listAdminRewardsMock = listAdminRewards as jest.Mock;

const adminToken = jwt.sign({ userId: 'admin-user', email: 'admin@example.com' }, 'secret');
const userToken = jwt.sign({ userId: 'normal-user', email: 'user@example.com' }, 'secret');

describe('Admin read API', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.RECEIPT_VERIFICATION_ENABLED;
    delete process.env.CHAIN_RECEIPT_VERIFIER;
    getAdminDashboardMock.mockReset();
    listAdminRewardsMock.mockReset();
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
    listAdminRewardsMock.mockResolvedValue([
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
    ]);

    const res = await request(app)
      .get('/v1/admin/rewards')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('approved');
    expect(listAdminRewardsMock).toHaveBeenCalledTimes(1);
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
  });
});
