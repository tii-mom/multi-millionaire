import { query } from '../db';

export interface Pass {
  id: string;
  user_id: string;
  wave_id: number;
  status: string;
  claimed_at: Date;
  activated_at: Date | null;
}

/**
 * Retrieve a pass for the given user and wave. Returns null if not found.
 */
export async function getPass(userId: string, waveId: number): Promise<Pass | null> {
  const result = await query<Pass>(
    `SELECT id, user_id, wave_id, status, claimed_at, activated_at
     FROM rush_passes
     WHERE user_id = $1 AND wave_id = $2
     LIMIT 1`,
    [userId, waveId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new pass for a user. Returns the inserted pass record. This helper
 * does not enforce business rules; controllers should validate eligibility.
 */
export async function createPass(userId: string, waveId: number): Promise<Pass> {
  const result = await query<Pass>(
    `INSERT INTO rush_passes (user_id, wave_id, status, claimed_at, created_at, updated_at)
     VALUES ($1, $2, 'claimed', NOW(), NOW(), NOW())
     RETURNING id, user_id, wave_id, status, claimed_at, activated_at`,
    [userId, waveId]
  );
  return result.rows[0];
}