import { query } from '../src/db';
import { buildSeasonWarExport } from '../src/services/seasonWarExporter';
import { calculateSeasonWarPoolAmountsForRounds } from '../src/services/seasonRewards';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const queryMock = query as jest.MockedFunction<typeof query>;

const tokenAddress = '0:1111111111111111111111111111111111111111111111111111111111111111';
const seasonClaimAddress = '0:9999999999999999999999999999999999999999999999999999999999999999';

function baseRows() {
  const createdAt = new Date('2026-04-28T00:00:00Z');
  return {
    positions: [
      {
        position_id: '00000000-0000-0000-0000-000000000001',
        user_id: '10000000-0000-0000-0000-000000000001',
        wave_id: 1,
        amount_raw: '100',
        onchain_position_id: '101',
        qualifies_for_activation: true,
        withdrawn: false,
        is_first_qualifying_for_user: true,
        position_created_at: createdAt,
        wallet_address: '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        normalized_address: '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chain_event_id: '20000000-0000-0000-0000-000000000001',
        tx_hash: 'tx-1',
        log_index: 0,
        block_number: '1',
        block_time: createdAt,
        chain_payload: { positionId: '101', amountRaw: '100', waveId: 1 },
      },
      {
        position_id: '00000000-0000-0000-0000-000000000002',
        user_id: '10000000-0000-0000-0000-000000000002',
        wave_id: 1,
        amount_raw: '300',
        onchain_position_id: '102',
        qualifies_for_activation: true,
        withdrawn: false,
        is_first_qualifying_for_user: true,
        position_created_at: new Date('2026-04-28T00:01:00Z'),
        wallet_address: '0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        normalized_address: '0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        chain_event_id: '20000000-0000-0000-0000-000000000002',
        tx_hash: 'tx-2',
        log_index: 0,
        block_number: '2',
        block_time: createdAt,
        chain_payload: { positionId: '102', amountRaw: '300', waveId: 1 },
      },
    ],
    referrals: [
      {
        id: '30000000-0000-0000-0000-000000000001',
        invitee_user_id: '10000000-0000-0000-0000-000000000001',
        inviter_user_id: '10000000-0000-0000-0000-000000000003',
        status: 'locked',
        locked_at: createdAt,
        created_at: createdAt,
        inviter_wallet: '0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        inviter_normalized_address: '0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        invitee_wallet: '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        invitee_normalized_address: '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
    squads: [
      {
        wave_id: 1,
        squad_id: 1,
        squad_name: 'Alpha',
        squad_created_at: createdAt,
        user_id: '10000000-0000-0000-0000-000000000001',
        role: 'captain',
        status: 'activated',
      },
      {
        wave_id: 1,
        squad_id: 1,
        squad_name: 'Alpha',
        squad_created_at: createdAt,
        user_id: '10000000-0000-0000-0000-000000000002',
        role: 'member',
        status: 'activated',
      },
    ],
    risks: [] as any[],
    rewardLedgerRisks: [] as any[],
  };
}

function mockExporterQueries(rows: ReturnType<typeof baseRows>) {
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes('FROM positions p')) return Promise.resolve({ rows: rows.positions });
    if (sql.includes('FROM referrals r')) return Promise.resolve({ rows: rows.referrals });
    if (sql.includes('FROM squad_members sm')) return Promise.resolve({ rows: rows.squads });
    if (sql.includes('FROM risk_flags')) return Promise.resolve({ rows: rows.risks });
    if (sql.includes('FROM reward_ledgers')) return Promise.resolve({ rows: rows.rewardLedgerRisks });
    return Promise.resolve({ rows: [] });
  }) as any;
}

describe('Season War exporter', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('allocates one successful round across all four pools and emits SeasonClaim artifacts', async () => {
    mockExporterQueries(baseRows());

    const result = await buildSeasonWarExport({
      seasonId: 1,
      successfulRoundCount: 1,
      successfulWaveIds: [1],
      outDir: '/tmp/season-war-test',
      chainId: 'ton-mainnet',
      tokenAddress,
      seasonClaimAddress,
      openAt: 1_800_000_000,
    });

    const totals = calculateSeasonWarPoolAmountsForRounds(1);
    expect(result.manifest.pool_totals).toEqual(totals);
    expect(result.manifest.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.leaves).toHaveLength(3);
    expect(result.leaves.every((leaf) => typeof leaf.seasonClaimProofCellBase64 === 'string')).toBe(true);
    const operatorPayload = result.operatorRegisterSeasonClaim as any;
    expect(operatorPayload.params).toMatchObject({
      seasonId: 1,
      totalAmount72H: '500000000000000000',
      personalDepositTotal72H: totals.personal,
      teamDepositTotal72H: totals.team,
      referralTotal72H: totals.referral,
      leaderboardTotal72H: totals.leaderboard,
      openAt: 1_800_000_000,
    });

    const inviterLeaf = result.leaves.find((leaf) => leaf.recipientWallet === '0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
    expect(inviterLeaf).toMatchObject({
      personalAmountRaw: '0',
      teamAmountRaw: '0',
      referralAmountRaw: totals.referral,
      leaderboardAmountRaw: '0',
    });
  });

  it('excludes risk-flagged positions while preserving exact pool totals', async () => {
    const rows = baseRows();
    rows.positions.push({
      ...rows.positions[0],
      position_id: '00000000-0000-0000-0000-000000000099',
      user_id: '10000000-0000-0000-0000-000000000099',
      amount_raw: '900',
      onchain_position_id: '199',
      wallet_address: '0:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      normalized_address: '0:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      chain_event_id: '20000000-0000-0000-0000-000000000099',
      tx_hash: 'tx-99',
      chain_payload: { positionId: '199', amountRaw: '900', waveId: 1 },
    });
    rows.risks.push({
      id: '40000000-0000-0000-0000-000000000099',
      entity_type: 'position',
      entity_id: '00000000-0000-0000-0000-000000000099',
      flag_type: 'review',
      severity: 'high',
      status: 'open',
      note: null,
    });
    mockExporterQueries(rows);

    const result = await buildSeasonWarExport({
      seasonId: 1,
      successfulRoundCount: 1,
      successfulWaveIds: [1],
      outDir: '/tmp/season-war-test',
      chainId: 'ton-mainnet',
      tokenAddress,
      seasonClaimAddress,
    });

    expect(result.manifest.pool_totals).toEqual(calculateSeasonWarPoolAmountsForRounds(1));
    expect(result.quarantineRows).toEqual([
      expect.objectContaining({
        entity_type: 'position',
        entity_id: '00000000-0000-0000-0000-000000000099',
        reasons: ['position_risk_flag'],
      }),
    ]);
    expect(JSON.stringify(result.leaves)).not.toContain('dddddddd');
  });

  it('fails before reading data when successful wave count does not match successful round count', async () => {
    await expect(buildSeasonWarExport({
      seasonId: 1,
      successfulRoundCount: 2,
      successfulWaveIds: [1],
      outDir: '/tmp/season-war-test',
      chainId: 'ton-mainnet',
      tokenAddress,
      seasonClaimAddress,
    })).rejects.toThrow('successful-wave-ids count must equal successfulRoundCount');

    expect(queryMock).not.toHaveBeenCalled();
  });
});
