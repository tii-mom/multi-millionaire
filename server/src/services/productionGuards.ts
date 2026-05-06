import { getAppControl } from '../models/opsModel';
import { getRuntimeEnvValue } from '../runtime';

export function isProductionRuntime(): boolean {
  return ['production', 'prod'].includes((getRuntimeEnvValue('NODE_ENV') || '').trim().toLowerCase());
}

export function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export async function isControlEnabled(key: string): Promise<boolean> {
  const envKey = key.toUpperCase();
  if (isTruthyEnv(getRuntimeEnvValue(envKey))) {
    return true;
  }
  if (!isProductionRuntime() && !isTruthyEnv(getRuntimeEnvValue('APP_CONTROLS_DB_ENABLED'))) {
    return false;
  }
  try {
    const control = await getAppControl(key);
    return !!control?.enabled;
  } catch {
    if (isProductionRuntime() && key.startsWith('pause_')) {
      return true;
    }
    return false;
  }
}

export function productionChainRequired(): boolean {
  return isProductionRuntime() || isTruthyEnv(getRuntimeEnvValue('CHAIN_MAINLINE_WRITES_ENABLED'));
}

export function riskReviewEnabled(): boolean {
  return !['0', 'false', 'no', 'off'].includes((getRuntimeEnvValue('RISK_REVIEW_ENABLED') || 'true').trim().toLowerCase());
}

export function adminOperationsEnabled(): boolean {
  return !['0', 'false', 'no', 'off'].includes((getRuntimeEnvValue('ADMIN_OPERATIONS_ENABLED') || 'true').trim().toLowerCase());
}
