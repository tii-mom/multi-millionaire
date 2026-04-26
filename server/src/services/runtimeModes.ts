import { adminOperationsEnabled, isProductionRuntime, isTruthyEnv, productionChainRequired } from './productionGuards';
import { loadContractIntegrationConfig } from './contracts/config';

export type RuntimePath = 'production-chain' | 'staging-mvp' | 'future-disabled';

export function currentRuntimePath(): RuntimePath {
  if (productionChainRequired()) {
    return 'production-chain';
  }
  if (isTruthyEnv(process.env.STAGING_MVP_ENABLED) || !isProductionRuntime()) {
    return 'staging-mvp';
  }
  return 'future-disabled';
}

export function stagingMvpEnabled(): boolean {
  return currentRuntimePath() === 'staging-mvp';
}

export function productionChainEnabled(): boolean {
  return currentRuntimePath() === 'production-chain';
}

export function walletBindingRuntimeEnabled(): boolean {
  const config = loadContractIntegrationConfig();
  return config.walletBinding.enabled;
}

export function merkleDraftWritesEnabled(): boolean {
  if (!adminOperationsEnabled()) {
    return false;
  }
  if (!isProductionRuntime()) {
    return true;
  }
  return isTruthyEnv(process.env.MERKLE_DRAFT_WRITES_ENABLED)
    && isTruthyEnv(process.env.PRODUCTION_CANARY_APPROVED);
}
