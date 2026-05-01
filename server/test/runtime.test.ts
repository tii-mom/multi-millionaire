import { setRuntimeBindings } from '../src/runtime';
import { currentRuntimePath } from '../src/services/runtimeModes';

describe('Worker runtime bindings', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('copies string Worker bindings into process.env before runtime mode checks', () => {
    process.env.NODE_ENV = 'production';
    setRuntimeBindings({
      NODE_ENV: 'staging',
      CHAIN_MAINLINE_WRITES_ENABLED: 'false',
      HYPERDRIVE: { connectionString: 'postgres://example' },
    });

    expect(process.env.NODE_ENV).toBe('staging');
    expect(currentRuntimePath()).toBe('staging-mvp');
  });
});
