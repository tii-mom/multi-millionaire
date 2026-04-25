import { loadContractIntegrationConfig } from './contracts/config';
import {
  findDepositTransaction,
  getTonTransactionLt,
  getTonTransactionTime,
  normalizeTonAddress,
  TonMessageParseError,
  TonTransactionLike,
} from './tonMessages';
import { Cell } from '@ton/core';

export type ChainReceiptVerifierStatus = 'disabled' | 'test' | 'ton_rpc' | 'not_configured';

export interface DepositReceiptInput {
  txHash: string;
  logIndex?: number;
  waveId?: number;
  walletAddress?: string;
  contractAddress?: string;
  amountRaw?: string;
  positionId?: string;
  blockNumber?: number;
  blockTime?: string;
  finalized?: boolean;
}

export interface VerifiedDepositReceipt {
  chainId: string;
  txHash: string;
  logIndex: number;
  walletAddress: string;
  contractAddress: string;
  amountRaw: string;
  positionId: string;
  blockNumber: number | null;
  blockTime: string | null;
  finalized: boolean;
}

export interface ChainReceiptVerifierDiagnostics {
  configured: boolean;
  status: ChainReceiptVerifierStatus;
  mode: string;
  receiptVerificationEnabled: boolean;
}

export interface ChainReceiptVerifier {
  readonly mode: ChainReceiptVerifierStatus;
  getDiagnostics(): ChainReceiptVerifierDiagnostics;
  verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt>;
}

interface LockVaultPositionSnapshot {
  ownerAddress: string;
  amountRaw: string;
  waveId: number;
  status: number | null;
}

export class ReceiptVerificationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ReceiptVerificationError';
    this.status = status;
    this.code = code;
  }
}

function ensureString(value: unknown, code: string, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReceiptVerificationError(400, code, message);
  }
  return value.trim();
}

function isProductionRuntime(): boolean {
  return ['production', 'prod'].includes((process.env.NODE_ENV || '').trim().toLowerCase());
}

function productionMainnetConfigRequired(): boolean {
  const chainId = (process.env.CHAIN_ID || '').trim().toLowerCase();
  const mainlineWrites = ['1', 'true', 'yes', 'on'].includes((process.env.CHAIN_MAINLINE_WRITES_ENABLED || '').trim().toLowerCase());
  return isProductionRuntime() || mainlineWrites || chainId === 'ton-mainnet';
}

function readProductionAddress(primaryName: string, testnetName: string): string {
  const primary = process.env[primaryName]?.trim();
  if (primary) {
    return primary;
  }
  if (productionMainnetConfigRequired() && process.env[testnetName]?.trim()) {
    return '';
  }
  return process.env[testnetName]?.trim() || '';
}

class DisabledChainReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'disabled' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    return {
      configured: false,
      status: 'disabled',
      mode: 'disabled',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(): Promise<VerifiedDepositReceipt> {
    throw new ReceiptVerificationError(503, 'RECEIPT_VERIFICATION_DISABLED', 'Chain receipt verification is not enabled');
  }
}

class NotConfiguredChainReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'not_configured' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    return {
      configured: false,
      status: 'not_configured',
      mode: 'not_configured',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(): Promise<VerifiedDepositReceipt> {
    throw new ReceiptVerificationError(
      503,
      'RECEIPT_VERIFIER_NOT_CONFIGURED',
      'No production receipt verifier is configured for this chain yet'
    );
  }
}

class TestChainReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'test' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    const productionBlocked = isProductionRuntime();
    return {
      configured: !productionBlocked,
      status: productionBlocked ? 'not_configured' : 'test',
      mode: 'test',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt> {
    if (isProductionRuntime()) {
      throw new ReceiptVerificationError(503, 'RECEIPT_VERIFIER_NOT_CONFIGURED', 'Test receipt verifier is not allowed in production');
    }
    const config = loadContractIntegrationConfig();
    const txHash = ensureString(input.txHash, 'INVALID_RECEIPT', 'txHash is required');

    const walletAddress = ensureString(input.walletAddress, 'INVALID_RECEIPT', 'walletAddress is required in receipt test mode');
    const contractAddress = ensureString(input.contractAddress, 'INVALID_RECEIPT', 'contractAddress is required in receipt test mode');
    const amountRaw = ensureString(input.amountRaw, 'INVALID_RECEIPT', 'amountRaw is required in receipt test mode');
    const positionId = ensureString(input.positionId, 'INVALID_RECEIPT', 'positionId is required in receipt test mode');
    const finalized = input.finalized === true;

    if (!finalized) {
      throw new ReceiptVerificationError(409, 'RECEIPT_NOT_FINALIZED', 'Deposit receipt is not finalized yet');
    }
    if (config.lockVault.address && contractAddress !== config.lockVault.address) {
      throw new ReceiptVerificationError(409, 'CONTRACT_MISMATCH', 'Receipt does not belong to configured LockVault');
    }
    try {
      if (BigInt(amountRaw) <= BigInt(0)) {
        throw new Error('non-positive');
      }
    } catch {
      throw new ReceiptVerificationError(400, 'INVALID_AMOUNT', 'Receipt amount must be a positive raw token amount');
    }

    return {
      chainId: config.chainId,
      txHash,
      logIndex: input.logIndex ?? 0,
      walletAddress,
      contractAddress,
      amountRaw,
      positionId,
      blockNumber: input.blockNumber ?? null,
      blockTime: input.blockTime ?? null,
      finalized,
    };
  }
}

class TonRpcReceiptVerifier implements ChainReceiptVerifier {
  readonly mode = 'ton_rpc' as const;

  getDiagnostics(): ChainReceiptVerifierDiagnostics {
    const config = loadContractIntegrationConfig();
    return {
      configured: true,
      status: 'ton_rpc',
      mode: 'ton_rpc',
      receiptVerificationEnabled: config.receipt.enabled,
    };
  }

  async verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt> {
    const config = loadContractIntegrationConfig();
    const txHash = ensureString(input.txHash, 'INVALID_RECEIPT', 'txHash is required');
    if (!config.rpcUrl) {
      throw new ReceiptVerificationError(503, 'CHAIN_RPC_NOT_CONFIGURED', 'CHAIN_RPC_URL is required for TON receipt verification');
    }
    if (!config.lockVault.address) {
      throw new ReceiptVerificationError(503, 'LOCK_VAULT_NOT_CONFIGURED', 'LOCK_VAULT_ADDRESS is required for TON receipt verification');
    }
    const vaultJettonWalletAddress = readProductionAddress('LOCK_VAULT_JETTON_WALLET_ADDRESS', 'LOCK_VAULT_JETTON_WALLET_ADDRESS_TESTNET');
    if (!vaultJettonWalletAddress) {
      throw new ReceiptVerificationError(
        503,
        'LOCK_VAULT_JETTON_WALLET_NOT_CONFIGURED',
        'LOCK_VAULT_JETTON_WALLET_ADDRESS is required for TON receipt verification'
      );
    }

    const transactions = await fetchTonTransactions(config.rpcUrl, config.lockVault.address, txHash);
    let match: ReturnType<typeof findDepositTransaction>;
    try {
      match = findDepositTransaction({
        transactions,
        txHash,
        lockVaultAddress: config.lockVault.address,
        vaultJettonWalletAddress,
      });
    } catch (error) {
      if (error instanceof TonMessageParseError) {
        throw new ReceiptVerificationError(409, error.code, error.message);
      }
      throw error;
    }

    if (!match) {
      throw new ReceiptVerificationError(404, 'RECEIPT_NOT_FOUND', 'Deposit transaction was not found on the configured LockVault');
    }
    if (match.deposit.amountRaw === '0') {
      throw new ReceiptVerificationError(400, 'INVALID_AMOUNT', 'Receipt amount must be a positive raw token amount');
    }
    if (input.waveId !== undefined && match.deposit.waveId !== input.waveId) {
      throw new ReceiptVerificationError(409, 'WAVE_MISMATCH', 'Receipt wave does not match requested wave');
    }
    if (input.walletAddress && normalizeTonAddress(input.walletAddress) !== match.deposit.senderAddress) {
      throw new ReceiptVerificationError(409, 'WALLET_MISMATCH', 'Receipt wallet does not match submitted wallet');
    }
    if (input.amountRaw && input.amountRaw !== match.deposit.amountRaw) {
      throw new ReceiptVerificationError(409, 'AMOUNT_MISMATCH', 'Receipt amount does not match submitted amount');
    }
    if (input.positionId && input.positionId !== match.deposit.positionId) {
      throw new ReceiptVerificationError(409, 'POSITION_MISMATCH', 'Receipt position does not match submitted position');
    }

    const position = await fetchLockVaultPosition(config.rpcUrl, config.lockVault.address, match.deposit.positionId);
    if (position.ownerAddress !== match.deposit.senderAddress) {
      throw new ReceiptVerificationError(409, 'POSITION_OWNER_MISMATCH', 'On-chain position owner does not match the receipt wallet');
    }
    if (position.amountRaw !== match.deposit.amountRaw) {
      throw new ReceiptVerificationError(409, 'POSITION_AMOUNT_MISMATCH', 'On-chain position amount does not match the receipt amount');
    }
    if (position.waveId !== match.deposit.waveId) {
      throw new ReceiptVerificationError(409, 'POSITION_WAVE_MISMATCH', 'On-chain position wave does not match the receipt wave');
    }

    return {
      chainId: config.chainId,
      txHash,
      logIndex: 0,
      walletAddress: match.deposit.senderAddress,
      contractAddress: match.message.destination,
      amountRaw: match.deposit.amountRaw,
      positionId: match.deposit.positionId,
      blockNumber: getTonTransactionLt(match.transaction) ? Number(getTonTransactionLt(match.transaction)) : null,
      blockTime: getTonTransactionTime(match.transaction) ? new Date(getTonTransactionTime(match.transaction)! * 1000).toISOString() : null,
      finalized: true,
    };
  }
}

