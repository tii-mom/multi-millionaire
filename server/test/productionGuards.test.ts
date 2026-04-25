import { getAppControl } from '../src/models/opsModel';
import { isControlEnabled, isProductionRuntime, productionChainRequired } from '../src/services/productionGuards';

jest.mock('../src/models/opsModel', () => ({
  getAppControl: jest.fn(),
}));

const getAppControlMock = getAppControl as jest.Mock;
const originalEnv = { ...process.env };

describe('production guards', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    getAppControlMock.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('treats production and prod as production runtime aliases', () => {
    process.env.NODE_ENV = 'prod';
    expect(isProductionRuntime()).toBe(true);
    expect(productionChainRequired()).toBe(true);

    process.env.NODE_ENV = 'production';
    expect(isProductionRuntime()).toBe(true);
    expect(productionChainRequired()).toBe(true);
  });

  it('fails pause controls closed in production when the control store cannot be read', async () => {
    process.env.NODE_ENV = 'prod';
    getAppControlMock.mockRejectedValue(new Error('db unavailable'));

    await expect(isControlEnabled('pause_deposits')).resolves.toBe(true);
    await expect(isControlEnabled('pause_reward_claims')).resolves.toBe(true);
  });

  it('does not fail non-pause controls closed on read errors', async () => {
    process.env.NODE_ENV = 'production';
    getAppControlMock.mockRejectedValue(new Error('db unavailable'));

    await expect(isControlEnabled('maintenance_banner')).resolves.toBe(false);
  });
});
