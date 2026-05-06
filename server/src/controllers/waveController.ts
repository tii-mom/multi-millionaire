import { Request, Response, NextFunction } from 'express';
import { getCurrentWave, getWaveById } from '../models/waveModel';
import { getLeaderboardMe as getLeaderboardMeModel } from '../models/squadModel';
import { getRewardEstimate as getRewardEstimateModel } from '../models/rewardModel';

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

export async function getLeaderboardMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const waveId = Number(req.params.waveId);
    const wave = await getWaveById(waveId);
    if (!wave) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'WAVE_NOT_FOUND', message: 'Wave not found' } });
    }

    const leaderboard = await getLeaderboardMeModel(waveId, user.id);
    return res.json({ request_id: req.id || '', data: leaderboard });
  } catch (err) {
    return next(err);
  }
}

export async function getRewardEstimate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const waveId = Number(req.params.waveId);
    const wave = await getWaveById(waveId);
    if (!wave) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'WAVE_NOT_FOUND', message: 'Wave not found' } });
    }

    const estimate = await getRewardEstimateModel(waveId, user.id);
    return res.json({ request_id: req.id || '', data: estimate });
  } catch (err) {
    return next(err);
  }
}
