import { Address, Cell, Slice } from '@ton/core';

export const JETTON_TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c;
export const LOCK_VAULT_DEPOSIT_OPCODE = JETTON_TRANSFER_NOTIFICATION_OPCODE;
export const MERKLE_CLAIM_OPCODE = 0x434c414d;

export interface ParsedLockVaultDeposit {
  opcode: number;
  queryId: string;
  waveId: number;
  amountRaw: string;
  positionId: string;
  senderAddress: string;
}

export interface ParsedMerkleClaim {
  opcode: number;
  queryId: string;
  batchId: string;
  ledgerIdHash: string;
  recipient: string;
  amountRaw: string;
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
  description?: {
    aborted?: boolean;
    compute_ph?: {
      success?: boolean;
      exit_code?: number;
    };
    action?: {
      success?: boolean;
      result_code?: number;
    };
  };
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

function addressToComparableString(address: Address): string {
  return address.toRawString().toLowerCase();
}

function loadDepositForwardPayload(slice: Slice): Slice {
  if (slice.remainingBits === 96) {
    return slice;
  }
  if (slice.remainingBits >= 1) {
    const payloadInRef = slice.loadBit();
    if (payloadInRef) {
      if (slice.remainingRefs < 1) {
        throw new TonMessageParseError('INVALID_TON_BODY', 'Jetton deposit notification is missing forward payload ref');
      }
      return slice.loadRef().beginParse();
    }
    return slice;
  }
  if (slice.remainingRefs > 0) {
    return slice.loadRef().beginParse();
  }
  throw new TonMessageParseError('INVALID_TON_BODY', 'Jetton deposit notification is missing forward payload metadata');
}

function transactionSucceeded(transaction: TonTransactionLike): boolean {
  const description = transaction.description;
  if (!description) {
    return true;
  }
  if (description.aborted === true) {
    return false;
  }
  if (description.compute_ph?.success === false) {
    return false;
  }
  if (description.action?.success === false) {
    return false;
  }
  return true;
}

export function parseLockVaultDepositBody(bodyBase64: string): ParsedLockVaultDeposit {
  const slice = readBodyCell(bodyBase64).beginParse();
  const opcode = slice.loadUint(32);
  if (opcode !== JETTON_TRANSFER_NOTIFICATION_OPCODE) {
    throw new TonMessageParseError('UNEXPECTED_TON_OPCODE', 'Message body is not a Jetton transfer_notification message');
  }
  const queryId = slice.loadUintBig(64).toString();
  const amountRaw = slice.loadCoins().toString();
  const senderAddress = addressToComparableString(slice.loadAddress());
  const forwardPayload = loadDepositForwardPayload(slice);

  return {
    opcode,
    queryId,
    waveId: Number(forwardPayload.loadUint(32)),
    amountRaw,
    positionId: forwardPayload.loadUintBig(64).toString(),
    senderAddress,
  };
}

export function parseMerkleClaimBody(bodyBase64: string): ParsedMerkleClaim {
  const slice = readBodyCell(bodyBase64).beginParse();
  const opcode = slice.loadUint(32);
  if (opcode !== MERKLE_CLAIM_OPCODE) {
    throw new TonMessageParseError('UNEXPECTED_TON_OPCODE', 'Message body is not a Merkle ClaimReward message');
  }
  const queryId = slice.loadUintBig(64).toString();
  const batchId = slice.loadUintBig(64).toString();
  const ledgerIdHash = slice.loadUintBig(256).toString();
  const recipient = addressToComparableString(slice.loadAddress());
  const amountRaw = slice.loadCoins().toString();
  if (slice.remainingBits === 0 && slice.remainingRefs === 0) {
    throw new TonMessageParseError('INVALID_TON_BODY', 'Merkle ClaimReward message is missing proof payload');
  }

  return {
    opcode,
    queryId,
    batchId,
    ledgerIdHash,
    recipient,
    amountRaw,
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
    if (!transactionSucceeded(transaction)) {
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
    if (!transactionSucceeded(transaction)) {
      continue;
    }
    const claim = parseMerkleClaimBody(message.body);
    return { transaction, message, claim };
  }
  return null;
}
