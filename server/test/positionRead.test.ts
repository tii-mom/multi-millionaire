import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { getUserWavePositionTotal } from '../src/models/positionModel';

jest.mock('../src/models/positionModel', () => ({
  getUserWavePositionTotal: jest.fn(),
}));

const getUserWavePositionTotalMock = getUserWavePositionTotal as jest.Mock;

describe('Position read API', () => {
  beforeEach(() => {
    getUserWavePositionTotalMock.mockReset();
  });

  it('returns the authenticated user wave total from backend positions', async () => {
    const token = jwt.sign({ userId: 'user-1', email: 'user@example.com' }, 'secret');
    getUserWavePositionTotalMock.mockResolvedValue({
      total_locked_raw: '42000000000',
      position_count: 2,
    });

    const res = await request(app)
      .get('/v1/waves/7/positions/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      user_id: 'user-1',
      wave_id: 7,
      total_locked_raw: '42000000000',
      position_count: 2,
    });
    expect(getUserWavePositionTotalMock).toHaveBeenCalledWith('user-1', 7);
  });
});
