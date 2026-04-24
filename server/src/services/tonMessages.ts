import { Address, Cell } from '@ton/core';

export const LOCK_VAULT_DEPOSIT_OPCODE = 0x4c4f434b;
export const MERKLE_CLAIM_OPCODE = 0x434c414d;

export interface ParsedLockVaultDeposit {
  opcode: number;
  queryId: string;
  waveId: number;
  amountRaw: string;
  positionId: string;
}

export interface ParsedMerkleClaim {
  opcode: number;
  queryId: string;
  batchId: string;
  ledgerIdHash: string;
  amountRaw: string;
  leafHash: string;
}

export interface TonTransactionMessage {
  source: string;
  destination: string;
  body: string;
}

export interface TonTransactionLike {
  transaction_id?: {
    lt?: string;
    hash?: string;
  };
  utime?: number;
  in_msg?: TonTransactionMessage;
}

export class TonMessageParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TonMessageParseError';
    this.code = code;
  }
}

function readBodyCell(bodyBase64: string): Cell {
  try {
    return Cell.fromBase64(bodyBase64);
  } catch {
    throw new TonMessageParseError('INVALID_TON_BODY', 'Message body is not a valid base64 BOC');
  }
}

export function normalizeTonAddress(value: string): string {
  return Address.parse(value).toRawString().toLowerCase();
}

export function parseLockVaultDepositBody(bodyBase64: string): ParsedLockVaultDeposit {
  const slice = readBodyCell(bodyBase64).beginParse();
  const opcode = slice.loadUint(32);
  if (opcode !== LOCK_VAULT_DEPOSIT_OPCODE) {
    throw new TonMessageParseError('UNEXPECTED_TON_OPCODE', 'Message body is not a LockVault Deposit message');
  }
  return {
    opcode,
    queryId: slice.loadUintBig(64).toString(),
    waveId: Number(slice.loadUint(32)),
    amountRaw: slice.loadUintBig(128).toString(),
    positionId: slice.loadUintBig(64).toString(),
  };
}

export function parseMerkleClaimBody(bodyBase64: string): ParsedMerkleClaim {
  const slice = readBodyCell(bodyBase64).beginParse();
  const opcode = slice.loadUint(32);
  if (opcode !== MERKLE_CLAIM_OPCODE) {
    throw new TonMessageParseError('UNEXPECTED_TON_OPCODE', 'Message body is not a Merkle ClaimReward message');
  }
  return {
    opcode,
    queryId: slice.loadUintBig(64).toString(),
    batchId: slice.loadUintBig(64).toString(),
    ledgerIdHash: slice.loadUintBig(256).toString(),
    amountRaw: slice.loadUintBig(128).toString(),
    leafHash: slice.loadUintBig(256).toString(),
  };
}

export function findDepositTransaction(input: {
  transactions: TonTransactionLike[];
  txHash: string;
  lockVaultAddress: string;
}): { transaction: TonTransactionLike; message: TonTransactionMessage; deposit: ParsedLockVaultDeposit } | null {
  const expectedDestination = normalizeTonAddress(input.lockVaultAddress);
  for (const transaction of input.transactions) {
    const hash = transaction.transaction_id?.hash;
    const message = transaction.in_msg;
    if (!hash || hash !== input.txHash || !message?.body || !message.destination) {
      continue;
    }
    if (normalizeTonAddress(message.destination) !== expectedDestination) {
      continue;
    }
    const deposit = parseLockVaultDepositBody(message.body);
    return { transaction, message, deposit };
  }
  return null;
}

export function findMerkleClaimTransaction(input: {
  transactions: TonTransactionLike[];
  txHash: string;
  merkleClaimAddress: string;
}): { transaction: TonTransactionLike; message: TonTransactionMessage; claim: ParsedMerkleClaim } | null {
  const expectedDestination = normalizeTonAddress(input.merkleClaimAddress);
  for (const transaction of input.transactions) {
    const hash = transaction.transaction_id?.hash;
    const message = transaction.in_msg;
    if (!hash || hash !== input.txHash || !message?.body || !message.destination) {
      continue;
    }
    if (normalizeTonAddress(message.destination) !== expectedDestination) {
      continue;
    }
    const claim = parseMerkleClaimBody(message.body);
    return { transaction, message, claim };
  }
  return null;
}
