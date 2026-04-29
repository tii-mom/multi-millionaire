import { getJwtSecret } from './authSecrets';
import { isProductionRuntime, isTruthyEnv } from './productionGuards';

export class StartupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new StartupConfigurationError(`${name} is required for production chain runtime`);
  }
  return value;
}

function requireEnvValue(name: string, expected: string) {
  const value = requireEnv(name);
  if (value.toLowerCase() !== expected.toLowerCase()) {
    throw new StartupConfigurationError(`${name} must be ${expected}`);
  }
}

function rejectTestnetFallback(primaryName: string, testnetName: string) {
  if (process.env[testnetName]?.trim()) {
    throw new StartupConfigurationError(`${testnetName} must not be set for production chain runtime; use ${primaryName}`);
  }
}

export function assertJwtStartupConfig() {
  getJwtSecret();
}

export function productionChainStartupConfigRequired(): boolean {
  return isTruthyEnv(process.env.CHAIN_MAINLINE_WRITES_ENABLED);
}

export function assertProductionChainStartupConfig() {
  if (!productionChainStartupConfigRequired()) {
    return;
  }

  requireEnvValue('CHAIN_ID', 'ton-mainnet');
  requireEnv('CHAIN_RPC_URL');
  requireEnv('TOKEN_ADDRESS');
  requireEnvValue('TOKEN_DECIMALS', '9');
  requireEnv('LOCK_VAULT_ADDRESS');
  requireEnv('LOCK_VAULT_JETTON_WALLET_ADDRESS');
  requireEnv('MERKLE_CLAIM_ADDRESS');
  requireEnv('REWARD_JETTON_WALLET_ADDRESS');
  requireEnvValue('WALLET_BINDING_ENABLED', 'true');
  requireEnv('WALLET_BINDING_MESSAGE_DOMAIN');
  requireEnvValue('WALLET_SIGNATURE_MODE', 'ton_proof');
  requireEnvValue('RECEIPT_VERIFICATION_ENABLED', 'true');
  requireEnvValue('CHAIN_RECEIPT_VERIFIER', 'ton_rpc');
  requireEnvValue('MERKLE_CLAIM_VERIFIER', 'ton_rpc');
  requireEnv('CHAIN_CANARY_ALLOWLIST');
  requireEnv('CHAIN_CANARY_MAX_AMOUNT_RAW');
  requireEnv('CHAIN_CANARY_WAVE_IDS');

  rejectTestnetFallback('LOCK_VAULT_ADDRESS', 'LOCK_VAULT_ADDRESS_TESTNET');
  rejectTestnetFallback('LOCK_VAULT_JETTON_WALLET_ADDRESS', 'LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET');
  rejectTestnetFallback('MERKLE_CLAIM_ADDRESS', 'MERKLE_CLAIM_ADDRESS_TESTNET');
  rejectTestnetFallback('REWARD_JETTON_WALLET_ADDRESS', 'REWARD_JETTON_WALLET_ADDRESS_TESTNET');

  if (isProductionRuntime()) {
    const secret = requireEnv('JWT_SECRET');
    if (secret === 'secret') {
      throw new StartupConfigurationError('JWT_SECRET must not use the development default in production');
    }
  }
}

export function assertServerStartupConfig() {
  assertJwtStartupConfig();
  assertProductionChainStartupConfig();
}

export type WorkerStartupEnv = Record<string, unknown>;

function copyWorkerStringBindingsToProcessEnv(env: WorkerStartupEnv) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }
}

export function assertWorkerStartupConfig(env: WorkerStartupEnv) {
  copyWorkerStringBindingsToProcessEnv(env);
  assertServerStartupConfig();
}
