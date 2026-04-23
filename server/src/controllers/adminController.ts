import { Request, Response, NextFunction } from 'express';
import {
  getAdminDashboard,
  listAdminRewards,
  listAdminRiskFlags,
  listAdminSquads,
  listAdminWaves,
} from '../models/adminReadModel';

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
