import { Request, Response, NextFunction } from 'express';
import {
  createRiskFlag,
  listRiskFlags,
  RiskEntityType,
  RiskSeverity,
  RiskStatus,
  updateRiskFlag,
} from '../models/riskModel';
import { createAdminAuditLog } from '../models/opsModel';

const entityTypes = new Set<RiskEntityType>(['user', 'position', 'reward_ledger']);
const severities = new Set<RiskSeverity>(['low', 'medium', 'high', 'critical']);
const statuses = new Set<RiskStatus>(['open', 'reviewing', 'resolved', 'dismissed']);

async function auditRiskAction(input: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata: Record<string, unknown>;
}) {
  try {
    await createAdminAuditLog(input);
  } catch {
    // Audit writes must not make risk operations unavailable during rollout.
  }
}

export async function getRiskFlags(req: Request, res: Response, next: NextFunction) {
  try {
    const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    if (entityType && !entityTypes.has(entityType as RiskEntityType)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_ENTITY_TYPE', message: 'Invalid entity_type' } });
    }
    if (status && !statuses.has(status as RiskStatus)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_STATUS', message: 'Invalid status' } });
    }

    const flags = await listRiskFlags({
      entityType: entityType as RiskEntityType | undefined,
      status: status as RiskStatus | undefined,
    });
    return res.json({ request_id: req.id || '', data: flags });
  } catch (err) {
    return next(err);
  }
}

export async function createManualRiskFlag(req: Request, res: Response, next: NextFunction) {
  try {
    const { entity_type: entityType, entity_id: entityId, flag_type: flagType, severity, status, note } = req.body;
    if (!entityTypes.has(entityType) || !entityId || !flagType || !severities.has(severity)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Valid entity_type, entity_id, flag_type, and severity are required' } });
    }
    if (status && !statuses.has(status)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_STATUS', message: 'Invalid status' } });
    }

    const flag = await createRiskFlag({
      entityType,
      entityId: String(entityId),
      flagType: String(flagType),
      severity,
      status: status || 'open',
      note: note === undefined ? null : String(note),
    });
    await auditRiskAction({
      actorUserId: req.user?.id || null,
      actorEmail: req.user?.email || null,
      action: 'risk_flag.create',
      entityType,
      entityId: String(entityId),
      metadata: { flag_type: flagType, severity, status: status || 'open' },
    });
    return res.status(201).json({ request_id: req.id || '', data: flag });
  } catch (err) {
    return next(err);
  }
}

export async function patchRiskFlag(req: Request, res: Response, next: NextFunction) {
  try {
    const { severity, status, note } = req.body;
    if (severity && !severities.has(severity)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_SEVERITY', message: 'Invalid severity' } });
    }
    if (status && !statuses.has(status)) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_STATUS', message: 'Invalid status' } });
    }

    const flag = await updateRiskFlag(req.params.flagId, {
      severity,
      status,
      note: note === undefined ? undefined : String(note),
    });
    if (!flag) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'RISK_FLAG_NOT_FOUND', message: 'Risk flag not found' } });
    }
    await auditRiskAction({
      actorUserId: req.user?.id || null,
      actorEmail: req.user?.email || null,
      action: 'risk_flag.update',
      entityType: 'risk_flag',
      entityId: req.params.flagId,
      metadata: { severity: severity || null, status: status || null, note: note === undefined ? null : String(note) },
    });
    return res.json({ request_id: req.id || '', data: flag });
  } catch (err) {
    return next(err);
  }
}
