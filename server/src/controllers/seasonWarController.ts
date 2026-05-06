import { Request, Response, NextFunction } from 'express';
import {
  getSeasonWarClaimPreview,
  getSeasonWarCurrent,
  getSeasonWarExportManifest,
  getSeasonWarMe,
  getSeasonWarRadar,
  getSeasonWarSquads,
} from '../models/seasonWarReadModel';

function queryString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMissingSeasonWarReadModelDependency(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const error = err as { code?: unknown; message?: unknown };
  if (error.code !== '42P01') return false;
  const message = typeof error.message === 'string' ? error.message : '';
  return /merkle_reward_(batches|proofs)/.test(message);
}

function handleSeasonWarError(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (isMissingSeasonWarReadModelDependency(err)) {
    return res.status(503).json({
      request_id: req.id || '',
      error: {
        code: 'SEASON_WAR_READ_MODEL_NOT_READY',
        message: 'Season War read model is not ready. Required migration 006_merkle_rewards.sql must be applied before Season War data can be served.',
      },
    });
  }
  return next(err);
}

export async function current(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSeasonWarCurrent();
    if (!data) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SEASON_WAR_NOT_FOUND', message: 'No active or upcoming Season War wave is configured' } });
    }
    return res.json({ request_id: req.id || '', data });
  } catch (err) {
    return handleSeasonWarError(err, req, res, next);
  }
}

export async function radar(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSeasonWarRadar(req.params.seasonId);
    if (!data) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SEASON_WAR_NOT_FOUND', message: 'Season War wave not found' } });
    }
    return res.json({ request_id: req.id || '', data });
  } catch (err) {
    return handleSeasonWarError(err, req, res, next);
  }
}

export async function squads(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSeasonWarSquads(req.params.seasonId);
    if (!data) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SEASON_WAR_NOT_FOUND', message: 'Season War wave not found' } });
    }
    return res.json({ request_id: req.id || '', data });
  } catch (err) {
    return handleSeasonWarError(err, req, res, next);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = queryString(req.query.wallet);
    if (!wallet) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'wallet query parameter is required' } });
    }
    const data = await getSeasonWarMe(wallet);
    return res.json({ request_id: req.id || '', data });
  } catch (err) {
    return handleSeasonWarError(err, req, res, next);
  }
}

export async function claimPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = queryString(req.query.wallet);
    if (!wallet) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'wallet query parameter is required' } });
    }
    const data = await getSeasonWarClaimPreview(req.params.seasonId, wallet);
    if (!data) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SEASON_WAR_NOT_FOUND', message: 'Season War wave not found' } });
    }
    return res.json({ request_id: req.id || '', data });
  } catch (err) {
    return handleSeasonWarError(err, req, res, next);
  }
}

export async function exportManifest(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSeasonWarExportManifest(req.params.seasonId);
    if (!data) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SEASON_WAR_NOT_FOUND', message: 'Season War wave not found' } });
    }
    return res.json({ request_id: req.id || '', data });
  } catch (err) {
    return handleSeasonWarError(err, req, res, next);
  }
}
