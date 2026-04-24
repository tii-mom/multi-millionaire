import { Request, Response, NextFunction } from 'express';
import {
  getAdminDashboard,
  listAdminRewards,
  listAdminRiskFlags,
  listAdminSquads,
  listAdminWaves,
} from '../models/adminReadModel';
import { createAdminAuditLog, listAdminAuditLogs, listAppControls, setAppControl } from '../models/opsModel';
import { listChainEvents } from '../models/chainEventModel';
import { getReceiptVerifierDiagnostics } from '../services/receiptVerifier';

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const dashboard = await getAdminDashboard();
    return res.json({ request_id: req.id || '', data: dashboard });
  } catch (err) {
    return next(err);
  }
}

export async function getWaves(req: Request, res: Response, next: NextFunction) {
  try {
    const waves = await listAdminWaves();
    return res.json({ request_id: req.id || '', data: waves });
  } catch (err) {
    return next(err);
  }
}

export async function getRiskFlags(req: Request, res: Response, next: NextFunction) {
  try {
    const flags = await listAdminRiskFlags();
    return res.json({ request_id: req.id || '', data: flags });
  } catch (err) {
    return next(err);
  }
}

export async function getRewards(req: Request, res: Response, next: NextFunction) {
  try {
    const rewards = await listAdminRewards();
    return res.json({ request_id: req.id || '', data: rewards });
  } catch (err) {
    return next(err);
  }
}

export async function getSquads(req: Request, res: Response, next: NextFunction) {
  try {
    const squads = await listAdminSquads();
    return res.json({ request_id: req.id || '', data: squads });
  } catch (err) {
    return next(err);
  }
}

export async function getControls(req: Request, res: Response, next: NextFunction) {
  try {
    const controls = await listAppControls();
    return res.json({ request_id: req.id || '', data: controls });
  } catch (err) {
    return next(err);
  }
}

export async function patchControl(req: Request, res: Response, next: NextFunction) {
  try {
    const { enabled, reason } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'enabled boolean is required' } });
    }

    const control = await setAppControl({
      key: req.params.key,
      enabled,
      reason: reason === undefined ? null : String(reason),
      actorUserId: req.user?.id || null,
    });
    await createAdminAuditLog({
      actorUserId: req.user?.id || null,
      actorEmail: req.user?.email || null,
      action: 'app_control.update',
      entityType: 'app_control',
      entityId: req.params.key,
      metadata: { enabled, reason: reason || null },
    });

    return res.json({ request_id: req.id || '', data: control });
  } catch (err) {
    return next(err);
  }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const logs = await listAdminAuditLogs(Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50);
    return res.json({ request_id: req.id || '', data: logs });
  } catch (err) {
    return next(err);
  }
}

export async function getChainEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const applyStatus = typeof req.query.apply_status === 'string' ? req.query.apply_status : undefined;
    const events = await listChainEvents({
      applyStatus: applyStatus as any,
      limit: 50,
    });
    return res.json({ request_id: req.id || '', data: events });
  } catch (err) {
    return next(err);
  }
}

export async function getOpsDiagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    return res.json({
      request_id: req.id || '',
      data: {
        receipt_verifier: getReceiptVerifierDiagnostics(),
      },
    });
  } catch (err) {
    return next(err);
  }
}
