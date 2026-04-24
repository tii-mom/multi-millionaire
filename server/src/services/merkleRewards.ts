import crypto from 'crypto';
import { withTransaction } from '../db';
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
  leafHash: string;
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
  status: 'not_configured';
  model: string;
}

function sha256(value: string): string {
  return `0x${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function hashPair(left: string, right: string): string {
  return sha256([left, right].sort().join(''));
}

export function buildMerkleLeaf(input: MerkleLeafInput): MerkleLeaf {
  return {
    ...input,
    leafHash: sha256([
      input.ledgerId,
      input.beneficiaryUserId,
      input.beneficiaryWallet.toLowerCase(),
      input.amountRaw,
    ].join(':')),
  };
}

export function buildMerkleTree(inputs: MerkleLeafInput[]): MerkleTreeBuild {
  const leaves = inputs.map(buildMerkleLeaf);
  if (leaves.length === 0) {
    return { root: sha256('empty'), leaves: [] };
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
        proofs.get(String(index))?.push(right.hash);
      }
      for (const index of right.indexes) {
        if (right !== left) {
          proofs.get(String(index))?.push(left.hash);
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

export async function createDraftMerkleRewardBatch(input: {
  chainId: string;
  tokenAddress: string;
  createdBy?: string | null;
}) {
  const eligible = await listEligibleRewardsForMerkle();
  const tree = buildMerkleTree(eligible.map((reward: EligibleRewardForMerkle) => ({
    ledgerId: reward.ledger_id,
    beneficiaryUserId: reward.beneficiary_user_id,
    beneficiaryWallet: reward.beneficiary_wallet,
    amountRaw: reward.amount_raw,
  })));
  const totalAmountRaw = eligible.reduce((sum, item) => sum + BigInt(item.amount_raw), BigInt(0)).toString();

  return withTransaction(async (tx) => {
    const batch = await createMerkleRewardBatch({
      chainId: input.chainId,
      tokenAddress: input.tokenAddress,
      merkleRoot: tree.root,
      totalAmountRaw,
      status: 'draft',
      metadata: { reward_count: eligible.length },
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

export async function verifyMerkleClaimReceipt(): Promise<never> {
  throw new MerkleClaimVerificationError(
    503,
    'MERKLE_CLAIM_VERIFIER_NOT_CONFIGURED',
    'Merkle claim receipt verification requires production chain RPC, ABI, and claim event schema'
  );
}

export function getMerkleClaimVerifierDiagnostics(): MerkleClaimVerifierDiagnostics {
  return {
    configured: false,
    status: 'not_configured',
    model: process.env.REWARD_CLAIM_MODEL || 'legacy_stub',
  };
}
