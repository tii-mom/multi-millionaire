import crypto from 'crypto';
import { Address, Cell, contractAddress, loadStateInit } from '@ton/core';
import { signVerify } from '@ton/crypto';
import { normalizeWalletAddress } from '../models/walletBindingModel';

export type WalletSignatureVerifierStatus = 'disabled' | 'test' | 'ton_proof' | 'not_configured';

export interface WalletSignatureInput {
  nonce: string;
  walletAddress: string;
  signature: string;
  signableMessage: string;
}

export interface WalletSignatureVerifierDiagnostics {
  configured: boolean;
  status: WalletSignatureVerifierStatus;
  mode: string;
  walletBindingEnabled: boolean;
}

export class WalletSignatureVerificationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'WalletSignatureVerificationError';
    this.status = status;
    this.code = code;
  }
}

function getRequestedMode(): string {
  return (process.env.WALLET_SIGNATURE_MODE || '').trim().toLowerCase();
}

function walletBindingEnabled(): boolean {
  return process.env.WALLET_BINDING_ENABLED === 'true';
}

function isProductionRuntime(): boolean {
  return ['production', 'prod'].includes((process.env.NODE_ENV || '').trim().toLowerCase());
}

function readTonProofMaxAgeSeconds(): number {
  const configured = Number(process.env.WALLET_TON_PROOF_MAX_AGE_SECONDS || 300);
  return Number.isFinite(configured) && configured > 0 ? configured : 300;
}

export function isPlausibleWalletAddress(walletAddress: string): boolean {
  const normalized = walletAddress.trim();
  if (/^[EU]Q[A-Za-z0-9_-]{46}$/.test(normalized)) {
    return true;
  }
  if (/^(?:-?1|0):[a-fA-F0-9]{64}$/.test(normalized)) {
    return true;
  }
  if (/^wallet-[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    return !isProductionRuntime();
  }
  return false;
}

export function getWalletSignatureVerifierDiagnostics(): WalletSignatureVerifierDiagnostics {
  const requested = getRequestedMode();
  if (!walletBindingEnabled()) {
    return {
      configured: false,
      status: 'disabled',
      mode: requested || 'disabled',
      walletBindingEnabled: false,
    };
  }
  if (requested === 'test') {
    return {
      configured: !isProductionRuntime(),
      status: isProductionRuntime() ? 'not_configured' : 'test',
      mode: 'test',
      walletBindingEnabled: true,
    };
  }
  if (requested === 'ton_proof') {
    return {
      configured: Boolean(process.env.WALLET_BINDING_MESSAGE_DOMAIN),
      status: process.env.WALLET_BINDING_MESSAGE_DOMAIN ? 'ton_proof' : 'not_configured',
      mode: 'ton_proof',
      walletBindingEnabled: true,
    };
  }
  return {
    configured: false,
    status: 'not_configured',
    mode: requested || 'disabled',
    walletBindingEnabled: true,
  };
}

interface TonProofPayload {
  publicKey?: string;
  public_key?: string;
  walletStateInit?: string;
  wallet_state_init?: string;
  stateInit?: string;
  account?: {
    address?: string;
    chain?: string | number;
    network?: string | number;
    publicKey?: string;
    public_key?: string;
    walletStateInit?: string;
    wallet_state_init?: string;
    stateInit?: string;
  };
  proof?: {
    timestamp?: number | string;
    domain?: {
      lengthBytes?: number;
      value?: string;
    };
    signature?: string;
    payload?: string;
  };
}

function parseTonProof(signature: string): TonProofPayload {
  try {
    const parsed = JSON.parse(signature) as TonProofPayload;
    if (!parsed || typeof parsed !== 'object' || !parsed.proof || typeof parsed.proof !== 'object') {
      throw new Error('missing proof');
    }
    return parsed;
  } catch {
    throw new WalletSignatureVerificationError(400, 'INVALID_TON_PROOF', 'TON proof signature payload must be valid JSON');
  }
}

function parsePublicKey(input: TonProofPayload): Buffer {
  const value = input.publicKey || input.public_key || input.account?.publicKey || input.account?.public_key;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new WalletSignatureVerificationError(400, 'INVALID_TON_PROOF', 'TON proof public key is missing or invalid');
  }
  return Buffer.from(value, 'hex');
}

function readWalletStateInit(input: TonProofPayload): string {
  return input.walletStateInit
    || input.wallet_state_init
    || input.stateInit
    || input.account?.walletStateInit
    || input.account?.wallet_state_init
    || input.account?.stateInit
    || '';
}

function parseTimestamp(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(parsed) || (parsed as number) <= 0) {
    throw new WalletSignatureVerificationError(400, 'INVALID_TON_PROOF', 'TON proof timestamp is invalid');
  }
  return parsed as number;
}

function cellContainsBuffer(cell: Cell | null | undefined, needle: Buffer, depth = 0): boolean {
  if (!cell || depth > 8) {
    return false;
  }
  if (cell.toBoc().includes(needle)) {
    return true;
  }
  return cell.refs.some((ref) => cellContainsBuffer(ref, needle, depth + 1));
}

