import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { query } from '../src/db';
import { createPosition } from '../src/models/positionModel';
import { getRewardLedgerById, markRewardClaimed } from '../src/models/rewardModel';
import { getReferral, lockReferral } from '../src/models/referralModel';
import { findByEmail } from '../src/models/userModel';
import { createRiskFlag, hasBlockingRiskForRewardClaim, updateRiskFlag } from '../src/models/riskModel';

jest.mock('../src/db', () => {
  const query = jest.fn();
  return {
    query,
    withTransaction: jest.fn(async (fn: any) => fn({ query })),
  };
});

jest.mock('../src/models/userModel', () => ({
  findByEmail: jest.fn(),
}));

jest.mock('../src/models/referralModel', () => ({
  getReferral: jest.fn(),
  upsertReferral: jest.fn(),
  lockReferral: jest.fn(),
}));

jest.mock('../src/models/priceModel', () => ({
  getLatestConfirmedPrice: jest.fn().mockResolvedValue({
    round_id: 1,
    price: '100',
    status: 'confirmed',
    observed_at: new Date(),
    submitted_at: new Date(),
    confirmed_at: new Date(),
  }),
}));

jest.mock('../src/models/waveModel', () => ({
  getCurrentWave: jest.fn(),
  getWaveById: jest.fn().mockImplementation((waveId: number) => Promise.resolve({
    wave_id: waveId,
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
  })),
}));

jest.mock('../src/models/positionModel', () => ({
  createPosition: jest.fn(),
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
  listRiskFlags: jest.fn(),
  updateRiskFlag: jest.fn(),
  hasBlockingRiskForRewardClaim: jest.fn(),
}));

const queryMock = query as jest.Mock;
const createPositionMock = createPosition as jest.Mock;
const findByEmailMock = findByEmail as jest.Mock;
const getReferralMock = getReferral as jest.Mock;
const lockReferralMock = lockReferral as jest.Mock;
const createRiskFlagMock = createRiskFlag as jest.Mock;
const updateRiskFlagMock = updateRiskFlag as jest.Mock;
const hasBlockingRiskForRewardClaimMock = hasBlockingRiskForRewardClaim as jest.Mock;
const getRewardLedgerByIdMock = getRewardLedgerById as jest.Mock;
const markRewardClaimedMock = markRewardClaimed as jest.Mock;

const userId = '00000000-0000-0000-0000-000000000111';
const adminId = '00000000-0000-0000-0000-000000000999';
const userToken = jwt.sign({ userId, email: 'user@example.com' }, 'secret');
const adminToken = jwt.sign({ userId: adminId, email: 'admin@example.com' }, 'secret');

describe('Risk flow', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.HIGH_RISK_DEPOSIT_THRESHOLD;
    queryMock.mockReset();
    createPositionMock.mockReset();
    findByEmailMock.mockReset();
    getReferralMock.mockReset();
    lockReferralMock.mockReset();
    createRiskFlagMock.mockReset();
    updateRiskFlagMock.mockReset();
    hasBlockingRiskForRewardClaimMock.mockReset();
    getRewardLedgerByIdMock.mockReset();
    markRewardClaimedMock.mockReset();
  });

  it('creates a self_referral_attempt flag', async () => {
    findByEmailMock.mockResolvedValue({ id: userId, email: 'user@example.com' });
    getReferralMock.mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/referrals/confirm')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ inviterEmail: 'user@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_REFERRAL');
    expect(createRiskFlagMock).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'user',
      entityId: userId,
      flagType: 'self_referral_attempt',
      severity: 'high',
    }));
  });

  it('creates a rapid_deposit_burst flag', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] });
    createPositionMock.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000333',
      user_id: userId,
      wave_id: 1,
      amount_raw: '1000',
      onchain_position_id: '123',
      entry_price: '100',
      unlock_multiplier_bps: 15000,
      qualifies_for_activation: true,
      is_first_qualifying_for_user: false,
      withdrawn: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const res = await request(app)
      .post('/v1/waves/1/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ amount: '1000' });

    expect(res.status).toBe(201);
    expect(createRiskFlagMock).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'user',
      entityId: userId,
      flagType: 'rapid_deposit_burst',
      severity: 'medium',
    }), expect.objectContaining({ query: expect.any(Function) }));
    expect(lockReferralMock).not.toHaveBeenCalled();
  });

  it('blocks flagged reward claims', async () => {
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: userId,
      status: 'approved',
    });
    hasBlockingRiskForRewardClaimMock.mockResolvedValue(true);

    const res = await request(app)
      .post('/v1/rewards/ledger-1/claim')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RISK_REVIEW_REQUIRED');
    expect(markRewardClaimedMock).not.toHaveBeenCalled();
  });

  it('lets admins resolve flags', async () => {
    updateRiskFlagMock.mockResolvedValue({
      id: 'flag-1',
      entity_type: 'position',
      entity_id: 'position-1',
      flag_type: 'high_value_first_lock',
      severity: 'medium',
      status: 'resolved',
      note: 'Reviewed',
      created_at: new Date(),
      updated_at: new Date(),
    });

    const res = await request(app)
      .patch('/v1/risk/flags/flag-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved', note: 'Reviewed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
    expect(updateRiskFlagMock).toHaveBeenCalledWith('flag-1', expect.objectContaining({ status: 'resolved' }));
  });

  it('allows claim after blocking risk is resolved', async () => {
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: userId,
      status: 'approved',
    });
    hasBlockingRiskForRewardClaimMock.mockResolvedValue(false);
    markRewardClaimedMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: userId,
      status: 'claimed',
    });

    const res = await request(app)
      .post('/v1/rewards/ledger-1/claim')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('claimed');
  });
});
