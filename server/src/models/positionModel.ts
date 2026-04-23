import { query } from '../db';

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
  isFirstQualifyingForUser: boolean
): Promise<Position> {
  const result = await query<Position>(
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