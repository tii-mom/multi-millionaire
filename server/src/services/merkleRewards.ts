import crypto from 'crypto';
import { Address, beginCell, Cell } from '@ton/core';
import { withTransaction } from '../db';
import { loadContractIntegrationConfig } from './contracts/config';
import { findMerkleClaimTransaction, normalizeTonAddress, TonMessageParseError, TonTransactionLike } from './tonMessages';
import {
  createMerkleRewardBatch,
  createMerkleRewardProof,
  EligibleRewardForMerkle,
  listEligibleRewardsForMerkle,
} from '../models/merkleRewardModel';

export interface MerkleLeafInput {
  ledgerId: string;
  beneficiaryUserId: string;
  beneficiaryWallet: string;
  amountRaw: string;
}

export interface MerkleLeaf extends MerkleLeafInput {
  ledgerIdHash: string;
  leafHash: string;
}

export interface MerkleTreeOptions {
  batchId?: string;
}

export interface MerkleTreeBuild {
  root: string;
  leaves: Array<MerkleLeaf & { proof: string[] }>;
}

export class MerkleClaimVerificationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface MerkleClaimVerifierDiagnostics {
  configured: boolean;
  status: 'not_configured' | 'ton_rpc';
  model: string;
}

export interface MerkleClaimReceiptInput {
  txHash: string;
  beneficiaryWallet: string;
  amountRaw: string;
  leafHash?: string;
  ledgerIdHash?: string;
  batchId?: string;
}

export interface VerifiedMerkleClaimReceipt {
  txHash: string;
  logIndex: number;
  contractAddress: string;
  beneficiaryWallet: string;
  recipient: string;
  amountRaw: string;
  ledgerIdHash: string;
  batchId: string;
  blockNumber: number | null;
  blockTime: string | null;
  finalized: boolean;
}

