import { spawnSync } from 'child_process';
import path from 'path';

const serverRoot = path.resolve(__dirname, '../..');

interface EnvCheckResult {
  status: 'pass' | 'fail';
  profile: string;
  required: Array<{
    name: string;
    status: 'present' | 'missing' | 'invalid';
    message?: string;
  }>;
}

function baseProductionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/app',
    JWT_SECRET: 'production-secret-value',
    PORT: '4000',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    HIGH_RISK_DEPOSIT_THRESHOLD: '1000',
    ...overrides,
  };
}

function runCheckEnv(overrides: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(
    process.execPath,
    ['-r', 'ts-node/register', 'src/scripts/checkEnv.ts', 'production', '--json'],
    {
      cwd: serverRoot,
      env: baseProductionEnv(overrides),
      encoding: 'utf8',
    }
  );
  const output = result.stdout.trim();
  return {
    code: result.status,
    stderr: result.stderr,
    parsed: JSON.parse(output) as EnvCheckResult,
  };
}

function requiredMessages(result: EnvCheckResult, name: string): string[] {
  return result.required
    .filter((item) => item.name === name && item.status === 'invalid')
    .map((item) => item.message || '');
}

describe('checkEnv production chain gates', () => {
  it('fails receipt verification closed without a transactions API source', () => {
    const result = runCheckEnv({
      RECEIPT_VERIFICATION_ENABLED: 'true',
      CHAIN_RECEIPT_VERIFIER: 'ton_rpc',
      CHAIN_RPC_URL: 'https://rpc.example.invalid/jsonRPC',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'TON_TRANSACTIONS_API_URL')).toContain(
      'Production TON verification requires TON_TRANSACTIONS_API_URL or a toncenter.com CHAIN_RPC_URL that maps to /api/v3/transactions'
    );
  });

  it('accepts an explicit transactions API source for receipt verification', () => {
    const result = runCheckEnv({
      RECEIPT_VERIFICATION_ENABLED: 'true',
      CHAIN_RECEIPT_VERIFIER: 'ton_rpc',
      CHAIN_RPC_URL: 'https://rpc.example.invalid/jsonRPC',
      TON_TRANSACTIONS_API_URL: 'https://transactions.example.com/api/v3/transactions',
    });

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.parsed.status).toBe('pass');
  });

  it('accepts a Toncenter RPC source that maps to v3 transactions', () => {
    const result = runCheckEnv({
      RECEIPT_VERIFICATION_ENABLED: 'true',
      CHAIN_RECEIPT_VERIFIER: 'ton_rpc',
      CHAIN_RPC_URL: 'https://toncenter.com/api/v2/jsonRPC',
    });

    expect(result.code).toBe(0);
    expect(result.parsed.status).toBe('pass');
  });

  it('fails Merkle claim verification closed without a transactions API source', () => {
    const result = runCheckEnv({
      MERKLE_CLAIM_VERIFIER: 'ton_rpc',
      CHAIN_RPC_URL: 'https://rpc.example.invalid/jsonRPC',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'TON_TRANSACTIONS_API_URL')).toHaveLength(1);
  });

  it('fails mainline writes closed without a transactions API source', () => {
    const result = runCheckEnv({
      CHAIN_MAINLINE_WRITES_ENABLED: 'true',
      RECEIPT_VERIFICATION_ENABLED: 'true',
      CHAIN_RECEIPT_VERIFIER: 'ton_rpc',
      WALLET_BINDING_ENABLED: 'true',
      WALLET_SIGNATURE_MODE: 'ton_proof',
      CHAIN_RPC_URL: 'https://rpc.example.invalid/jsonRPC',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'TON_TRANSACTIONS_API_URL')).toHaveLength(1);
  });

  it('fails production when the receipt verifier is test mode', () => {
    const result = runCheckEnv({
      CHAIN_RECEIPT_VERIFIER: 'test',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'CHAIN_RECEIPT_VERIFIER')).toContain(
      'Production cannot use CHAIN_RECEIPT_VERIFIER=test'
    );
  });

  it('fails production when receipt verification is enabled without a real receipt verifier', () => {
    const result = runCheckEnv({
      RECEIPT_VERIFICATION_ENABLED: 'true',
      CHAIN_RECEIPT_VERIFIER: 'disabled',
      CHAIN_RPC_URL: 'https://toncenter.com/api/v2/jsonRPC',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'CHAIN_RECEIPT_VERIFIER')).toContain(
      'RECEIPT_VERIFICATION_ENABLED=true cannot use test/disabled receipt verifier'
    );
  });

  it('fails production when the Merkle claim verifier is test mode', () => {
    const result = runCheckEnv({
      MERKLE_CLAIM_VERIFIER: 'test',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'MERKLE_CLAIM_VERIFIER')).toContain(
      'Production cannot use MERKLE_CLAIM_VERIFIER=test'
    );
  });

  it('fails production when the wallet signature verifier is test mode', () => {
    const result = runCheckEnv({
      WALLET_SIGNATURE_MODE: 'test',
    });

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'WALLET_SIGNATURE_MODE')).toContain(
      'Production cannot use WALLET_SIGNATURE_MODE=test'
    );
  });
});
