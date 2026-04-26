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

function productionChainWriteEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CHAIN_MAINLINE_WRITES_ENABLED: 'true',
    RECEIPT_VERIFICATION_ENABLED: 'true',
    CHAIN_RECEIPT_VERIFIER: 'ton_rpc',
    MERKLE_CLAIM_VERIFIER: 'ton_rpc',
    WALLET_BINDING_ENABLED: 'true',
    WALLET_BINDING_MESSAGE_DOMAIN: 'mm.72h.lol',
    WALLET_SIGNATURE_MODE: 'ton_proof',
    CHAIN_ID: 'ton-mainnet',
    CHAIN_RPC_URL: 'https://toncenter.com/api/v2/jsonRPC',
    TOKEN_ADDRESS: 'EQDvE0ffdwvOhILjRJKFd2bIU9t5H9bG3-SKRidqavZjRsw8',
    TOKEN_DECIMALS: '9',
    LOCK_VAULT_ADDRESS: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
    LOCK_VAULT_JETTON_WALLET_ADDRESS: 'EQBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBM9d',
    MERKLE_CLAIM_ADDRESS: 'EQCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCM9e',
    REWARD_JETTON_WALLET_ADDRESS: 'EQDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDM9f',
    REWARD_CLAIM_MODEL: 'merkle',
    CHAIN_CANARY_ALLOWLIST: 'UQCxJ05yeawVWlsN5SfJ-obajgh2lFffR-O7ebH_s_wqQfRq',
    CHAIN_CANARY_MAX_AMOUNT_RAW: '1000000000',
    CHAIN_CANARY_WAVE_IDS: '1',
    MAINNET_DEPLOYMENT_EVIDENCE_RECORDED: 'true',
    CONTRACTS_EXTERNAL_AUDIT_APPROVED: 'true',
    PRODUCTION_CANARY_APPROVED: 'true',
    MAINNET_CANARY_EVIDENCE_URL: 'https://72h.lol/evidence/canary-1',
    ...overrides,
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
    const result = runCheckEnv(productionChainWriteEnv({
      CHAIN_RPC_URL: 'https://rpc.example.invalid/jsonRPC',
      TON_TRANSACTIONS_API_URL: '',
    }));

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(requiredMessages(result.parsed, 'TON_TRANSACTIONS_API_URL')).toHaveLength(1);
  });

  it('fails mainline writes without canary and launch evidence gates', () => {
    const result = runCheckEnv(productionChainWriteEnv({
      CHAIN_CANARY_ALLOWLIST: '',
      CHAIN_CANARY_MAX_AMOUNT_RAW: '0',
      CHAIN_CANARY_WAVE_IDS: '',
      MAINNET_DEPLOYMENT_EVIDENCE_RECORDED: 'false',
      CONTRACTS_EXTERNAL_AUDIT_APPROVED: 'false',
      PRODUCTION_CANARY_APPROVED: 'false',
      MAINNET_CANARY_EVIDENCE_URL: '',
    }));

    expect(result.code).toBe(1);
    expect(result.parsed.required).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'CHAIN_CANARY_ALLOWLIST', status: 'missing' }),
      expect.objectContaining({ name: 'CHAIN_CANARY_WAVE_IDS', status: 'missing' }),
      expect.objectContaining({ name: 'MAINNET_CANARY_EVIDENCE_URL', status: 'missing' }),
    ]));
    expect(requiredMessages(result.parsed, 'CHAIN_CANARY_MAX_AMOUNT_RAW')).toContain('Value must be greater than zero');
    expect(requiredMessages(result.parsed, 'MAINNET_DEPLOYMENT_EVIDENCE_RECORDED')).toContain('Value must be true');
    expect(requiredMessages(result.parsed, 'CONTRACTS_EXTERNAL_AUDIT_APPROVED')).toContain('Value must be true');
    expect(requiredMessages(result.parsed, 'PRODUCTION_CANARY_APPROVED')).toContain('Value must be true');
  });

  it('passes required checks when production chain write gates are complete', () => {
    const result = runCheckEnv(productionChainWriteEnv());

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.parsed.status).toBe('pass');
  });

  it('fails public launch when only owner staged price is available', () => {
    const result = runCheckEnv(productionChainWriteEnv({
      PRODUCTION_PUBLIC_LAUNCH_ENABLED: 'true',
      ORACLE_ADDRESS: '',
      PRICE_ORACLE_EXTERNAL_AUDIT_APPROVED: 'false',
    }));

    expect(result.code).toBe(1);
    expect(result.parsed.status).toBe('fail');
    expect(result.parsed.required).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ORACLE_ADDRESS', status: 'missing' }),
    ]));
    expect(requiredMessages(result.parsed, 'PRICE_ORACLE_EXTERNAL_AUDIT_APPROVED')).toContain(
      'Public launch cannot rely on owner staged price only'
    );
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