function sha256(value: string): string {
  return `0x${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function cellHashHex(cell: Cell): string {
  return `0x${cell.hash().toString('hex')}`;
}

function normalizeUint64(value: string): bigint {
  const parsed = BigInt(value);
  const maxUint64 = (BigInt(1) << BigInt(64)) - BigInt(1);
  if (parsed < BigInt(0) || parsed > maxUint64) {
    throw new Error('Merkle batch contract id must fit uint64');
  }
  return parsed;
}

function normalizeUint256Hex(value: string): bigint {
  return BigInt(value);
}

export function hashLedgerId(ledgerId: string): string {
  return sha256(ledgerId);
}

function hashPair(left: string, right: string): string {
  return cellHashHex(beginCell()
    .storeUint(normalizeUint256Hex(left), 256)
    .storeUint(normalizeUint256Hex(right), 256)
    .endCell());
}

export function buildMerkleLeaf(input: MerkleLeafInput, options: MerkleTreeOptions = {}): MerkleLeaf {
  const batchId = normalizeUint64(options.batchId || '1');
  const ledgerIdHash = hashLedgerId(input.ledgerId);
  return {
    ...input,
    ledgerIdHash,
    leafHash: cellHashHex(beginCell()
      .storeUint(batchId, 64)
      .storeUint(normalizeUint256Hex(ledgerIdHash), 256)
      .storeAddress(Address.parse(input.beneficiaryWallet))
      .storeCoins(BigInt(input.amountRaw))
      .endCell()),
  };
}

export function buildMerkleTree(inputs: MerkleLeafInput[], options: MerkleTreeOptions = {}): MerkleTreeBuild {
  const leaves = inputs.map((input) => buildMerkleLeaf(input, options));
  if (leaves.length === 0) {
    return { root: cellHashHex(beginCell().endCell()), leaves: [] };
  }

  const proofs = new Map<string, string[]>();
  let level = leaves.map((leaf, index) => ({ hash: leaf.leafHash, indexes: [index] }));
  for (const leaf of level) {
    proofs.set(String(leaf.indexes[0]), []);
  }

  while (level.length > 1) {
    const next: Array<{ hash: string; indexes: number[] }> = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      for (const index of left.indexes) {
        proofs.get(String(index))?.push(`right:${right.hash}`);
      }
      for (const index of right.indexes) {
        if (right !== left) {
          proofs.get(String(index))?.push(`left:${left.hash}`);
        }
      }
      next.push({ hash: hashPair(left.hash, right.hash), indexes: [...left.indexes, ...right.indexes] });
    }
    level = next;
  }

  return {
    root: level[0].hash,
    leaves: leaves.map((leaf, index) => ({ ...leaf, proof: proofs.get(String(index)) || [] })),
  };
}

export function encodeMerkleProofCell(proof: string[]): string {
  let builder = beginCell().storeUint(proof.length, 8);
  for (const item of proof) {
    const [side, hash] = item.split(':');
    if ((side !== 'left' && side !== 'right') || !hash) {
      throw new Error(`Invalid Merkle proof item: ${item}`);
    }
    builder = builder
      .storeBit(side === 'right')
      .storeUint(normalizeUint256Hex(hash), 256);
  }
  return builder.endCell().toBoc().toString('base64');
}

export async function createDraftMerkleRewardBatch(input: {
  chainId: string;
  tokenAddress: string;
  createdBy?: string | null;
}) {
  const eligible = await listEligibleRewardsForMerkle();
  const contractBatchId = String(Date.now());
  const tree = buildMerkleTree(eligible.map((reward: EligibleRewardForMerkle) => ({
    ledgerId: reward.ledger_id,
    beneficiaryUserId: reward.beneficiary_user_id,
    beneficiaryWallet: reward.beneficiary_wallet,
    amountRaw: reward.amount_raw,
  })), { batchId: contractBatchId });
  const totalAmountRaw = eligible.reduce((sum, item) => sum + BigInt(item.amount_raw), BigInt(0)).toString();

  return withTransaction(async (tx) => {
    const batch = await createMerkleRewardBatch({
      chainId: input.chainId,
      tokenAddress: input.tokenAddress,
      merkleRoot: tree.root,
      totalAmountRaw,
      status: 'draft',
      metadata: { reward_count: eligible.length, contract_batch_id: contractBatchId, merkle_hash: 'ton-cell-v1' },
      createdBy: input.createdBy || null,
    }, tx);

    const proofs = [];
    for (const leaf of tree.leaves) {
      proofs.push(await createMerkleRewardProof({
        batchId: batch.id,
        rewardLedgerId: leaf.ledgerId,
        beneficiaryUserId: leaf.beneficiaryUserId,
        beneficiaryWallet: leaf.beneficiaryWallet,
        amountRaw: leaf.amountRaw,
        leafHash: leaf.leafHash,
        proof: leaf.proof,
      }, tx));
    }

    return { batch, proofs };
  });
}

export async function verifyMerkleClaimReceipt(input: MerkleClaimReceiptInput): Promise<VerifiedMerkleClaimReceipt> {
  const mode = (process.env.MERKLE_CLAIM_VERIFIER || process.env.CHAIN_RECEIPT_VERIFIER || '').trim().toLowerCase();
  if (mode !== 'ton_rpc') {
    throw new MerkleClaimVerificationError(
      503,
      'MERKLE_CLAIM_VERIFIER_NOT_CONFIGURED',
      'Merkle claim receipt verification requires production chain RPC, ABI, and claim event schema'
    );
  }

  const config = loadContractIntegrationConfig();
  const merkleClaimAddress = process.env.MERKLE_CLAIM_ADDRESS || process.env.MERKLE_CLAIM_ADDRESS_TESTNET || '';
  if (!config.rpcUrl) {
    throw new MerkleClaimVerificationError(503, 'CHAIN_RPC_NOT_CONFIGURED', 'CHAIN_RPC_URL is required for Merkle claim verification');
  }
  if (!merkleClaimAddress) {
    throw new MerkleClaimVerificationError(503, 'MERKLE_CLAIM_CONTRACT_NOT_CONFIGURED', 'MERKLE_CLAIM_ADDRESS is required for Merkle claim verification');
  }

  const transactions = await fetchTonTransactions(config.rpcUrl, merkleClaimAddress, input.txHash);
  let match: ReturnType<typeof findMerkleClaimTransaction>;
  try {
    match = findMerkleClaimTransaction({
      transactions,
      txHash: input.txHash,
      merkleClaimAddress,
    });
  } catch (error) {
    if (error instanceof TonMessageParseError) {
      throw new MerkleClaimVerificationError(409, error.code, error.message);
    }
    throw error;
  }
  if (!match) {
    throw new MerkleClaimVerificationError(404, 'CLAIM_RECEIPT_NOT_FOUND', 'Claim transaction was not found on the configured MerkleClaim contract');
  }
  if (normalizeTonAddress(match.message.source) !== normalizeTonAddress(input.beneficiaryWallet)) {
    throw new MerkleClaimVerificationError(409, 'BENEFICIARY_MISMATCH', 'Claim receipt sender does not match the Merkle proof beneficiary wallet');
  }
  if (match.claim.recipient !== normalizeTonAddress(input.beneficiaryWallet)) {
    throw new MerkleClaimVerificationError(409, 'RECIPIENT_MISMATCH', 'Claim receipt recipient does not match the Merkle proof beneficiary wallet');
  }
  if (input.batchId && match.claim.batchId !== input.batchId) {
    throw new MerkleClaimVerificationError(409, 'BATCH_MISMATCH', 'Claim receipt batch does not match the Merkle proof batch');
  }
  if (input.ledgerIdHash && match.claim.ledgerIdHash !== normalizeUint256(input.ledgerIdHash)) {
    throw new MerkleClaimVerificationError(409, 'LEDGER_MISMATCH', 'Claim receipt ledger does not match the Merkle proof ledger');
  }
  if (match.claim.amountRaw !== input.amountRaw) {
    throw new MerkleClaimVerificationError(409, 'AMOUNT_MISMATCH', 'Claim receipt amount does not match the Merkle proof');
  }

  return {
    txHash: input.txHash,
    logIndex: 0,
    contractAddress: match.message.destination,
    beneficiaryWallet: normalizeTonAddress(match.message.source),
    recipient: match.claim.recipient,
    amountRaw: match.claim.amountRaw,
    ledgerIdHash: match.claim.ledgerIdHash,
    batchId: match.claim.batchId,
    blockNumber: match.transaction.transaction_id?.lt ? Number(match.transaction.transaction_id.lt) : null,
    blockTime: match.transaction.utime ? new Date(match.transaction.utime * 1000).toISOString() : null,
    finalized: true,
  };
}

export function getMerkleClaimVerifierDiagnostics(): MerkleClaimVerifierDiagnostics {
  const mode = (process.env.MERKLE_CLAIM_VERIFIER || process.env.CHAIN_RECEIPT_VERIFIER || '').trim().toLowerCase();
  return {
    configured: mode === 'ton_rpc',
    status: mode === 'ton_rpc' ? 'ton_rpc' : 'not_configured',
    model: process.env.REWARD_CLAIM_MODEL || 'legacy_stub',
  };
}

function normalizeUint256(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('0x')) {
    return BigInt(trimmed).toString();
  }
  return BigInt(trimmed).toString();
}

async function fetchTonTransactions(rpcUrl: string, address: string, _txHash: string): Promise<TonTransactionLike[]> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `claim-${Date.now()}`,
      method: 'getTransactions',
      params: {
        address,
        limit: Number(process.env.TON_RECEIPT_LOOKBACK_LIMIT || 20),
      },
    }),
  });
  if (!response.ok) {
    throw new MerkleClaimVerificationError(503, 'CHAIN_RPC_ERROR', `TON RPC returned HTTP ${response.status}`);
  }
  const payload: { ok?: boolean; result?: TonTransactionLike[]; error?: { message?: string } } = await response.json();
  if (!payload.ok || !Array.isArray(payload.result)) {
    throw new MerkleClaimVerificationError(503, 'CHAIN_RPC_ERROR', payload.error?.message || 'TON RPC returned an invalid response');
  }
  return payload.result;
}
