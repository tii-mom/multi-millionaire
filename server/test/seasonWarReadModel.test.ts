import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { getCurrentWave, getWaveById } from '../src/models/waveModel';
import { listSquadsForWave } from '../src/models/squadModel';
import { getRewardEstimate } from '../src/models/rewardModel';
import { findVerifiedWalletBinding } from '../src/models/walletBindingModel';
import {
  getSeasonWarClaimPreview,
  getSeasonWarCurrent,
  getSeasonWarMe,
  getSeasonWarRadar,
  getSeasonWarSquads,
} from '../src/models/seasonWarReadModel';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

jest.mock('../src/models/waveModel', () => ({
  getCurrentWave: jest.fn(),
  getWaveById: jest.fn(),
}));

jest.mock('../src/models/squadModel', () => ({
  listSquadsForWave: jest.fn(),
}));

jest.mock('../src/models/rewardModel', () => ({
  getRewardEstimate: jest.fn(),
}));

jest.mock('../src/models/walletBindingModel', () => ({
  findVerifiedWalletBinding: jest.fn(),
}));

const queryMock = query as jest.Mock;
const getCurrentWaveMock = getCurrentWave as jest.Mock;
const getWaveByIdMock = getWaveById as jest.Mock;
const listSquadsForWaveMock = listSquadsForWave as jest.Mock;
const getRewardEstimateMock = getRewardEstimate as jest.Mock;
const findVerifiedWalletBindingMock = findVerifiedWalletBinding as jest.Mock;

const wave = {
  wave_id: 1,
  code: 'W001',
  name: 'Wave 1',
  status: 'live',
  start_time: new Date(Date.now() - 1000),
  end_time: new Date(Date.now() + 60_000),
  min_lock_amount: '100',
  unlock_multiplier_bps: 15000,
  price_freshness_ttl_seconds: 3600,
  reward_budget: '100000000000000000000',
  direct_reward_rate_bps: 100,
  per_invite_cap: '0',
  inviter_wave_cap: '0',
  claim_min_amount: '0',
  counted_member_cap: null,
  settle_delay_seconds: 0,
  deposits_disabled: false,
};

function mockProvenance(updatedAt = new Date(Date.now() - 10_000)) {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('WITH latest')) {
      return { rows: [{ updated_at: updatedAt, indexer_watermark: '12345' }] };
    }
    return { rows: [] };
  });
}

