import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { query } from '../src/db';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const queryMock = query as jest.Mock;

const wave = {
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
  direct_reward_rate_bps: 100,
  per_invite_cap: '0',
  inviter_wave_cap: '0',
  claim_min_amount: '0',
  counted_member_cap: null,
  settle_delay_seconds: 0,
  deposits_disabled: false,
};

const userId = '00000000-0000-0000-0000-000000000001';
const token = jwt.sign({ userId, email: 'user@example.com' }, 'secret');

function mockSquadQueries(existingMembership: any = null) {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM waves WHERE wave_id')) {
      return { rows: [wave] };
    }
    if (sql.includes('FROM squad_members') && sql.includes('WHERE wave_id = $1 AND user_id = $2')) {
      return { rows: existingMembership ? [existingMembership] : [] };
    }
    if (sql.includes('INSERT INTO squads')) {
      return {
        rows: [{
          id: 7,
          wave_id: 1,
          name: 'Alpha',
          captain_user_id: userId,
          status: 'open',
          invite_code: 'ABC12345',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
    }
    if (sql.includes('INSERT INTO squad_members')) {
      return {
        rows: [{
          id: 11,
          wave_id: 1,
          squad_id: 7,
          user_id: userId,
          role: 'captain',
          status: 'joined_pending',
          joined_at: new Date(),
          activated_at: null,
        }],
      };
    }
    return { rows: [] };
  });
}

