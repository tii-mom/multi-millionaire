import { getAppControl } from '../models/opsModel';

export function isProductionRuntime(): boolean {
  return ['production', 'prod'].includes((process.env.NODE_ENV || '').trim().toLowerCase());
}

export function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export async function isControlEnabled(key: string): Promise<boolean> {
  const envKey = key.toUpperCase();
  if (isTruthyEnv(process.env[envKey])) {
    return true;
  }
  if (!isProductionRuntime() && !isTruthyEnv(process.env.APP_CONTROLS_DB_ENABLED)) {
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
  return isProductionRuntime() || isTruthyEnv(process.env.CHAIN_MAINLINE_WRITES_ENABLED);
}

export function riskReviewEnabled(): boolean {
  return !['0', 'false', 'no', 'off'].includes((process.env.RISK_REVIEW_ENABLED || 'true').trim().toLowerCase());
}

export function adminOperationsEnabled(): boolean {
  return !['0', 'false', 'no', 'off'].includes((process.env.ADMIN_OPERATIONS_ENABLED || 'true').trim().toLowerCase());
}
