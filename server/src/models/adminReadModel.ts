import { query } from '../db';
import type { QueryResultRow } from 'pg';

export interface AdminWave {
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
  created_at: Date;
  updated_at: Date;
}

export interface AdminDashboard {
  current_wave: AdminWave | null;
  total_users: number;
  total_positions: number;
  total_rewards_pending: string;
  total_rewards_claimed: string;
  open_risk_flags: number;
}

export interface AdminRiskFlag {
  id: string;
  entity_type: string;
  entity_id: string;
  flag_type: string;
  severity: string;
  status: string;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminReward {
  id: string;
  beneficiary_user_id: string;
  beneficiary_email: string | null;
  source_user_id: string;
  source_email: string | null;
  source_position_id: string;
  source_ref: string | null;
  wave_id: number;
  reward_type: string;
  gross_amount: string;
  final_amount: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface AdminSquad {
  id: number;
  wave_id: number;
  name: string;
  captain_user_id: string;
  captain_email: string | null;
  status: string;
  invite_code: string | null;
  member_count: number;
  activated_member_count: number;
  total_locked: string;
  rank: number;
  created_at: Date;
  updated_at: Date;
}

export interface AdminListOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface AdminPaginatedResult<T> {
  rows: T[];
  page: number;
  page_size: number;
  total: number;
  page_count: number;
  search: string;
}

const adminWaveColumns = `
  wave_id, code, name, status, start_time, end_time, min_lock_amount,
  unlock_multiplier_bps, price_freshness_ttl_seconds, reward_budget,
  direct_reward_rate_bps, per_invite_cap, inviter_wave_cap, claim_min_amount,
  counted_member_cap, settle_delay_seconds, deposits_disabled, created_at, updated_at
`;

const defaultListPageSize = 25;
const maxListPageSize = 100;

type NormalizedAdminListOptions = {
  page: number;
  pageSize: number;
  offset: number;
  search: string;
};

function normalizeListOptions(options: AdminListOptions = {}): NormalizedAdminListOptions {
  const page = Number.isInteger(options.page) && Number(options.page) > 0
    ? Number(options.page)
    : 1;
  const requestedPageSize = Number.isInteger(options.pageSize) && Number(options.pageSize) > 0
    ? Number(options.pageSize)
    : defaultListPageSize;
  const pageSize = Math.min(requestedPageSize, maxListPageSize);
  const search = String(options.search || '').trim().slice(0, 160);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search,
  };
}

function buildSearchClause(columns: string[], search: string, params: unknown[]) {
  if (!search) return '';
  params.push(`%${search}%`);
  const param = `$${params.length}`;
  return `WHERE (${columns.map((column) => `${column} ILIKE ${param}`).join(' OR ')})`;
}

async function runPaginatedAdminQuery<T extends QueryResultRow>(
  rowsSql: string,
  countSql: string,
  params: unknown[],
  options: NormalizedAdminListOptions,
): Promise<AdminPaginatedResult<T>> {
  const [rowsResult, countResult] = await Promise.all([
    query<T>(
      `${rowsSql}
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      [...params, options.pageSize, options.offset]
    ),
    query<{ total: number }>(countSql, params),
  ]);
  const total = countResult.rows[0]?.total || 0;

  return {
    rows: rowsResult.rows,
    page: options.page,
    page_size: options.pageSize,
    total,
    page_count: Math.max(1, Math.ceil(total / options.pageSize)),
    search: options.search,
  };
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [waveResult, userCount, positionCount, rewardTotals, riskCount] = await Promise.all([
    query<AdminWave>(
      `SELECT ${adminWaveColumns}
       FROM waves
       WHERE status IN ('live', 'upcoming')
       ORDER BY CASE status WHEN 'live' THEN 0 ELSE 1 END, start_time ASC
       LIMIT 1`
    ),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users`),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM positions`),
    query<{ total_rewards_pending: string; total_rewards_claimed: string }>(
      `SELECT
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'pending'), 0)::text AS total_rewards_pending,
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'claimed'), 0)::text AS total_rewards_claimed
       FROM reward_ledgers`
    ),
    query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM risk_flags WHERE status = 'open'`),
  ]);

  return {
    current_wave: waveResult.rows[0] || null,
    total_users: userCount.rows[0]?.count || 0,
    total_positions: positionCount.rows[0]?.count || 0,
    total_rewards_pending: rewardTotals.rows[0]?.total_rewards_pending || '0',
    total_rewards_claimed: rewardTotals.rows[0]?.total_rewards_claimed || '0',
    open_risk_flags: riskCount.rows[0]?.count || 0,
  };
}

export async function listAdminWaves(optionsInput: AdminListOptions = {}): Promise<AdminPaginatedResult<AdminWave>> {
  const options = normalizeListOptions(optionsInput);
  const params: unknown[] = [];
  const where = buildSearchClause(['wave_id::text', 'code', 'name', 'status'], options.search, params);

  return runPaginatedAdminQuery<AdminWave>(
    `SELECT ${adminWaveColumns}
     FROM waves
     ${where}
     ORDER BY start_time DESC`,
    `SELECT COUNT(*)::int AS total
     FROM waves
     ${where}`,
    params,
    options
  );
}

