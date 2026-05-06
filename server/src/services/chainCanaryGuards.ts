import { normalizeTonAddress } from './tonMessages';
import { productionChainRequired } from './productionGuards';

export class ChainCanaryGuardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ChainCanaryGuardError';
    this.status = status;
    this.code = code;
  }
}

export interface ChainCanaryMutationInput {
  walletAddress: string;
  amountRaw: string;
  waveId?: number;
}

function splitEnvList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveRawAmount(value: string | undefined, envName: string): bigint {
  const raw = (value || '0').trim();
  try {
    const parsed = BigInt(raw);
    if (parsed < BigInt(0)) {
      throw new Error('negative');
    }
    return parsed;
  } catch {
    throw new ChainCanaryGuardError(503, 'CHAIN_CANARY_CONFIG_INVALID', `${envName} must be a non-negative integer raw amount`);
  }
}

function normalizeAllowlistEntry(value: string): string {
  try {
    return normalizeTonAddress(value);
  } catch {
    throw new ChainCanaryGuardError(503, 'CHAIN_CANARY_CONFIG_INVALID', 'CHAIN_CANARY_ALLOWLIST contains an invalid TON wallet address');
  }
}

function normalizeInputWallet(value: string): string {
  try {
    return normalizeTonAddress(value);
  } catch {
    throw new ChainCanaryGuardError(403, 'CHAIN_CANARY_WALLET_NOT_ALLOWED', 'Wallet is not allowed for production chain canary');
  }
}

function parseWaveAllowlist(): Set<number> {
  const waveIds = splitEnvList(process.env.CHAIN_CANARY_WAVE_IDS);
  const parsed = new Set<number>();
  for (const item of waveIds) {
    if (!/^\d+$/.test(item)) {
      throw new ChainCanaryGuardError(503, 'CHAIN_CANARY_CONFIG_INVALID', 'CHAIN_CANARY_WAVE_IDS must contain numeric wave ids');
    }
    parsed.add(Number(item));
  }
  return parsed;
}

export function assertChainCanaryMutationAllowed(input: ChainCanaryMutationInput): void {
  if (!productionChainRequired()) {
    return;
  }

  const allowlist = splitEnvList(process.env.CHAIN_CANARY_ALLOWLIST).map(normalizeAllowlistEntry);
  if (allowlist.length === 0) {
    throw new ChainCanaryGuardError(403, 'CHAIN_CANARY_WALLET_NOT_ALLOWED', 'No wallets are allowed for production chain canary');
  }

  const normalizedWallet = normalizeInputWallet(input.walletAddress);
  if (!new Set(allowlist).has(normalizedWallet)) {
    throw new ChainCanaryGuardError(403, 'CHAIN_CANARY_WALLET_NOT_ALLOWED', 'Wallet is not allowed for production chain canary');
  }

  let amount: bigint;
  try {
    amount = BigInt(input.amountRaw);
  } catch {
    throw new ChainCanaryGuardError(400, 'INVALID_AMOUNT', 'Mutation amount must be an integer raw amount');
  }
  if (amount <= BigInt(0)) {
    throw new ChainCanaryGuardError(400, 'INVALID_AMOUNT', 'Mutation amount must be a positive raw amount');
  }

  const maxAmountRaw = parsePositiveRawAmount(process.env.CHAIN_CANARY_MAX_AMOUNT_RAW, 'CHAIN_CANARY_MAX_AMOUNT_RAW');
  if (amount > maxAmountRaw) {
    throw new ChainCanaryGuardError(403, 'CHAIN_CANARY_AMOUNT_LIMIT_EXCEEDED', 'Mutation amount exceeds production chain canary limit');
  }

  if (input.waveId !== undefined) {
    const allowedWaves = parseWaveAllowlist();
    if (allowedWaves.size > 0 && !allowedWaves.has(input.waveId)) {
      throw new ChainCanaryGuardError(403, 'CHAIN_CANARY_WAVE_NOT_ALLOWED', 'Wave is not allowed for production chain canary');
    }
  }
}
