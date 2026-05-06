import {
  assertJwtStartupConfig,
  assertProductionChainStartupConfig,
  assertServerStartupConfig,
  assertWorkerStartupConfig,
  StartupConfigurationError,
} from '../src/services/startupConfig';

describe('startup configuration gates', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, JWT_SECRET: 'test-jwt-secret' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function setValidProductionChainEnv() {
    process.env.NODE_ENV = 'production';
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'true';
    process.env.CHAIN_ID = 'ton-mainnet';
    process.env.CHAIN_RPC_URL = 'https://toncenter.com/api/v2/jsonRPC';
    process.env.TOKEN_ADDRESS = 'EQBTOKENMAINNET';
    process.env.TOKEN_DECIMALS = '9';
    process.env.LOCK_VAULT_ADDRESS = 'EQCLOCKVAULTMAINNET';
    process.env.LOCK_VAULT_JETTON_WALLET_ADDRESS = 'EQCLOCKVAULTJETTONWALLET';
    process.env.MERKLE_CLAIM_ADDRESS = 'EQCMERKLECLAIMMAINNET';
    process.env.REWARD_JETTON_WALLET_ADDRESS = 'EQCREWARDJETTONWALLET';
    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.WALLET_BINDING_MESSAGE_DOMAIN = 'multi-millionaire.example';
    process.env.WALLET_SIGNATURE_MODE = 'ton_proof';
    process.env.RECEIPT_VERIFICATION_ENABLED = 'true';
    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.MERKLE_CLAIM_VERIFIER = 'ton_rpc';
    process.env.CHAIN_CANARY_ALLOWLIST = '0:b1274e7279ac155a5b0de527c9fa86da8e08769457df47e3bb79b1ffb3fc2a41';
    process.env.CHAIN_CANARY_MAX_AMOUNT_RAW = '1000000000';
    process.env.CHAIN_CANARY_WAVE_IDS = '1';
  }

  it('fails startup when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;

    expect(() => assertJwtStartupConfig()).toThrow('JWT_SECRET is required');
    expect(() => assertServerStartupConfig()).toThrow('JWT_SECRET is required');
  });

  it('accepts a fully configured production chain runtime', () => {
    setValidProductionChainEnv();

    expect(() => assertProductionChainStartupConfig()).not.toThrow();
  });

  it('does not require production chain write config while chain write flags are false', () => {
    process.env.NODE_ENV = 'production';
    process.env.CHAIN_ID = 'ton-mainnet';
    process.env.CHAIN_MAINLINE_WRITES_ENABLED = 'false';
    process.env.WALLET_BINDING_ENABLED = 'false';
    process.env.RECEIPT_VERIFICATION_ENABLED = 'false';
    delete process.env.CHAIN_RPC_URL;
    delete process.env.LOCK_VAULT_ADDRESS;

    expect(() => assertProductionChainStartupConfig()).not.toThrow();
  });

  it('applies Worker string bindings before running startup gates', () => {
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;

    expect(() => assertWorkerStartupConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'worker-secret',
      CHAIN_MAINLINE_WRITES_ENABLED: 'false',
      HYPERDRIVE: { connectionString: 'postgres://example' },
    })).not.toThrow();
    expect(process.env.JWT_SECRET).toBe('worker-secret');
    expect(process.env.HYPERDRIVE).toBeUndefined();
  });

  it('fails Worker startup closed when required bindings are missing', () => {
    delete process.env.JWT_SECRET;

    expect(() => assertWorkerStartupConfig({
      NODE_ENV: 'production',
      CHAIN_MAINLINE_WRITES_ENABLED: 'false',
    })).toThrow('JWT_SECRET is required');
  });

  it('rejects production chain runtime without ton_proof wallet signatures', () => {
    setValidProductionChainEnv();
    process.env.WALLET_SIGNATURE_MODE = 'test';

    expect(() => assertProductionChainStartupConfig()).toThrow('WALLET_SIGNATURE_MODE must be ton_proof');
  });

  it('rejects production chain runtime when wallet binding or receipt verification is not enabled', () => {
    setValidProductionChainEnv();
    process.env.WALLET_BINDING_ENABLED = 'false';

    expect(() => assertProductionChainStartupConfig()).toThrow('WALLET_BINDING_ENABLED must be true');

    process.env.WALLET_BINDING_ENABLED = 'true';
    process.env.RECEIPT_VERIFICATION_ENABLED = 'false';
    expect(() => assertProductionChainStartupConfig()).toThrow('RECEIPT_VERIFICATION_ENABLED must be true');
  });

  it('rejects production chain runtime without ton_rpc receipt verifiers', () => {
    setValidProductionChainEnv();
    process.env.CHAIN_RECEIPT_VERIFIER = 'test';

    expect(() => assertProductionChainStartupConfig()).toThrow('CHAIN_RECEIPT_VERIFIER must be ton_rpc');

    process.env.CHAIN_RECEIPT_VERIFIER = 'ton_rpc';
    process.env.MERKLE_CLAIM_VERIFIER = 'disabled';
    expect(() => assertProductionChainStartupConfig()).toThrow('MERKLE_CLAIM_VERIFIER must be ton_rpc');
  });

  it('rejects production chain runtime with testnet fallback addresses present', () => {
    setValidProductionChainEnv();
    process.env.MERKLE_CLAIM_ADDRESS_TESTNET = 'kQCTESTNETMERKLE';

    expect(() => assertProductionChainStartupConfig()).toThrow(StartupConfigurationError);
    expect(() => assertProductionChainStartupConfig()).toThrow('MERKLE_CLAIM_ADDRESS_TESTNET must not be set');
  });
});
