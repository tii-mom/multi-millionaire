import request from 'supertest';
import app from '../src/app';

// Mock database models used by controllers to avoid hitting a real database during tests.
jest.mock('../src/models/waveModel', () => ({
  getCurrentWave: jest.fn().mockResolvedValue({
    wave_id: 1,
    code: 'W001',
    name: 'Test Wave',
    status: 'live',
    start_time: new Date(Date.now() - 1000),
    end_time: new Date(Date.now() + 1000),
    min_lock_amount: '1000000000000000000',
    unlock_multiplier_bps: 15000,
    price_freshness_ttl_seconds: 3600,
    reward_budget: '0',
    direct_reward_rate_bps: 0,
    per_invite_cap: '0',
    inviter_wave_cap: '0',
    claim_min_amount: '0',
    counted_member_cap: null,
    settle_delay_seconds: 0,
    deposits_disabled: false,
  }),
  getWaveById: jest.fn().mockImplementation((waveId: number) => Promise.resolve({
    wave_id: waveId,
    code: 'W001',
    name: 'Test Wave',
    status: 'live',
    start_time: new Date(Date.now() - 1000),
    end_time: new Date(Date.now() + 1000),
    min_lock_amount: '1000000000000000000',
    unlock_multiplier_bps: 15000,
    price_freshness_ttl_seconds: 3600,
    reward_budget: '0',
    direct_reward_rate_bps: 0,
    per_invite_cap: '0',
    inviter_wave_cap: '0',
    claim_min_amount: '0',
    counted_member_cap: null,
    settle_delay_seconds: 0,
    deposits_disabled: false,
  })),
}));

jest.mock('../src/models/priceModel', () => ({
  getLatestConfirmedPrice: jest.fn().mockResolvedValue({
    round_id: 1,
    price: '123450000',
    status: 'confirmed',
    observed_at: new Date(),
    submitted_at: new Date(),
    confirmed_at: new Date(),
  }),
}));

describe('API integration tests', () => {
  it('GET / should return health status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /v1/app/bootstrap should return bootstrap payload', async () => {
    delete process.env.RECEIPT_VERIFICATION_ENABLED;
    delete process.env.CHAIN_RECEIPT_VERIFIER;

    const res = await request(app).get('/v1/app/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.current_wave).toBeDefined();
    expect(res.body.data.latest_price).toBeDefined();
    expect(res.body.data.ops.receipt_verifier).toMatchObject({
      configured: false,
      status: 'disabled',
      mode: 'disabled',
    });
    expect(res.body.data.ops.merkle_claim_verifier).toMatchObject({
      configured: false,
      status: 'not_configured',
    });
    expect(res.body.data.ops.runtime_path).toBe('staging-mvp');
    expect(res.body.data.feature_flags.staging_mvp_enabled).toBe(true);
    expect(res.body.data.contracts.token_address_mainnet).toBe('EQAm0twD5SYndyrdIvWyNZ_7oUXlrlGOhUf6iiA7q1ph-GI3');
    expect(res.body.data.contracts.season_claim).toBe('EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b');
    expect(res.body.data.contracts.season_claim_v2).toBe('EQDBwNs-eQSUbl0XISsd9b9g-RvaZ-XWDa-PIVoG-wtMsf4b');
    expect(res.body.data.contracts.token_contract_metadata).toBe('/contracts/72h-v3-mainnet.json');
    expect(res.body.data.contracts.merkle_claim_role).toBe('legacy_reward_claim_path');
    expect(res.body.data.contracts.deposit_vault).toBeDefined();
    expect(res.body.data.contracts.deposit_vault_jetton_wallet).toBeDefined();
    expect(res.body.data.contracts.deposit_season_id).toBe('1');
  });

  it('does not expose testnet MerkleClaim fallback in production bootstrap', async () => {
    const originalEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.CHAIN_ID = 'ton-mainnet';
    delete process.env.MERKLE_CLAIM_ADDRESS;
    process.env.MERKLE_CLAIM_ADDRESS_TESTNET = 'EQDTESTMERKLECLAIMADDRESS000000000000000000000000000';

    const res = await request(app).get('/v1/app/bootstrap');
    expect(res.status).toBe(200);
    expect(res.body.data.contracts.merkle_claim).toBe('');

    process.env = originalEnv;
  });
});
