const safeDatabaseNamePattern = /(test|integration|ci|isolated)/i;
const dangerousRemotePattern = /(prod|production|live)/i;
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

export function receiptApplyIntegrationEnabled(): boolean {
  return process.env.RUN_RECEIPT_APPLY_INTEGRATION === 'true';
}

export function assertSafeReceiptApplyIntegrationDatabase(): string {
  if (!receiptApplyIntegrationEnabled()) {
    throw new Error('RUN_RECEIPT_APPLY_INTEGRATION=true is required for receipt apply integration tests');
  }

  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production' || nodeEnv === 'prod') {
    throw new Error('Receipt apply integration tests refuse to run with NODE_ENV=production');
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for receipt apply integration tests');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL for receipt apply integration tests');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use postgres:// or postgresql:// for receipt apply integration tests');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!databaseName || !safeDatabaseNamePattern.test(databaseName)) {
    throw new Error(
      `Receipt apply integration tests refuse non-test database URL; database name "${databaseName || '<empty>'}" must contain test, integration, ci, or isolated`
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  const allowRemote = process.env.ALLOW_REMOTE_RECEIPT_APPLY_INTEGRATION_DB === 'true';
  if (!localHosts.has(hostname) && !allowRemote) {
    throw new Error(
      'Receipt apply integration tests refuse remote database hosts unless ALLOW_REMOTE_RECEIPT_APPLY_INTEGRATION_DB=true is set for a throwaway database'
    );
  }
  if (dangerousRemotePattern.test(`${hostname}/${databaseName}`)) {
    throw new Error('Receipt apply integration tests refuse database URLs that look like production/live resources');
  }

  return databaseName;
}
