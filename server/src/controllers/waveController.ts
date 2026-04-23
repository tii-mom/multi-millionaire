import { Request, Response, NextFunction } from 'express';
import { getCurrentWave, getWaveById } from '../models/waveModel';

export async function getCurrent(req: Request, res: Response, next: NextFunction) {
  try {
    const wave = await getCurrentWave();
    return res.json({ request_id: req.id || '', data: wave });
  } catch (err) {
    return next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const waveId = Number(req.params.waveId);
    const wave = await getWaveById(waveId);
    return res.json({ request_id: req.id || '', data: wave });
  } catch (err) {
    return next(err);
  }
}