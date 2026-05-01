import { query } from '../src/db';
import { getCurrentWave } from '../src/models/waveModel';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const queryMock = query as jest.Mock;

describe('wave model', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('only treats live waves inside their time window as current', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ wave_id: 2, code: 'W002', status: 'upcoming' }],
      });

    const result = await getCurrentWave();

    expect(result?.wave_id).toBe(2);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(String(queryMock.mock.calls[0][0])).toContain("status = 'live'");
    expect(String(queryMock.mock.calls[0][0])).toContain('start_time <= NOW()');
    expect(String(queryMock.mock.calls[0][0])).toContain('end_time > NOW()');
    expect(String(queryMock.mock.calls[1][0])).toContain("status = 'upcoming'");
  });
});
