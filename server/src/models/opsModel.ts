import { query } from '../db';

export interface AppControl {
  key: string;
  enabled: boolean;
  reason: string | null;
  updated_by: string | null;
  updated_at: Date;
}

export interface AdminAuditLog {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

const appControlColumns = 'key, enabled, reason, updated_by, updated_at';
const auditColumns = 'id, actor_user_id, actor_email, action, entity_type, entity_id, metadata, created_at';

export async function getAppControl(key: string): Promise<AppControl | null> {
  const result = await query<AppControl>(
    `SELECT ${appControlColumns}
     FROM app_controls
     WHERE key = $1`,
    [key]
  );
  return result.rows[0] || null;
}

export async function listAppControls(): Promise<AppControl[]> {
  const result = await query<AppControl>(
    `SELECT ${appControlColumns}
     FROM app_controls
     ORDER BY key ASC`
  );
  return result.rows;
}

export async function setAppControl(input: {
  key: string;
  enabled: boolean;
  reason?: string | null;
  actorUserId?: string | null;
}): Promise<AppControl> {
  const result = await query<AppControl>(
    `INSERT INTO app_controls (key, enabled, reason, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key)
     DO UPDATE SET enabled = EXCLUDED.enabled, reason = EXCLUDED.reason, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING ${appControlColumns}`,
    [input.key, input.enabled, input.reason || null, input.actorUserId || null]
  );
  return result.rows[0];
}

export async function createAdminAuditLog(input: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AdminAuditLog> {
  const result = await query<AdminAuditLog>(
    `INSERT INTO admin_audit_logs (
       actor_user_id, actor_email, action, entity_type, entity_id, metadata, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING ${auditColumns}`,
    [
      input.actorUserId || null,
      input.actorEmail || null,
      input.action,
      input.entityType,
      input.entityId || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return result.rows[0];
}

export async function listAdminAuditLogs(limit = 50): Promise<AdminAuditLog[]> {
  const result = await query<AdminAuditLog>(
    `SELECT ${auditColumns}
     FROM admin_audit_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
