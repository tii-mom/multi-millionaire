import { query, QueryExecutor } from '../db';

export type RiskEntityType = 'user' | 'position' | 'reward_ledger';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface RiskFlag {
  id: string;
  entity_type: RiskEntityType;
  entity_id: string;
  flag_type: string;
  severity: RiskSeverity;
  status: RiskStatus;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateRiskFlagInput {
  entityType: RiskEntityType;
  entityId: string;
  flagType: string;
  severity: RiskSeverity;
  status?: RiskStatus;
  note?: string | null;
}

interface RiskFlagFilters {
  entityType?: RiskEntityType;
  status?: RiskStatus;
}

interface UpdateRiskFlagInput {
  severity?: RiskSeverity;
  status?: RiskStatus;
  note?: string | null;
}

const riskFlagColumns = `
  id, entity_type, entity_id, flag_type, severity, status, note, created_at, updated_at
`;

export async function createRiskFlag(input: CreateRiskFlagInput, executor?: QueryExecutor): Promise<RiskFlag> {
  const db = executor || { query };
  const result = await db.query<RiskFlag>(
    `INSERT INTO risk_flags (entity_type, entity_id, flag_type, severity, status, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING ${riskFlagColumns}`,
    [input.entityType, input.entityId, input.flagType, input.severity, input.status || 'open', input.note || null]
  );
  return result.rows[0];
}

export async function listRiskFlags(filters: RiskFlagFilters): Promise<RiskFlag[]> {
  const clauses: string[] = [];
  const params: any[] = [];

  if (filters.entityType) {
    params.push(filters.entityType);
    clauses.push(`entity_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query<RiskFlag>(
    `SELECT ${riskFlagColumns}
     FROM risk_flags
     ${where}
     ORDER BY created_at DESC`,
    params
  );
  return result.rows;
}

export async function updateRiskFlag(flagId: string, input: UpdateRiskFlagInput): Promise<RiskFlag | null> {
  const result = await query<RiskFlag>(
    `UPDATE risk_flags
     SET
       severity = COALESCE($2, severity),
       status = COALESCE($3, status),
       note = COALESCE($4, note),
       updated_at = NOW()
     WHERE id = $1
     RETURNING ${riskFlagColumns}`,
    [flagId, input.severity || null, input.status || null, input.note === undefined ? null : input.note]
  );
  return result.rows[0] || null;
}

export async function hasBlockingRiskForRewardClaim(ledgerId: string, beneficiaryUserId: string): Promise<boolean> {
  const result = await query<{ blocked: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM reward_ledgers rl
       JOIN risk_flags rf
         ON (
           (rf.entity_type = 'position' AND rf.entity_id = rl.source_position_id::text)
           OR (rf.entity_type = 'user' AND rf.entity_id = rl.beneficiary_user_id::text)
         )
       WHERE rl.id = $1
         AND rl.beneficiary_user_id = $2
         AND rf.status IN ('open', 'reviewing')
     ) AS blocked`,
    [ledgerId, beneficiaryUserId]
  );
  return !!result.rows[0]?.blocked;
}