function verifyTonProof(input: WalletSignatureInput): void {
  const proofPayload = parseTonProof(input.signature);
  const proof = proofPayload.proof!;
  const expectedDomain = (process.env.WALLET_BINDING_MESSAGE_DOMAIN || '').trim();
  const domainValue = typeof proof.domain?.value === 'string' ? proof.domain.value : '';
  const domainLength = proof.domain?.lengthBytes;
  const domainBytes = Buffer.from(domainValue, 'utf8');
  if (!expectedDomain || domainValue !== expectedDomain || domainLength !== domainBytes.length) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_DOMAIN_MISMATCH', 'TON proof domain is invalid');
  }
  if (proof.payload !== input.nonce) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_PAYLOAD_MISMATCH', 'TON proof payload does not match the bind nonce');
  }

  const timestamp = parseTimestamp(proof.timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (timestamp > now + 60 || now - timestamp > readTonProofMaxAgeSeconds()) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_EXPIRED', 'TON proof timestamp is outside the allowed window');
  }
  if (typeof proof.signature !== 'string' || !proof.signature) {
    throw new WalletSignatureVerificationError(400, 'INVALID_TON_PROOF', 'TON proof signature is missing');
  }

  let address: Address;
  try {
    address = Address.parse(input.walletAddress);
  } catch {
    throw new WalletSignatureVerificationError(400, 'INVALID_WALLET_ADDRESS', 'walletAddress is not a valid TON address');
  }

  const publicKey = parsePublicKey(proofPayload);
  verifyTonProofWalletOwnership({
    proofPayload,
    walletAddress: address,
    publicKey,
  });

  const wc = Buffer.alloc(4);
  wc.writeInt32BE(address.workChain, 0);
  const dl = Buffer.alloc(4);
  dl.writeUInt32LE(domainBytes.length, 0);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64LE(BigInt(timestamp), 0);
  const message = Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    wc,
    address.hash,
    dl,
    domainBytes,
    ts,
    Buffer.from(proof.payload, 'utf8'),
  ]);
  const messageHash = crypto.createHash('sha256').update(message).digest();
  const fullMessage = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect', 'utf8'),
    messageHash,
  ]);
  const signedHash = crypto.createHash('sha256').update(fullMessage).digest();
  const signature = Buffer.from(proof.signature, 'base64');
  if (signature.length !== 64 || !signVerify(signedHash, signature, publicKey)) {
    throw new WalletSignatureVerificationError(401, 'INVALID_WALLET_SIGNATURE', 'TON proof signature is invalid');
  }
}

function verifyTonProofWalletOwnership(input: {
  proofPayload: TonProofPayload;
  walletAddress: Address;
  publicKey: Buffer;
}): void {
  const accountAddress = input.proofPayload.account?.address;
  if (accountAddress && normalizeWalletAddress(accountAddress) !== input.walletAddress.toRawString().toLowerCase()) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_ACCOUNT_MISMATCH', 'TON proof account address does not match walletAddress');
  }

  const accountPublicKey = input.proofPayload.account?.publicKey || input.proofPayload.account?.public_key;
  if (accountPublicKey && accountPublicKey.toLowerCase() !== input.publicKey.toString('hex')) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_PUBLIC_KEY_MISMATCH', 'TON proof public key does not match account public key');
  }

  const stateInitBoc = readWalletStateInit(input.proofPayload);
  if (!stateInitBoc) {
    throw new WalletSignatureVerificationError(400, 'TON_PROOF_STATE_INIT_REQUIRED', 'TON proof wallet stateInit is required');
  }

  let stateInitCell: Cell;
  try {
    stateInitCell = Cell.fromBase64(stateInitBoc);
  } catch {
    throw new WalletSignatureVerificationError(400, 'INVALID_TON_PROOF', 'TON proof wallet stateInit is not a valid BOC');
  }

  let stateInit;
  try {
    stateInit = loadStateInit(stateInitCell.beginParse());
  } catch {
    throw new WalletSignatureVerificationError(400, 'INVALID_TON_PROOF', 'TON proof wallet stateInit cannot be parsed');
  }

  const derivedAddress = contractAddress(input.walletAddress.workChain, stateInit).toRawString().toLowerCase();
  if (derivedAddress !== input.walletAddress.toRawString().toLowerCase()) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_STATE_INIT_MISMATCH', 'TON proof stateInit does not derive walletAddress');
  }

  if (!cellContainsBuffer(stateInit.data, input.publicKey)) {
    throw new WalletSignatureVerificationError(401, 'TON_PROOF_PUBLIC_KEY_MISMATCH', 'TON proof public key is not present in wallet stateInit data');
  }
}

export function verifyWalletSignature(input: WalletSignatureInput): void {
  const diagnostics = getWalletSignatureVerifierDiagnostics();
  if (diagnostics.status === 'disabled') {
    throw new WalletSignatureVerificationError(503, 'WALLET_BINDING_DISABLED', 'Wallet binding is not enabled');
  }
  if (diagnostics.mode === 'test' && diagnostics.status === 'not_configured') {
    throw new WalletSignatureVerificationError(503, 'SIGNATURE_VERIFIER_NOT_CONFIGURED', 'Test wallet signature mode is not allowed in production');
  }
  if (diagnostics.status === 'ton_proof') {
    verifyTonProof(input);
    return;
  }
  if (diagnostics.status !== 'test') {
    throw new WalletSignatureVerificationError(503, 'SIGNATURE_VERIFIER_NOT_CONFIGURED', 'Production wallet signature verifier is not configured');
  }

  const expected = `test:${input.nonce}:${normalizeWalletAddress(input.walletAddress)}`;
  if (input.signature !== expected) {
    throw new WalletSignatureVerificationError(401, 'INVALID_WALLET_SIGNATURE', 'Wallet signature is invalid');
  }
}
