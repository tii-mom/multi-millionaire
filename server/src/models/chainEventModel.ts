import { query } from '../db';

export type ChainEventApplyStatus = 'pending' | 'applied' | 'review_required' | 'rejected';

export interface ChainEventRecord {
  id: string;
  chain_id: string;
  contract_address: string;
  contract_role: string;
  event_name: string;
  tx_hash: string;
  log_index: number;
  block_number: string | null;
  block_time: Date | null;
  finalized: boolean;
  payload: Record<string, unknown>;
  apply_status: ChainEventApplyStatus;
  review_reason: string | null;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const chainEventColumns = `
  id, chain_id, contract_address, contract_role, event_name, tx_hash,
  log_index, block_number, block_time, finalized, payload, apply_status,
  review_reason, applied_at, created_at, updated_at
`;

export async function insertChainEvent(input: {
  chainId: string;
  contractAddress: string;
  contractRole: string;
  eventName: string;
  txHash: string;
  logIndex: number;
  blockNumber?: number | null;
  blockTime?: string | null;
  finalized: boolean;
  payload: Record<string, unknown>;
  applyStatus?: ChainEventApplyStatus;
  reviewReason?: string | null;
}): Promise<{ event: ChainEventRecord; inserted: boolean }> {
  const result = await query<ChainEventRecord & { inserted_marker: number }>(
    `INSERT INTO chain_events (
       chain_id, contract_address, contract_role, event_name, tx_hash,
       log_index, block_number, block_time, finalized, payload,
       apply_status, review_reason, applied_at, created_at, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
       CASE WHEN $11 = 'applied' THEN NOW() ELSE NULL END, NOW(), NOW())
     ON CONFLICT (chain_id, tx_hash, log_index)
     DO UPDATE SET updated_at = chain_events.updated_at
     RETURNING ${chainEventColumns}, xmax::text::int AS inserted_marker`,
    [
      input.chainId,
      input.contractAddress,
      input.contractRole,
      input.eventName,
      input.txHash,
      input.logIndex,
      input.blockNumber || null,
      input.blockTime || null,
      input.finalized,
      JSON.stringify(input.payload),
      input.applyStatus || 'pending',
      input.reviewReason || null,
    ]
  );
  const row = result.rows[0];
  return { event: row, inserted: row.inserted_marker === 0 };
}

export async function listChainEvents(filters: { applyStatus?: ChainEventApplyStatus; limit?: number }): Promise<ChainEventRecord[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.applyStatus) {
    params.push(filters.applyStatus);
    clauses.push(`apply_status = $${params.length}`);
  }

  params.push(filters.limit || 50);
  const limitParam = `$${params.length}`;
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await query<ChainEventRecord>(
    `SELECT ${chainEventColumns}
     FROM chain_events
     ${where}
     ORDER BY created_at DESC
     LIMIT ${limitParam}`,
    params
  );
  return result.rows;
}
