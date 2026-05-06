import { query } from '../src/db';
import { hasBlockingRiskForRewardClaim } from '../src/models/riskModel';

jest.mock('../src/db', () => ({
  query: jest.fn(),
}));

const queryMock = query as jest.Mock;

describe('risk model', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('blocks reward claims when risk is attached directly to the reward ledger', async () => {
    queryMock.mockResolvedValue({ rows: [{ blocked: true }] });

    await expect(hasBlockingRiskForRewardClaim('ledger-1', 'user-1')).resolves.toBe(true);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("rf.entity_type = 'reward_ledger'"),
      ['ledger-1', 'user-1']
    );
  });
});
