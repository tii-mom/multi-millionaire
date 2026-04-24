import { query, QueryExecutor } from '../db';

export interface Referral {
  id: string;
  invitee_user_id: string;
  inviter_user_id: string | null;
  status: string;
  locked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function getReferral(inviteeUserId: string, executor?: QueryExecutor): Promise<Referral | null> {
  const db = executor || { query };
  const result = await db.query<Referral>(
    `SELECT id, invitee_user_id, inviter_user_id, status, locked_at, created_at, updated_at
     FROM referrals
     WHERE invitee_user_id = $1`,
    [inviteeUserId]
  );
  return result.rows[0] || null;
}

export async function upsertReferral(inviteeUserId: string, inviterUserId: string | null): Promise<Referral> {
  // Upsert referral. If a record exists, update inviter_user_id and status if not locked.
  const result = await query<Referral>(
    `INSERT INTO referrals (invitee_user_id, inviter_user_id, status, created_at, updated_at)
     VALUES ($1, $2, 'pending', NOW(), NOW())
     ON CONFLICT (invitee_user_id)
     DO UPDATE SET inviter_user_id = EXCLUDED.inviter_user_id, status = EXCLUDED.status, updated_at = NOW()
     RETURNING id, invitee_user_id, inviter_user_id, status, locked_at, created_at, updated_at`,
    [inviteeUserId, inviterUserId]
  );
  return result.rows[0];
}

/**
 * Lock the referral relationship. This should be called when the invitee makes
 * their first qualifying lock. After locking, the inviter cannot be changed.
 */
export async function lockReferral(inviteeUserId: string, executor?: QueryExecutor) {
  const db = executor || { query };
  await db.query(
    `UPDATE referrals
     SET status = 'locked', locked_at = NOW(), updated_at = NOW()
     WHERE invitee_user_id = $1 AND status = 'pending'`,
    [inviteeUserId]
  );
}