describe('Season War War Room read model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentWaveMock.mockResolvedValue(wave);
    getWaveByIdMock.mockResolvedValue(wave);
    listSquadsForWaveMock.mockResolvedValue([]);
    findVerifiedWalletBindingMock.mockResolvedValue(null);
    getRewardEstimateMock.mockResolvedValue(null);
    mockProvenance();
  });

  it('returns current round with stale/freshness provenance and string atomic identifiers', async () => {
    const staleUpdatedAt = new Date(Date.now() - 90_000);
    mockProvenance(staleUpdatedAt);

    const data = await getSeasonWarCurrent();

    expect(data).toMatchObject({
      seasonId: 'W001',
      waveId: '1',
      chainRoundId: '1',
      status: 'active',
      indexerWatermark: '12345',
    });
    expect(typeof data?.sourceFreshnessSeconds).toBe('number');
    expect(data!.sourceFreshnessSeconds!).toBeGreaterThanOrEqual(80);
  });

  it('keeps radar season-scoped to the requested wave', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('WITH latest')) {
        return { rows: [{ updated_at: new Date(), indexer_watermark: null }] };
      }
      if (sql.includes('FROM merkle_reward_batches')) {
        return { rows: [{ id: 'batch-1', merkle_root: '0xabc', status: 'active', metadata: { evidenceHash: 'hash-1', successfulWaveIds: ['1'] }, created_at: new Date() }] };
      }
      if (sql.includes('FROM waves') && sql.includes('wave_id = $1')) {
        return { rows: [{ wave_id: 1, code: 'W001', status: 'live', end_time: wave.end_time, reward_budget: '123', updated_at: new Date() }] };
      }
      return { rows: [] };
    });

    const data = await getSeasonWarRadar('1');

    expect(data?.seasonId).toBe('W001');
    expect(data?.rounds).toHaveLength(1);
    expect(data?.rounds[0]).toMatchObject({ waveId: '1', evidenceHash: 'hash-1' });
  });

  it('keeps squad contribution BigInt values as strings and surfaces quarantine risk', async () => {
    listSquadsForWaveMock.mockResolvedValue([
      { id: 7, name: 'Alpha', rank: 1, activated_member_count: 3, total_locked: '900000000000000000000000000000000000' },
    ]);
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('WITH latest')) {
        return { rows: [{ updated_at: new Date(), indexer_watermark: null }] };
      }
      if (sql.includes('rf.severity')) {
        return { rows: [{ squad_id: '7', risk_signal: 'quarantined' }] };
      }
      return { rows: [] };
    });

    const data = await getSeasonWarSquads('1');

    expect(data?.squads[0]).toMatchObject({
      squadId: '7',
      contributionAtomic: '900000000000000000000000000000000000',
      riskSignal: 'quarantined',
    });
  });

  it('returns user-specific quarantine state without enabling actions', async () => {
    findVerifiedWalletBindingMock.mockResolvedValue({ user_id: 'user-1' });
    getRewardEstimateMock.mockResolvedValue({
      total_estimate_raw: '42',
      ledger_totals: { pending_amount_raw: '5', approved_amount_raw: '0', claimed_amount_raw: '0' },
      categories: [{ category: 'referral', estimate_amount_raw: '7' }],
    });
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('WITH latest')) {
        return { rows: [{ updated_at: new Date(), indexer_watermark: null }] };
      }
      if (sql.includes('FROM positions')) {
        return { rows: [{ id: 'pos-1', wave_id: 1, amount_atomic: '1000000000000000000', created_at: new Date() }] };
      }
      if (sql.includes('WITH my_squad')) {
        return { rows: [{ squad_id: '7', squad_rank: 2 }] };
      }
      if (sql.includes('FROM risk_flags')) {
        return { rows: [{ risk_status: 'quarantined', risk_reason: 'sybil_cluster' }] };
      }
      return { rows: [] };
    });

    const data = await getSeasonWarMe('EQ_wallet');

    expect(data).toMatchObject({
      verifiedWalletBinding: true,
      eligible: false,
      eligibilityReason: 'RISK_QUARANTINED',
      myLockAtomic: '1000000000000000000',
      riskStatus: 'quarantined',
      nextAction: 'WAIT_FOR_RISK_REVIEW',
    });
  });

  it('keeps claim preview disabled even when a root exists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('WITH latest')) {
        return { rows: [{ updated_at: new Date(), indexer_watermark: '777' }] };
      }
      if (sql.includes('FROM merkle_reward_batches')) {
        return { rows: [{ id: 'batch-1', merkle_root: '0xabc', status: 'active', metadata: {}, created_at: new Date() }] };
      }
      return { rows: [] };
    });

    const data = await getSeasonWarClaimPreview('1', 'EQ_wallet');

    expect(data).not.toBeNull();
    expect(data!.rootPublishable).toBe(true);
    expect(data!.claimContractVersion).toBe('none');
    expect(data!.claimWindowStatus).toBe('not_open');
    expect(data!.claimableAtomic).toBe('0');
    expect(data!.disabledReason).toBe('CLAIM_GATE_NOT_ENABLED');
  });
});

describe('Season War War Room routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProvenance();
  });

  it('rejects missing wallet for wallet-scoped read endpoints', async () => {
    const res = await request(app).get('/v1/season-war/me');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('does not fall back to current wave for an unknown season route', async () => {
    getWaveByIdMock.mockResolvedValue(null);

    const res = await request(app).get('/v1/season-war/seasons/999/radar');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SEASON_WAR_NOT_FOUND');
  });

  it('does not return claim preview for an unknown season route', async () => {
    getWaveByIdMock.mockResolvedValue(null);

    const res = await request(app).get('/v1/season-war/seasons/999/claim-preview?wallet=EQ_wallet');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SEASON_WAR_NOT_FOUND');
  });

  it('returns a clear fail-closed response when Season War reward tables are missing', async () => {
    getCurrentWaveMock.mockResolvedValue(wave);
    queryMock.mockRejectedValue(Object.assign(new Error('relation "merkle_reward_batches" does not exist'), { code: '42P01' }));

    const res = await request(app).get('/v1/season-war/current');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SEASON_WAR_READ_MODEL_NOT_READY');
    expect(res.body.error.message).toContain('006_merkle_rewards.sql');
    expect(res.body.error.message).not.toContain('merkle_reward_batches');
  });
});
