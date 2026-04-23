import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { query } from '../src/db';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const queryMock = query as jest.Mock;
const validToken = jwt.sign({ userId: '00000000-0000-0000-0000-000000000001', email: 'user@example.com' }, 'secret');

describe('Production hardening lite', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns health status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.request_id).toBeDefined();
  });

  it('returns readiness when the database responds', async () => {
    queryMock.mockResolvedValue({ rows: [{ ok: 1 }] });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('rejects auth registration without required fields', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('rejects deposit without an amount', async () => {
    const res = await request(app)
      .post('/v1/waves/1/deposit')
      .set('Authorization', `Bearer ${validToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
