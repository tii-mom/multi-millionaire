import { query, QueryExecutor } from '../db';

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

export interface SquadMemberSummary {
  id: number;
  user_id: string;
  email: string | null;
  role: 'captain' | 'member';
  status: 'joined_pending' | 'activated' | 'removed';
  joined_at: Date;
  activated_at: Date | null;
  total_locked_raw: string;
  rank: number;
}

export interface SquadDetail {
  squad: Squad;
  rank: number | null;
  member_count: number;
  activated_member_count: number;
  total_locked_raw: string;
  members: SquadMemberSummary[];
}

export interface MySquadView extends SquadDetail {
  membership: SquadMember;
}

export interface PersonalLeaderboardRow {
  user_id: string;
  email: string | null;
  total_locked_raw: string;
  qualifying_position_count: number;
  first_qualified_at: Date | null;
  rank: number;
}

export interface LeaderboardMe {
  wave_id: number;
  personal: PersonalLeaderboardRow | null;
  squad: MySquadView | null;
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

export async function listSquadMembers(waveId: number, squadId: number): Promise<SquadMemberSummary[]> {
  const result = await query<SquadMemberSummary>(
    `WITH member_position_totals AS (
       SELECT user_id, wave_id, COALESCE(SUM(amount_raw) FILTER (WHERE withdrawn = FALSE), 0) AS locked_amount
       FROM positions
       WHERE wave_id = $1
       GROUP BY user_id, wave_id
     ),
     ranked AS (
       SELECT
         sm.id,
         sm.user_id,
         u.email,
         sm.role,
         sm.status,
         sm.joined_at,
         sm.activated_at,
         COALESCE(mpt.locked_amount, 0)::text AS total_locked_raw,
         ROW_NUMBER() OVER (
           ORDER BY COALESCE(mpt.locked_amount, 0) DESC,
                    sm.activated_at ASC NULLS LAST,
                    sm.joined_at ASC
         )::int AS rank
       FROM squad_members sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN member_position_totals mpt
         ON mpt.user_id = sm.user_id AND mpt.wave_id = sm.wave_id
       WHERE sm.wave_id = $1 AND sm.squad_id = $2 AND sm.status <> 'removed'
     )
     SELECT id, user_id, email, role, status, joined_at, activated_at, total_locked_raw, rank
     FROM ranked
     ORDER BY rank ASC`,
    [waveId, squadId]
  );
  return result.rows;
}

export async function getSquadDetail(waveId: number, squadId: number): Promise<SquadDetail | null> {
  const [squad, leaderboard, members] = await Promise.all([
    getSquadById(waveId, squadId),
    listSquadsForWave(waveId),
    listSquadMembers(waveId, squadId),
  ]);

  if (!squad) {
    return null;
  }

  const ranking = leaderboard.find((row) => row.id === squadId) || null;
  return {
    squad,
    rank: ranking?.rank ?? null,
    member_count: members.length,
    activated_member_count: ranking?.activated_member_count ?? members.filter((member) => member.status === 'activated').length,
    total_locked_raw: ranking?.total_locked ?? members.reduce((sum, member) => sum + BigInt(member.total_locked_raw || '0'), BigInt(0)).toString(),
    members,
  };
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

export async function getMySquadView(waveId: number, userId: string): Promise<MySquadView | null> {
  const membership = await getMembershipForWave(waveId, userId);
  if (!membership) {
    return null;
  }

  const detail = await getSquadDetail(waveId, membership.squad_id);
  if (!detail) {
    return null;
  }

  return {
    ...detail,
    membership,
  };
}

export async function listPersonalLeaderboardForWave(waveId: number, limit = 100): Promise<PersonalLeaderboardRow[]> {
  const result = await query<PersonalLeaderboardRow>(
    `WITH user_position_totals AS (
       SELECT
         p.user_id,
         COALESCE(SUM(p.amount_raw) FILTER (WHERE p.withdrawn = FALSE), 0)::text AS total_locked_raw,
         COUNT(*) FILTER (WHERE p.qualifies_for_activation = TRUE AND p.withdrawn = FALSE)::int AS qualifying_position_count,
         MIN(p.created_at) FILTER (WHERE p.qualifies_for_activation = TRUE AND p.withdrawn = FALSE) AS first_qualified_at
       FROM positions p
       WHERE p.wave_id = $1
       GROUP BY p.user_id
     ),
     ranked AS (
       SELECT
         upt.user_id,
         u.email,
         upt.total_locked_raw,
         upt.qualifying_position_count,
         upt.first_qualified_at,
         ROW_NUMBER() OVER (
           ORDER BY upt.qualifying_position_count DESC,
                    upt.total_locked_raw::numeric DESC,
                    upt.first_qualified_at ASC NULLS LAST
         )::int AS rank
       FROM user_position_totals upt
       LEFT JOIN users u ON u.id = upt.user_id
     )
     SELECT user_id, email, total_locked_raw, qualifying_position_count, first_qualified_at, rank
     FROM ranked
     ORDER BY rank ASC
     LIMIT $2`,
    [waveId, limit]
  );
  return result.rows;
}

export async function getPersonalLeaderboardPosition(waveId: number, userId: string): Promise<PersonalLeaderboardRow | null> {
  const result = await query<PersonalLeaderboardRow>(
    `WITH user_position_totals AS (
       SELECT
         p.user_id,
         COALESCE(SUM(p.amount_raw) FILTER (WHERE p.withdrawn = FALSE), 0)::text AS total_locked_raw,
         COUNT(*) FILTER (WHERE p.qualifies_for_activation = TRUE AND p.withdrawn = FALSE)::int AS qualifying_position_count,
         MIN(p.created_at) FILTER (WHERE p.qualifies_for_activation = TRUE AND p.withdrawn = FALSE) AS first_qualified_at
       FROM positions p
       WHERE p.wave_id = $1
       GROUP BY p.user_id
     ),
     ranked AS (
       SELECT
         upt.user_id,
         u.email,
         upt.total_locked_raw,
         upt.qualifying_position_count,
         upt.first_qualified_at,
         ROW_NUMBER() OVER (
           ORDER BY upt.qualifying_position_count DESC,
                    upt.total_locked_raw::numeric DESC,
                    upt.first_qualified_at ASC NULLS LAST
         )::int AS rank
       FROM user_position_totals upt
       LEFT JOIN users u ON u.id = upt.user_id
     )
     SELECT user_id, email, total_locked_raw, qualifying_position_count, first_qualified_at, rank
     FROM ranked
     WHERE user_id = $2`,
    [waveId, userId]
  );
  return result.rows[0] || null;
}

export async function getLeaderboardMe(waveId: number, userId: string): Promise<LeaderboardMe> {
  const [personal, squad] = await Promise.all([
    getPersonalLeaderboardPosition(waveId, userId),
    getMySquadView(waveId, userId),
  ]);

  return {
    wave_id: waveId,
    personal,
    squad,
  };
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
       SELECT user_id, wave_id, COALESCE(SUM(amount_raw) FILTER (WHERE withdrawn = FALSE), 0) AS locked_amount
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

export async function activateSquadMember(waveId: number, userId: string, executor?: QueryExecutor): Promise<SquadMember | null> {
  const db = executor || { query };
  const result = await db.query<SquadMember>(
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
