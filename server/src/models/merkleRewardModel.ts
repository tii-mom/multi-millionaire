import { query, QueryExecutor } from '../db';

export type MerkleRewardBatchStatus = 'draft' | 'published' | 'active' | 'superseded' | 'settled';
export type MerkleRewardClaimStatus = 'proof_available' | 'claim_pending' | 'claimed' | 'rejected';

export interface MerkleRewardBatch {
  id: string;
  chain_id: string;
  token_address: string;
  merkle_root: string;
  total_amount_raw: string;
  status: MerkleRewardBatchStatus;
  published_tx_hash: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MerkleRewardProof {
  id: string;
  batch_id: string;
  reward_ledger_id: string;
  beneficiary_user_id: string;
  beneficiary_wallet: string;
  amount_raw: string;
  leaf_hash: string;
  proof: string[];
  claim_status: MerkleRewardClaimStatus;
  claim_tx_hash: string | null;
  claim_chain_event_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MerkleRewardProofWithBatch extends MerkleRewardProof {
  chain_id: string;
  token_address: string;
  merkle_root: string;
  batch_metadata: Record<string, unknown>;
  batch_status: MerkleRewardBatchStatus;
  published_tx_hash: string | null;
}

export interface EligibleRewardForMerkle {
  ledger_id: string;
  beneficiary_user_id: string;
  beneficiary_wallet: string;
  amount_raw: string;
}

const batchColumns = `
  id, chain_id, token_address, merkle_root, total_amount_raw::text,
  status, published_tx_hash, metadata, created_by, created_at, updated_at
`;

const proofColumns = `
  id, batch_id, reward_ledger_id, beneficiary_user_id, beneficiary_wallet,
  amount_raw::text, leaf_hash, proof, claim_status, claim_tx_hash,
  claim_chain_event_id, created_at, updated_at
`;

export async function listEligibleRewardsForMerkle(): Promise<EligibleRewardForMerkle[]> {
  const riskReviewEnabled = !['0', 'false', 'no', 'off'].includes((process.env.RISK_REVIEW_ENABLED || 'true').trim().toLowerCase());
  const result = await query<EligibleRewardForMerkle>(
    `SELECT
       rl.id AS ledger_id,
       rl.beneficiary_user_id,
       wb.normalized_address AS beneficiary_wallet,
       rl.final_amount::text AS amount_raw
     FROM reward_ledgers rl
     JOIN wallet_bindings wb
       ON wb.user_id = rl.beneficiary_user_id
      AND wb.status = 'verified'
      AND wb.is_primary = TRUE
     WHERE rl.status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM merkle_reward_proofs mrp
         WHERE mrp.reward_ledger_id = rl.id
       )
       AND (
         $1::boolean = FALSE
         OR NOT EXISTS (
         SELECT 1
         FROM risk_flags rf
         WHERE rf.status IN ('open','reviewing')
           AND (
             (rf.entity_type = 'user' AND rf.entity_id = rl.beneficiary_user_id::text)
             OR (rf.entity_type = 'position' AND rf.entity_id = rl.source_position_id::text)
             OR (rf.entity_type = 'reward_ledger' AND rf.entity_id = rl.id::text)
           )
         )
       )
     ORDER BY rl.created_at ASC`,
    [riskReviewEnabled]
  );
  return result.rows;
}

export async function createMerkleRewardBatch(input: {
  chainId: string;
  tokenAddress: string;
  merkleRoot: string;
  totalAmountRaw: string;
  status?: MerkleRewardBatchStatus;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}, executor?: QueryExecutor): Promise<MerkleRewardBatch> {
  const db = executor || { query };
  const result = await db.query<MerkleRewardBatch>(
    `INSERT INTO merkle_reward_batches (
       chain_id, token_address, merkle_root, total_amount_raw, status,
       metadata, created_by, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
     RETURNING ${batchColumns}`,
    [
      input.chainId,
      input.tokenAddress,
      input.merkleRoot,
      input.totalAmountRaw,
      input.status || 'draft',
      JSON.stringify(input.metadata || {}),
      input.createdBy || null,
    ]
  );
  return result.rows[0];
}

export async function createMerkleRewardProof(input: {
  batchId: string;
  rewardLedgerId: string;
  beneficiaryUserId: string;
  beneficiaryWallet: string;
  amountRaw: string;
  leafHash: string;
  proof: string[];
}, executor?: QueryExecutor): Promise<MerkleRewardProof> {
  const db = executor || { query };
  const result = await db.query<MerkleRewardProof>(
    `INSERT INTO merkle_reward_proofs (
       batch_id, reward_ledger_id, beneficiary_user_id, beneficiary_wallet,
       amount_raw, leaf_hash, proof, claim_status, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,'proof_available',NOW(),NOW())
     RETURNING ${proofColumns}`,
    [
      input.batchId,
      input.rewardLedgerId,
      input.beneficiaryUserId,
      input.beneficiaryWallet,
      input.amountRaw,
      input.leafHash,
      JSON.stringify(input.proof),
    ]
  );
  return result.rows[0];
}

export async function getMerkleProofForLedger(ledgerId: string, userId: string): Promise<MerkleRewardProofWithBatch | null> {
  const result = await query<MerkleRewardProofWithBatch>(
    `SELECT
       mrp.id, mrp.batch_id, mrp.reward_ledger_id, mrp.beneficiary_user_id,
       mrp.beneficiary_wallet, mrp.amount_raw::text, mrp.leaf_hash, mrp.proof,
       mrp.claim_status, mrp.claim_tx_hash, mrp.claim_chain_event_id,
       mrp.created_at, mrp.updated_at,
       mrb.chain_id, mrb.token_address, mrb.merkle_root,
       mrb.metadata AS batch_metadata,
       mrb.status AS batch_status, mrb.published_tx_hash
     FROM merkle_reward_proofs mrp
     JOIN merkle_reward_batches mrb ON mrb.id = mrp.batch_id
     WHERE mrp.reward_ledger_id = $1
       AND mrp.beneficiary_user_id = $2`,
    [ledgerId, userId]
  );
  return result.rows[0] || null;
}

export async function listMerkleRewardBatches(limit = 50): Promise<MerkleRewardBatch[]> {
  const result = await query<MerkleRewardBatch>(
    `SELECT ${batchColumns}
     FROM merkle_reward_batches
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function listMerkleRewardProofs(filters: { batchId?: string; userId?: string; limit?: number }): Promise<MerkleRewardProof[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (filters.batchId) {
    params.push(filters.batchId);
    clauses.push(`batch_id = $${params.length}`);
  }
  if (filters.userId) {
    params.push(filters.userId);
    clauses.push(`beneficiary_user_id = $${params.length}`);
  }
  params.push(filters.limit || 50);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query<MerkleRewardProof>(
    `SELECT ${proofColumns}
     FROM merkle_reward_proofs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

export async function markMerkleClaimPending(ledgerId: string, userId: string, claimTxHash: string): Promise<MerkleRewardProof | null> {
  const result = await query<MerkleRewardProof>(
    `UPDATE merkle_reward_proofs
     SET claim_status = 'claim_pending', claim_tx_hash = $3, updated_at = NOW()
     WHERE reward_ledger_id = $1
       AND beneficiary_user_id = $2
       AND claim_status = 'proof_available'
     RETURNING ${proofColumns}`,
    [ledgerId, userId, claimTxHash]
  );
  return result.rows[0] || null;
}
