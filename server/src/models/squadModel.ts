import { query } from '../db';

export interface Squad {
  id: number;
  wave_id: number;
  name: string;
  captain_user_id: string;
  status: 'open' | 'frozen' | 'archived';
  invite_code: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SquadMember {
  id: number;
  wave_id: number;
  squad_id: number;
  user_id: string;
  role: 'captain' | 'member';
  status: 'joined_pending' | 'activated' | 'removed';
  joined_at: Date;
  activated_at: Date | null;
}

export interface SquadLeaderboardRow {
  id: number;
  name: string;
  captain_user_id: string;
  activated_member_count: number;
  total_locked: string;
  rank: number;
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function getSquadById(waveId: number, squadId: number): Promise<Squad | null> {
  const result = await query<Squad>(
    `SELECT id, wave_id, name, captain_user_id, status, invite_code, created_at, updated_at
     FROM squads
     WHERE wave_id = $1 AND id = $2`,
    [waveId, squadId]
  );
  return result.rows[0] || null;
}

export async function getMembershipForWave(waveId: number, userId: string): Promise<SquadMember | null> {
  const result = await query<SquadMember>(
    `SELECT id, wave_id, squad_id, user_id, role, status, joined_at, activated_at
     FROM squad_members
     WHERE wave_id = $1 AND user_id = $2 AND status <> 'removed'`,
    [waveId, userId]
  );
  return result.rows[0] || null;
}

export async function createSquadWithCaptain(waveId: number, name: string, captainUserId: string): Promise<{ squad: Squad; member: SquadMember }> {
  const squadResult = await query<Squad>(
    `INSERT INTO squads (wave_id, name, captain_user_id, status, invite_code, created_at, updated_at)
     VALUES ($1, $2, $3, 'open', $4, NOW(), NOW())
     RETURNING id, wave_id, name, captain_user_id, status, invite_code, created_at, updated_at`,
    [waveId, name, captainUserId, createInviteCode()]
  );
  const squad = squadResult.rows[0];

  const memberResult = await query<SquadMember>(
    `INSERT INTO squad_members (wave_id, squad_id, user_id, role, status, joined_at)
     VALUES ($1, $2, $3, 'captain', 'joined_pending', NOW())
     RETURNING id, wave_id, squad_id, user_id, role, status, joined_at, activated_at`,
    [waveId, squad.id, captainUserId]
  );

  return { squad, member: memberResult.rows[0] };
}

export async function listSquadsForWave(waveId: number): Promise<SquadLeaderboardRow[]> {
  const result = await query<SquadLeaderboardRow>(
    `WITH member_position_totals AS (
       SELECT user_id, wave_id, SUM(amount_raw) AS locked_amount
       FROM positions
       WHERE wave_id = $1
       GROUP BY user_id, wave_id
     ),
     squad_stats AS (
       SELECT
         sm.squad_id,
         COUNT(*) FILTER (WHERE sm.status = 'activated')::int AS activated_member_count,
         COALESCE(SUM(COALESCE(mpt.locked_amount, 0)), 0)::text AS total_locked
       FROM squad_members sm
       LEFT JOIN member_position_totals mpt
         ON mpt.user_id = sm.user_id AND mpt.wave_id = sm.wave_id
       WHERE sm.wave_id = $1 AND sm.status <> 'removed'
       GROUP BY sm.squad_id
     ),
     ranked AS (
       SELECT
         s.id,
         s.name,
         s.captain_user_id,
         COALESCE(ss.activated_member_count, 0)::int AS activated_member_count,
         COALESCE(ss.total_locked, '0') AS total_locked,
         ROW_NUMBER() OVER (
           ORDER BY COALESCE(ss.activated_member_count, 0) DESC,
                    COALESCE(ss.total_locked::numeric, 0) DESC,
                    s.created_at ASC
         )::int AS rank
       FROM squads s
       LEFT JOIN squad_stats ss ON ss.squad_id = s.id
       WHERE s.wave_id = $1 AND s.status <> 'archived'
     )
     SELECT id, name, captain_user_id, activated_member_count, total_locked, rank
     FROM ranked
     ORDER BY rank ASC`,
    [waveId]
  );
  return result.rows;
}

export async function joinSquad(waveId: number, squadId: number, userId: string): Promise<SquadMember> {
  const result = await query<SquadMember>(
    `INSERT INTO squad_members (wave_id, squad_id, user_id, role, status, joined_at)
     VALUES ($1, $2, $3, 'member', 'joined_pending', NOW())
     RETURNING id, wave_id, squad_id, user_id, role, status, joined_at, activated_at`,
    [waveId, squadId, userId]
  );
  return result.rows[0];
}

export async function activateSquadMember(waveId: number, userId: string): Promise<SquadMember | null> {
  const result = await query<SquadMember>(
    `UPDATE squad_members
     SET status = 'activated', activated_at = NOW()
     WHERE wave_id = $1
       AND user_id = $2
       AND status = 'joined_pending'
     RETURNING id, wave_id, squad_id, user_id, role, status, joined_at, activated_at`,
    [waveId, userId]
  );
  return result.rows[0] || null;
}