function getRequestedVerifierMode(): string {
  return (process.env.CHAIN_RECEIPT_VERIFIER || '').trim().toLowerCase();
}

export function getChainReceiptVerifier(): ChainReceiptVerifier {
  const config = loadContractIntegrationConfig();
  if (!config.receipt.enabled) {
    return new DisabledChainReceiptVerifier();
  }

  if (getRequestedVerifierMode() === 'test') {
    return isProductionRuntime() ? new NotConfiguredChainReceiptVerifier() : new TestChainReceiptVerifier();
  }

  if (getRequestedVerifierMode() === 'ton_rpc') {
    return new TonRpcReceiptVerifier();
  }

  return new NotConfiguredChainReceiptVerifier();
}

export function getReceiptVerifierDiagnostics(): ChainReceiptVerifierDiagnostics {
  return getChainReceiptVerifier().getDiagnostics();
}

export async function verifyDepositReceipt(input: DepositReceiptInput): Promise<VerifiedDepositReceipt> {
  return getChainReceiptVerifier().verifyDepositReceipt(input);
}

function readToncenterApiKey(): string | undefined {
  return process.env.TONCENTER_API_KEY?.trim() || process.env.TONCENTER_TESTNET_API_KEY?.trim() || undefined;
}

function deriveToncenterV3TransactionsUrl(rpcUrl: string): string | null {
  const explicit = process.env.TON_TRANSACTIONS_API_URL?.trim();
  if (explicit) {
    return explicit;
  }
  try {
    const url = new URL(rpcUrl);
    if (!url.hostname.includes('toncenter.com')) {
      return null;
    }
    return `${url.origin}/api/v3/transactions`;
  } catch {
    return null;
  }
}

async function fetchToncenterV3Transactions(apiUrl: string, address: string): Promise<TonTransactionLike[]> {
  const url = new URL(apiUrl);
  url.searchParams.set('account', address);
  url.searchParams.set('limit', String(Number(process.env.TON_RECEIPT_LOOKBACK_LIMIT || 20)));
  const headers: Record<string, string> = { accept: 'application/json' };
  const apiKey = readToncenterApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', `TON transactions API returned HTTP ${response.status}`);
  }
  const payload: { transactions?: TonTransactionLike[]; error?: string; message?: string } = await response.json();
  if (!Array.isArray(payload.transactions)) {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', payload.error || payload.message || 'TON transactions API returned an invalid response');
  }
  return payload.transactions;
}

async function fetchTonTransactions(rpcUrl: string, address: string, _txHash: string): Promise<TonTransactionLike[]> {
  const v3Url = deriveToncenterV3TransactionsUrl(rpcUrl);
  if (v3Url) {
    return fetchToncenterV3Transactions(v3Url, address);
  }
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `receipt-${Date.now()}`,
      method: 'getTransactions',
      params: {
        address,
        limit: Number(process.env.TON_RECEIPT_LOOKBACK_LIMIT || 20),
      },
    }),
  });
  if (!response.ok) {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', `TON RPC returned HTTP ${response.status}`);
  }
  const payload: { ok?: boolean; result?: TonTransactionLike[]; error?: { message?: string } } = await response.json();
  if (!payload.ok || !Array.isArray(payload.result)) {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', payload.error?.message || 'TON RPC returned an invalid response');
  }
  return payload.result;
}