export async function listAdminRiskFlags(optionsInput: AdminListOptions = {}): Promise<AdminPaginatedResult<AdminRiskFlag>> {
  const options = normalizeListOptions(optionsInput);
  const params: unknown[] = [];
  const where = buildSearchClause(['id::text', 'entity_type', 'entity_id', 'flag_type', 'severity', 'status', 'note'], options.search, params);

  return runPaginatedAdminQuery<AdminRiskFlag>(
    `SELECT id, entity_type, entity_id, flag_type, severity, status, note, created_at, updated_at
     FROM risk_flags
     ${where}
     ORDER BY created_at DESC`,
    `SELECT COUNT(*)::int AS total
     FROM risk_flags
     ${where}`,
    params,
    options
  );
}

export async function listAdminRewards(optionsInput: AdminListOptions = {}): Promise<AdminPaginatedResult<AdminReward>> {
  const options = normalizeListOptions(optionsInput);
  const params: unknown[] = [];
  const fromSql = `
     FROM reward_ledgers rl
     LEFT JOIN users beneficiary ON beneficiary.id = rl.beneficiary_user_id
     LEFT JOIN users source_user ON source_user.id = rl.source_user_id
  `;
  const where = buildSearchClause([
    'rl.id::text',
    'rl.beneficiary_user_id::text',
    'beneficiary.email',
    'rl.source_user_id::text',
    'source_user.email',
    'rl.source_position_id::text',
    'rl.source_ref',
    'rl.wave_id::text',
    'rl.reward_type',
    'rl.status',
  ], options.search, params);

  return runPaginatedAdminQuery<AdminReward>(
    `SELECT
       rl.id,
       rl.beneficiary_user_id,
       beneficiary.email AS beneficiary_email,
       rl.source_user_id,
       source_user.email AS source_email,
       rl.source_position_id,
       rl.source_ref,
       rl.wave_id,
       rl.reward_type,
       rl.gross_amount,
       rl.final_amount,
       rl.status,
       rl.created_at,
       rl.updated_at
     ${fromSql}
     ${where}
     ORDER BY rl.created_at DESC
    `,
    `SELECT COUNT(*)::int AS total
     ${fromSql}
     ${where}`,
    params,
    options
  );
}

export async function listAdminSquads(optionsInput: AdminListOptions = {}): Promise<AdminPaginatedResult<AdminSquad>> {
  const options = normalizeListOptions(optionsInput);
  const params: unknown[] = [];
  const withSql = `WITH member_position_totals AS (
       SELECT user_id, wave_id, SUM(amount_raw) AS locked_amount
       FROM positions
       WHERE withdrawn = FALSE
       GROUP BY user_id, wave_id
     ),
     squad_stats AS (
       SELECT
         sm.squad_id,
         COUNT(*) FILTER (WHERE sm.status <> 'removed')::int AS member_count,
         COUNT(*) FILTER (WHERE sm.status = 'activated')::int AS activated_member_count,
         COALESCE(SUM(COALESCE(mpt.locked_amount, 0)), 0)::text AS total_locked
       FROM squad_members sm
       LEFT JOIN member_position_totals mpt
         ON mpt.user_id = sm.user_id AND mpt.wave_id = sm.wave_id
       GROUP BY sm.squad_id
     ),
     ranked_squads AS (
     SELECT
       s.id,
       s.wave_id,
       s.name,
       s.captain_user_id,
       captain.email AS captain_email,
       s.status,
       s.invite_code,
       COALESCE(ss.member_count, 0)::int AS member_count,
       COALESCE(ss.activated_member_count, 0)::int AS activated_member_count,
       COALESCE(ss.total_locked, '0') AS total_locked,
       ROW_NUMBER() OVER (
         ORDER BY
           COALESCE(ss.activated_member_count, 0) DESC,
           COALESCE(ss.total_locked::numeric, 0) DESC,
           s.created_at ASC
       )::int AS rank,
       s.created_at,
       s.updated_at
     FROM squads s
     LEFT JOIN users captain ON captain.id = s.captain_user_id
     LEFT JOIN squad_stats ss ON ss.squad_id = s.id
     )`;
  const where = buildSearchClause([
    'id::text',
    'wave_id::text',
    'name',
    'captain_user_id::text',
    'captain_email',
    'status',
    'invite_code',
  ], options.search, params);

  return runPaginatedAdminQuery<AdminSquad>(
    `${withSql}
     SELECT id, wave_id, name, captain_user_id, captain_email, status, invite_code,
       member_count, activated_member_count, total_locked, rank, created_at, updated_at
     FROM ranked_squads
     ${where}
     ORDER BY rank ASC`,
    `${withSql}
     SELECT COUNT(*)::int AS total
     FROM ranked_squads
     ${where}`,
    params,
    options
  );
}
