import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { query } from '../src/db';
import { createPosition } from '../src/models/positionModel';
import { getReferral, lockReferral } from '../src/models/referralModel';
import { createRewardLedger, getRewardLedgerById, markRewardClaimed } from '../src/models/rewardModel';

jest.mock('../src/db', () => ({
  query: jest.fn(),
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
    per_invite_cap: '80',
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

jest.mock('../src/models/referralModel', () => ({
  getReferral: jest.fn(),
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

const queryMock = query as jest.Mock;
const createPositionMock = createPosition as jest.Mock;
const getReferralMock = getReferral as jest.Mock;
const lockReferralMock = lockReferral as jest.Mock;
const createRewardLedgerMock = createRewardLedger as jest.Mock;
const getRewardLedgerByIdMock = getRewardLedgerById as jest.Mock;
const markRewardClaimedMock = markRewardClaimed as jest.Mock;

const inviteeUserId = '00000000-0000-0000-0000-000000000101';
const inviterUserId = '00000000-0000-0000-0000-000000000202';
const token = jwt.sign({ userId: inviteeUserId, email: 'invitee@example.com' }, 'secret');

function mockDepositPosition(isFirst: boolean) {
  queryMock.mockResolvedValue({ rows: [{ count: isFirst ? '0' : '1' }] });
  createPositionMock.mockResolvedValue({
    id: '00000000-0000-0000-0000-000000000303',
    user_id: inviteeUserId,
    wave_id: 1,
    amount_raw: '1000',
    onchain_position_id: '123',
    entry_price: '100',
    unlock_multiplier_bps: 15000,
    qualifies_for_activation: true,
    is_first_qualifying_for_user: isFirst,
    withdrawn: false,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

describe('Reward API and generation', () => {
  beforeEach(() => {
    queryMock.mockReset();
    createPositionMock.mockReset();
    getReferralMock.mockReset();
    lockReferralMock.mockReset();
    createRewardLedgerMock.mockReset();
    getRewardLedgerByIdMock.mockReset();
    markRewardClaimedMock.mockReset();
  });

  it('creates a reward for the first qualifying referred deposit', async () => {
    mockDepositPosition(true);
    getReferralMock.mockResolvedValue({ invitee_user_id: inviteeUserId, inviter_user_id: inviterUserId, status: 'pending' });

    const res = await request(app)
      .post('/v1/waves/1/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '1000' });

    expect(res.status).toBe(201);
    expect(createRewardLedgerMock).toHaveBeenCalledWith(expect.objectContaining({
      beneficiaryUserId: inviterUserId,
      sourceUserId: inviteeUserId,
      grossAmount: '100',
      finalAmount: '80',
      status: 'approved',
    }));
    expect(lockReferralMock).toHaveBeenCalledWith(inviteeUserId);
  });

  it('does not duplicate rewards on later qualifying deposits', async () => {
    mockDepositPosition(false);
    getReferralMock.mockResolvedValue({ invitee_user_id: inviteeUserId, inviter_user_id: inviterUserId, status: 'locked' });

    const res = await request(app)
      .post('/v1/waves/1/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '1000' });

    expect(res.status).toBe(201);
    expect(createRewardLedgerMock).not.toHaveBeenCalled();
  });

  it('does not create rewards for self referral data', async () => {
    mockDepositPosition(true);
    getReferralMock.mockResolvedValue({ invitee_user_id: inviteeUserId, inviter_user_id: inviteeUserId, status: 'pending' });

    const res = await request(app)
      .post('/v1/waves/1/deposit')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '1000' });

    expect(res.status).toBe(201);
    expect(createRewardLedgerMock).not.toHaveBeenCalled();
  });

  it('claims only owner approved rewards', async () => {
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: inviteeUserId,
      status: 'approved',
    });
    markRewardClaimedMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: inviteeUserId,
      status: 'claimed',
    });

    const res = await request(app)
      .post('/v1/rewards/ledger-1/claim')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('claimed');
  });

  it('rejects claim attempts by non-owners', async () => {
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: inviterUserId,
      status: 'approved',
    });

    const res = await request(app)
      .post('/v1/rewards/ledger-1/claim')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(markRewardClaimedMock).not.toHaveBeenCalled();
  });

  it('rejects claim attempts for non-approved rewards', async () => {
    getRewardLedgerByIdMock.mockResolvedValue({
      id: 'ledger-1',
      beneficiary_user_id: inviteeUserId,
      status: 'pending',
    });

    const res = await request(app)
      .post('/v1/rewards/ledger-1/claim')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REWARD_NOT_APPROVED');
    expect(markRewardClaimedMock).not.toHaveBeenCalled();
  });
});