function normalizeStackInt(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return BigInt(value).toString();
  }
  if (typeof value === 'string') {
    return BigInt(value).toString();
  }
  if (Array.isArray(value) && value.length >= 2) {
    return BigInt(String(value[1])).toString();
  }
  if (value && typeof value === 'object') {
    const record = value as { value?: unknown; num?: unknown };
    if (record.value !== undefined) return normalizeStackInt(record.value);
    if (record.num !== undefined) return normalizeStackInt(record.num);
  }
  throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', 'TON RPC returned an unsupported get-method integer stack item');
}

function normalizeStackAddress(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeTonAddress(value);
  }
  if (Array.isArray(value) && value.length >= 2) {
    const kind = String(value[0]).toLowerCase();
    const raw = value[1];
    if (raw && typeof raw === 'object') {
      return normalizeStackAddress(raw);
    }
    if (kind.includes('slice') || kind.includes('cell')) {
      return normalizeTonAddressFromCell(String(raw));
    }
    return normalizeTonAddress(String(raw));
  }
  if (value && typeof value === 'object') {
    const record = value as { address?: unknown; value?: unknown; cell?: unknown; slice?: unknown; bytes?: unknown };
    if (record.address !== undefined) return normalizeStackAddress(record.address);
    if (record.value !== undefined) return normalizeStackAddress(record.value);
    if (record.cell !== undefined) return normalizeTonAddressFromCell(readStackCellBase64(record.cell));
    if (record.slice !== undefined) return normalizeTonAddressFromCell(readStackCellBase64(record.slice));
    if (record.bytes !== undefined) return normalizeTonAddressFromCell(readStackCellBase64(record.bytes));
  }
  throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', 'TON RPC returned an unsupported get-method address stack item');
}

function readStackCellBase64(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as { b64?: unknown; bytes?: unknown; data?: { b64?: unknown } };
    if (typeof record.b64 === 'string') return record.b64;
    if (typeof record.bytes === 'string') return record.bytes;
    if (typeof record.data?.b64 === 'string') return record.data.b64;
  }
  throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', 'TON RPC returned an unsupported address cell');
}

function normalizeTonAddressFromCell(value: string): string {
  try {
    return normalizeTonAddress(Cell.fromBase64(value).beginParse().loadAddress().toString());
  } catch {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', 'TON RPC returned an invalid address cell');
  }
}

function parseLockVaultPositionPayload(payload: unknown): LockVaultPositionSnapshot {
  const result = (payload && typeof payload === 'object' ? payload as any : {})?.result ?? payload;
  const candidate = result?.position ?? result;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.ownerAddress !== undefined) {
    return {
      ownerAddress: normalizeTonAddress(String(candidate.ownerAddress)),
      amountRaw: BigInt(candidate.amountRaw).toString(),
      waveId: Number(candidate.waveId),
      status: candidate.status === undefined || candidate.status === null ? null : Number(candidate.status),
    };
  }
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && candidate.owner !== undefined) {
    return {
      ownerAddress: normalizeTonAddress(String(candidate.owner)),
      amountRaw: BigInt(candidate.amountRaw ?? candidate.amount).toString(),
      waveId: Number(candidate.waveId),
      status: candidate.status === undefined || candidate.status === null ? null : Number(candidate.status),
    };
  }
  const stack = result?.stack;
  if (Array.isArray(stack) && stack.length >= 5) {
    return {
      ownerAddress: normalizeStackAddress(stack[0]),
      amountRaw: normalizeStackInt(stack[1]),
      waveId: Number(normalizeStackInt(stack[2])),
      status: Number(normalizeStackInt(stack[4])),
    };
  }
  throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', 'TON RPC did not return a readable LockVault position');
}

async function fetchLockVaultPosition(rpcUrl: string, address: string, positionId: string): Promise<LockVaultPositionSnapshot> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `position-${Date.now()}`,
      method: 'runGetMethod',
      params: {
        address,
        method: 'position',
        stack: [['num', `0x${BigInt(positionId).toString(16)}`]],
      },
    }),
  });
  if (!response.ok) {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', `TON RPC returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload?.ok === false) {
    throw new ReceiptVerificationError(503, 'CHAIN_RPC_ERROR', payload.error?.message || 'TON RPC get-method failed');
  }
  return parseLockVaultPositionPayload(payload);
}
