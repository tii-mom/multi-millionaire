import { Address, beginCell, Cell, Slice } from '@ton/core';

export const JETTON_TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c;
export const LOCK_VAULT_DEPOSIT_OPCODE = JETTON_TRANSFER_NOTIFICATION_OPCODE;
export const MERKLE_CLAIM_OPCODE = 0x434c414d;
export const JETTON_EXCESSES_OPCODE = 0xd53276db;
export const DEPOSIT_GOAL_TARGETS_USD9 = [
  '10000000000000',
  '100000000000000',
  '500000000000000',
  '1000000000000000',
  '5000000000000000',
  '10000000000000000',
] as const;

export interface ParsedLockVaultDeposit {
  opcode: number;
  queryId: string;
  seasonId: number | null;
  waveId: number;
  targetUsd9: string | null;
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

export interface ParsedJettonExcesses {
  opcode: number;
  queryId: string;
}

export interface TonTransactionMessage {
  source: string;
  destination: string;
  body?: string;
  msg_data?: {
    body?: string;
  };
  message_content?: {
    body?: string;
  };
}

export interface TonTransactionLike {
  transaction_id?: {
    lt?: string;
    hash?: string;
  };
  hash?: string;
  lt?: string;
  utime?: number;
  now?: number;
  in_msg?: TonTransactionMessage;
  out_msgs?: TonTransactionMessage[];
  out_msgs_count?: number;
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

export function getTonMessageBody(message: TonTransactionMessage): string | null {
  return message.body || message.msg_data?.body || message.message_content?.body || null;
}

export function getTonTransactionHash(transaction: TonTransactionLike): string | null {
  return transaction.transaction_id?.hash || transaction.hash || null;
}

export function getTonTransactionLt(transaction: TonTransactionLike): string | null {
  return transaction.transaction_id?.lt || transaction.lt || null;
}

export function getTonTransactionTime(transaction: TonTransactionLike): number | null {
  return transaction.utime || transaction.now || null;
}

function loadDepositForwardPayload(slice: Slice): Slice {
  if (slice.remainingBits === 32) {
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

export function isSupportedDepositGoalTargetUsd9(value: string | bigint): boolean {
  const normalized = BigInt(value).toString();
  return (DEPOSIT_GOAL_TARGETS_USD9 as readonly string[]).includes(normalized);
}

function assertTransactionSucceeded(transaction: TonTransactionLike): void {
  const description = transaction.description;
  if (!description) {
    throw new TonMessageParseError('TON_TX_NOT_FINALIZED', 'TON transaction is missing execution description');
  }
  if (description.aborted === true) {
    throw new TonMessageParseError('TON_TX_FAILED', 'TON transaction was aborted');
  }
  if (description.compute_ph?.success !== true) {
    throw new TonMessageParseError('TON_TX_FAILED', 'TON transaction compute phase did not succeed');
  }
  if (description.action?.success !== true) {
    throw new TonMessageParseError('TON_TX_FAILED', 'TON transaction action phase did not succeed');
  }
}

export function deriveLockVaultPositionId(input: { senderAddress: string; queryId: string | bigint }): string {
  const queryId = typeof input.queryId === 'bigint' ? input.queryId : BigInt(input.queryId);
  return BigInt(`0x${beginCell()
    .storeAddress(Address.parse(input.senderAddress))
    .storeUint(queryId, 64)
    .endCell()
    .hash()
    .toString('hex')}`).toString();
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
  let seasonId: number | null = null;
  let targetUsd9: string | null = null;
  let waveId: number;
  if (forwardPayload.remainingBits >= 168) {
    seasonId = Number(forwardPayload.loadUint(8));
    waveId = Number(forwardPayload.loadUint(32));
    targetUsd9 = forwardPayload.loadUintBig(128).toString();
    if (!isSupportedDepositGoalTargetUsd9(targetUsd9)) {
      throw new TonMessageParseError('UNSUPPORTED_DEPOSIT_TARGET', 'Deposit goal target is not one of the supported USD9 tiers');
    }
  } else {
    waveId = Number(forwardPayload.loadUint(32));
  }

  return {
    opcode,
    queryId,
    seasonId,
    waveId,
    targetUsd9,
    amountRaw,
    positionId: deriveLockVaultPositionId({ senderAddress, queryId }),
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

export function parseJettonExcessesBody(bodyBase64: string): ParsedJettonExcesses {
  const slice = readBodyCell(bodyBase64).beginParse();
  const opcode = slice.loadUint(32);
  if (opcode !== JETTON_EXCESSES_OPCODE) {
    throw new TonMessageParseError('UNEXPECTED_TON_OPCODE', 'Message body is not a JettonExcesses message');
  }
  return {
    opcode,
    queryId: slice.loadUintBig(64).toString(),
  };
}

export function findDepositTransaction(input: {
  transactions: TonTransactionLike[];
  txHash: string;
  lockVaultAddress: string;
  vaultJettonWalletAddress?: string;
}): { transaction: TonTransactionLike; message: TonTransactionMessage; deposit: ParsedLockVaultDeposit } | null {
  const expectedDestination = normalizeTonAddress(input.lockVaultAddress);
  const expectedSource = input.vaultJettonWalletAddress ? normalizeTonAddress(input.vaultJettonWalletAddress) : null;
  for (const transaction of input.transactions) {
    const hash = getTonTransactionHash(transaction);
    const message = transaction.in_msg;
    if (!hash || hash !== input.txHash || !message || !message.destination || !message.source) {
      continue;
    }
    const body = getTonMessageBody(message);
    if (!body) {
      continue;
    }
    if (normalizeTonAddress(message.destination) !== expectedDestination) {
      continue;
    }
    if (expectedSource && normalizeTonAddress(message.source) !== expectedSource) {
      throw new TonMessageParseError('JETTON_WALLET_MISMATCH', 'Deposit notification source is not the configured LockVault Jetton wallet');
    }
    assertTransactionSucceeded(transaction);
    const deposit = parseLockVaultDepositBody(body);
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
    const hash = getTonTransactionHash(transaction);
    const message = transaction.in_msg;
    if (!hash || hash !== input.txHash || !message || !message.destination) {
      continue;
    }
    const body = getTonMessageBody(message);
    if (!body) {
      continue;
    }
    if (normalizeTonAddress(message.destination) !== expectedDestination) {
      continue;
    }
    assertTransactionSucceeded(transaction);
    const claim = parseMerkleClaimBody(body);
    return { transaction, message, claim };
  }
  return null;
}

export function findJettonExcessesTransaction(input: {
  transactions: TonTransactionLike[];
  queryId: string;
  merkleClaimAddress: string;
  rewardJettonWalletAddress: string;
}): { transaction: TonTransactionLike; message: TonTransactionMessage; excesses: ParsedJettonExcesses } | null {
  const expectedDestination = normalizeTonAddress(input.merkleClaimAddress);
  const expectedSource = normalizeTonAddress(input.rewardJettonWalletAddress);
  for (const transaction of input.transactions) {
    const message = transaction.in_msg;
    if (!message?.destination || !message.source) {
      continue;
    }
    if (normalizeTonAddress(message.destination) !== expectedDestination) {
      continue;
    }
    if (normalizeTonAddress(message.source) !== expectedSource) {
      continue;
    }
    const body = getTonMessageBody(message);
    if (!body) {
      continue;
    }
    assertTransactionSucceeded(transaction);
    const excesses = parseJettonExcessesBody(body);
    if (excesses.queryId !== input.queryId) {
      continue;
    }
    return { transaction, message, excesses };
  }
  return null;
}
