import { assertSafeReceiptApplyIntegrationDatabase } from './receiptApplyIntegrationGuard';

const originalEnv = { ...process.env };

function withEnv(env: NodeJS.ProcessEnv, fn: () => void) {
  process.env = { ...originalEnv, ...env };
  try {
    fn();
  } finally {
    process.env = { ...originalEnv };
  }
}

describe('receipt apply integration guard', () => {
  afterAll(() => {
    process.env = originalEnv;
  });

  it('requires an explicit opt-in flag', () => {
    withEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/receipt_apply_test',
      NODE_ENV: 'test',
    }, () => {
      expect(() => assertSafeReceiptApplyIntegrationDatabase()).toThrow(/RUN_RECEIPT_APPLY_INTEGRATION=true/);
    });
  });

  it('accepts local test databases', () => {
    withEnv({
      RUN_RECEIPT_APPLY_INTEGRATION: 'true',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/receipt_apply_test',
      NODE_ENV: 'test',
    }, () => {
      expect(assertSafeReceiptApplyIntegrationDatabase()).toBe('receipt_apply_test');
    });
  });

  it('refuses production runtime and production-looking database names', () => {
    withEnv({
      RUN_RECEIPT_APPLY_INTEGRATION: 'true',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/production',
      NODE_ENV: 'production',
    }, () => {
      expect(() => assertSafeReceiptApplyIntegrationDatabase()).toThrow(/NODE_ENV=production/);
    });

    withEnv({
      RUN_RECEIPT_APPLY_INTEGRATION: 'true',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/production_test',
      NODE_ENV: 'test',
    }, () => {
      expect(() => assertSafeReceiptApplyIntegrationDatabase()).toThrow(/production\/live/);
    });
  });

  it('refuses remote databases unless explicitly allowed', () => {
    withEnv({
      RUN_RECEIPT_APPLY_INTEGRATION: 'true',
      DATABASE_URL: 'postgres://user:pass@db.example.com:5432/receipt_apply_test',
      NODE_ENV: 'test',
    }, () => {
      expect(() => assertSafeReceiptApplyIntegrationDatabase()).toThrow(/refuse remote database hosts/);
    });

    withEnv({
      RUN_RECEIPT_APPLY_INTEGRATION: 'true',
      ALLOW_REMOTE_RECEIPT_APPLY_INTEGRATION_DB: 'true',
      DATABASE_URL: 'postgres://user:pass@db.example.com:5432/receipt_apply_test',
      NODE_ENV: 'test',
    }, () => {
      expect(assertSafeReceiptApplyIntegrationDatabase()).toBe('receipt_apply_test');
    });
  });
});
