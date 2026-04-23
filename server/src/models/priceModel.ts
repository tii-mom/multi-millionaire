import { query } from '../db';

export interface PriceRound {
  round_id: number;
  price: string;
  status: string;
  observed_at: Date;
  submitted_at: Date;
  confirmed_at: Date | null;
}

/**
 * Returns the latest confirmed price round. If none are confirmed, returns null.
 */
export async function getLatestConfirmedPrice(): Promise<PriceRound | null> {
  const result = await query<PriceRound>(
    `SELECT round_id, price, status, observed_at, submitted_at, confirmed_at
     FROM price_rounds
     WHERE status = 'confirmed'
     ORDER BY round_id DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}