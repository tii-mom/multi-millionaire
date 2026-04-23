import { query } from '../db';

export interface Wave {
  wave_id: number;
  code: string;
  name: string;
  status: string;
  start_time: Date;
  end_time: Date;
  min_lock_amount: string;
  unlock_multiplier_bps: number;
  price_freshness_ttl_seconds: number;
  reward_budget: string;
  direct_reward_rate_bps: number;
  per_invite_cap: string;
  inviter_wave_cap: string;
  claim_min_amount: string;
  counted_member_cap: number | null;
  settle_delay_seconds: number;
  deposits_disabled: boolean;
}

export async function getCurrentWave(): Promise<Wave | null> {
  // Fetch the currently live wave. If none is live, return the first upcoming one.
  const liveResult = await query<Wave>(
    `SELECT *
     FROM waves
     WHERE status = 'live'
     ORDER BY start_time ASC
     LIMIT 1`
  );
  if (liveResult.rows.length > 0) {
    return liveResult.rows[0];
  }
  const upcomingResult = await query<Wave>(
    `SELECT *
     FROM waves
     WHERE status = 'upcoming'
     ORDER BY start_time ASC
     LIMIT 1`
  );
  if (upcomingResult.rows.length > 0) {
    return upcomingResult.rows[0];
  }
  return null;
}

export async function getWaveById(waveId: number): Promise<Wave | null> {
  const result = await query<Wave>(
    `SELECT * FROM waves WHERE wave_id = $1`,
    [waveId]
  );
  return result.rows[0] || null;
}