describe('Squad API', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('creates a squad successfully', async () => {
    mockSquadQueries();

    const res = await request(app)
      .post('/v1/waves/1/squads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha' });

    expect(res.status).toBe(201);
    expect(res.body.data.squad.name).toBe('Alpha');
  });

  it('blocks duplicate membership in the same wave', async () => {
    mockSquadQueries({ id: 5, wave_id: 1, squad_id: 1, user_id: userId });

    const res = await request(app)
      .post('/v1/waves/1/squads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Beta' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SQUAD_MEMBERSHIP_EXISTS');
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO squads'))).toBe(false);
  });

  it('auto joins the creator as squad captain', async () => {
    mockSquadQueries();

    const res = await request(app)
      .post('/v1/waves/1/squads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alpha' });

    expect(res.status).toBe(201);
    expect(res.body.data.member.user_id).toBe(userId);
    expect(res.body.data.member.role).toBe('captain');
  });

  it('lists leaderboard rows with the required ordering query', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM waves WHERE wave_id')) {
        return { rows: [wave] };
      }
      return {
        rows: [
          { id: 1, name: 'Alpha', captain_user_id: userId, activated_member_count: 3, total_locked: '900', rank: 1 },
          { id: 2, name: 'Beta', captain_user_id: userId, activated_member_count: 2, total_locked: '1200', rank: 2 },
        ],
      };
    });

    const res = await request(app).get('/v1/waves/1/squads');

    expect(res.status).toBe(200);
    expect(res.body.data.map((row: any) => row.name)).toEqual(['Alpha', 'Beta']);
    const leaderboardSql = queryMock.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes('ROW_NUMBER() OVER'));
    expect(leaderboardSql).toContain('activated_member_count, 0) DESC');
    expect(leaderboardSql).toContain('total_locked::numeric, 0) DESC');
    expect(leaderboardSql).toContain('s.created_at ASC');
  });

  it('returns the authenticated user squad view from backend membership', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM waves WHERE wave_id')) {
        return { rows: [wave] };
      }
      if (sql.includes('FROM squad_members') && sql.includes('WHERE wave_id = $1 AND user_id = $2')) {
        return {
          rows: [{
            id: 11,
            wave_id: 1,
            squad_id: 7,
            user_id: userId,
            role: 'captain',
            status: 'activated',
            joined_at: new Date(),
            activated_at: new Date(),
          }],
        };
      }
      if (sql.includes('FROM squads') && sql.includes('WHERE wave_id = $1 AND id = $2')) {
        return {
          rows: [{
            id: 7,
            wave_id: 1,
            name: 'Alpha',
            captain_user_id: userId,
            status: 'open',
            invite_code: 'ABC12345',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      }
      if (sql.includes('sm.squad_id = $2')) {
        return {
          rows: [{
            id: 11,
            user_id: userId,
            email: 'user@example.com',
            role: 'captain',
            status: 'activated',
            joined_at: new Date(),
            activated_at: new Date(),
            total_locked_raw: '1000000000',
            rank: 1,
          }],
        };
      }
      if (sql.includes('ROW_NUMBER() OVER')) {
        return {
          rows: [{ id: 7, name: 'Alpha', captain_user_id: userId, activated_member_count: 1, total_locked: '1000000000', rank: 3 }],
        };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get('/v1/waves/1/squads/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.squad.name).toBe('Alpha');
    expect(res.body.data.membership.role).toBe('captain');
    expect(res.body.data.rank).toBe(3);
    expect(res.body.data.members[0].total_locked_raw).toBe('1000000000');
  });

  it('returns public squad detail with ranked members', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM waves WHERE wave_id')) {
        return { rows: [wave] };
      }
      if (sql.includes('FROM squads') && sql.includes('WHERE wave_id = $1 AND id = $2')) {
        return {
          rows: [{
            id: 7,
            wave_id: 1,
            name: 'Alpha',
            captain_user_id: userId,
            status: 'open',
            invite_code: 'ABC12345',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      }
      if (sql.includes('sm.squad_id = $2')) {
        return {
          rows: [
            { id: 11, user_id: userId, email: 'user@example.com', role: 'captain', status: 'activated', joined_at: new Date(), activated_at: new Date(), total_locked_raw: '1000000000', rank: 1 },
            { id: 12, user_id: '00000000-0000-0000-0000-000000000002', email: 'mate@example.com', role: 'member', status: 'joined_pending', joined_at: new Date(), activated_at: null, total_locked_raw: '0', rank: 2 },
          ],
        };
      }
      if (sql.includes('ROW_NUMBER() OVER')) {
        return {
          rows: [{ id: 7, name: 'Alpha', captain_user_id: userId, activated_member_count: 1, total_locked: '1000000000', rank: 1 }],
        };
      }
      return { rows: [] };
    });

    const res = await request(app).get('/v1/waves/1/squads/7');

    expect(res.status).toBe(200);
    expect(res.body.data.member_count).toBe(2);
    expect(res.body.data.members.map((member: any) => member.rank)).toEqual([1, 2]);
  });

  it('returns current user leaderboard position', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM waves WHERE wave_id')) {
        return { rows: [wave] };
      }
      if (sql.includes('WHERE user_id = $2') && sql.includes('qualifying_position_count')) {
        return {
          rows: [{
            user_id: userId,
            email: 'user@example.com',
            total_locked_raw: '2000000000',
            qualifying_position_count: 1,
            first_qualified_at: new Date(),
            rank: 4,
          }],
        };
      }
      if (sql.includes('FROM squad_members') && sql.includes('WHERE wave_id = $1 AND user_id = $2')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get('/v1/waves/1/leaderboard/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.personal.rank).toBe(4);
    expect(res.body.data.squad).toBeNull();
  });

  it('returns reward estimate using Season War pool raw amounts', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM waves WHERE wave_id')) {
        return { rows: [wave] };
      }
      if (sql.includes('AS wave_locked_raw')) {
        return { rows: [{ wave_locked_raw: '10000000000' }] };
      }
      if (sql.includes('AS user_locked_raw')) {
        return { rows: [{ user_locked_raw: '1000000000' }] };
      }
      if (sql.includes('approved_referral_amount_raw')) {
        return {
          rows: [{
            pending_amount_raw: '0',
            approved_amount_raw: '500000000',
            claimed_amount_raw: '0',
            approved_referral_amount_raw: '500000000',
          }],
        };
      }
      if (sql.includes('FROM squad_members') && sql.includes('WHERE wave_id = $1 AND user_id = $2')) {
        return { rows: [] };
      }
      if (sql.includes('ROW_NUMBER() OVER')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .get('/v1/waves/1/reward-estimate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.release_amount_raw).toBe('500000000000000000');
    expect(res.body.data.categories.find((category: any) => category.category === 'personal').estimate_amount_raw).toBe('25000000000000000');
    expect(res.body.data.categories.find((category: any) => category.category === 'referral').estimate_amount_raw).toBe('500000000');
  });
});
