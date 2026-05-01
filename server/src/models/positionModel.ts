import { query, QueryExecutor } from '../db';

export interface Position {
  id: string;
  user_id: string;
  wave_id: number;
  amount_raw: string;
  onchain_position_id: string;
  entry_price: string;
  unlock_multiplier_bps: number;
  qualifies_for_activation: boolean;
  is_first_qualifying_for_user: boolean;
  withdrawn: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Insert a new position record. Caller must determine the on-chain position
 * id and ensure that duplicates are avoided. The `qualifies_for_activation`
 * and `is_first_qualifying_for_user` flags should be computed prior to
 * insertion. Returns the created position.
 */
export async function createPosition(
  userId: string,
  waveId: number,
  amountRaw: string,
  onchainPositionId: string,
  entryPrice: string,
  unlockMultiplierBps: number,
  qualifiesForActivation: boolean,
  isFirstQualifyingForUser: boolean,
  executor?: QueryExecutor
): Promise<Position> {
  const db = executor || { query };
  const result = await db.query<Position>(
    `INSERT INTO positions (
      user_id, wave_id, amount_raw, onchain_position_id,
      entry_price, unlock_multiplier_bps,
      qualifies_for_activation, is_first_qualifying_for_user,
      withdrawn, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,NOW(),NOW())
    RETURNING id, user_id, wave_id, amount_raw, onchain_position_id, entry_price,
      unlock_multiplier_bps, qualifies_for_activation, is_first_qualifying_for_user,
      withdrawn, created_at, updated_at`,
    [userId, waveId, amountRaw, onchainPositionId, entryPrice, unlockMultiplierBps,
     qualifiesForActivation, isFirstQualifyingForUser]
  );
  return result.rows[0];
}

export async function getUserWavePositionTotal(
  userId: string,
  waveId: number,
  executor?: QueryExecutor
): Promise<{ total_locked_raw: string; position_count: number }> {
  const db = executor || { query };
  const result = await db.query<{ total_locked_raw: string; position_count: string }>(
    `SELECT
       COALESCE(SUM(amount_raw) FILTER (WHERE withdrawn = FALSE), 0)::text AS total_locked_raw,
       COUNT(*) FILTER (WHERE withdrawn = FALSE)::text AS position_count
     FROM positions
     WHERE user_id = $1 AND wave_id = $2`,
    [userId, waveId]
  );
  const row = result.rows[0];
  return {
    total_locked_raw: row?.total_locked_raw || '0',
    position_count: Number(row?.position_count || 0),
  };
}
