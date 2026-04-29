import { query } from '../src/db';
import { listAdminRewards, listAdminSquads, listAdminWaves } from '../src/models/adminReadModel';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const queryMock = query as jest.Mock;

describe('admin read model pagination', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('applies server-side pagination and search to reward lists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COUNT(*)::int AS total')) return { rows: [{ total: 31 }] };
      return {
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
      };
    });

    const result = await listAdminRewards({ page: 2, pageSize: 25, search: 'approved' });

    expect(result).toMatchObject({
      page: 2,
      page_size: 25,
      total: 31,
      page_count: 2,
      search: 'approved',
    });
    expect(result.rows).toHaveLength(1);

    const [rowsSql, rowsParams] = queryMock.mock.calls[0];
    const [countSql, countParams] = queryMock.mock.calls[1];
    expect(String(rowsSql)).toContain('rl.status ILIKE $1');
    expect(String(rowsSql)).toContain('LIMIT $2');
    expect(String(rowsSql)).toContain('OFFSET $3');
    expect(String(countSql)).toContain('COUNT(*)::int AS total');
    expect(rowsParams).toEqual(['%approved%', 25, 25]);
    expect(countParams).toEqual(['%approved%']);
  });

  it('clamps page inputs for admin list reads', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COUNT(*)::int AS total')) return { rows: [{ total: 0 }] };
      return { rows: [] };
    });

    const result = await listAdminWaves({ page: -3, pageSize: 500, search: '  Wave 1  ' });

    expect(result).toMatchObject({
      page: 1,
      page_size: 100,
      total: 0,
      page_count: 1,
      search: 'Wave 1',
    });
    expect(queryMock.mock.calls[0][1]).toEqual(['%Wave 1%', 100, 0]);
  });

  it('returns squad rank using activated members and locked amount ordering', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT COUNT(*)::int AS total')) return { rows: [{ total: 1 }] };
      return {
        rows: [
          {
            id: 7,
            wave_id: 1,
            name: 'Alpha',
            captain_user_id: 'captain-1',
            captain_email: 'captain@example.com',
            status: 'open',
            invite_code: 'ALPHA7',
            member_count: 4,
            activated_member_count: 3,
            total_locked: '900',
            rank: 1,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };
    });

    const result = await listAdminSquads({ page: 1, pageSize: 8, search: 'alpha' });

    expect(result.rows[0].rank).toBe(1);
    const rowsSql = String(queryMock.mock.calls[0][0]);
    expect(rowsSql).toContain('WHERE withdrawn = FALSE');
    expect(rowsSql).toContain('ROW_NUMBER() OVER');
    expect(rowsSql).toContain('COALESCE(ss.activated_member_count, 0) DESC');
    expect(rowsSql).toContain('COALESCE(ss.total_locked::numeric, 0) DESC');
    expect(rowsSql).toContain('ORDER BY rank ASC');
  });
});
