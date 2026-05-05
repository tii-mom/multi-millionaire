import { Request, Response, NextFunction } from 'express';
import { getCurrentWave, getWaveById } from '../models/waveModel';
import { getDepositStreakView, setDepositStreakGoal } from '../models/depositStreakModel';
import { isSupportedDepositGoalTargetUsd9 } from '../services/tonMessages';

function parsePositiveIntString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value).toString();
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) && BigInt(trimmed) > BigInt(0) ? trimmed : null;
}

async function resolveWaveId(rawWaveId: unknown): Promise<number | null> {
  if (rawWaveId !== undefined) {
    const parsed = Number(rawWaveId);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    const wave = await getWaveById(parsed);
    return wave ? parsed : null;
  }

  const wave = await getCurrentWave();
  return wave?.wave_id || null;
}

export async function getMyDepositStreak(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const waveId = await resolveWaveId(req.query.waveId);
    if (!waveId) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'NO_WAVE', message: 'No active wave is available' } });
    }

    const view = await getDepositStreakView(user.id, waveId);
    return res.json({ request_id: req.id || '', data: view });
  } catch (err) {
    return next(err);
  }
}

export async function saveDepositStreakGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const waveId = await resolveWaveId(req.body.waveId);
    if (!waveId) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'NO_WAVE', message: 'No active wave is available' } });
    }

    const targetUsd9 = parsePositiveIntString(req.body.targetUsd9)
      || (() => {
        const targetUsd = parsePositiveIntString(req.body.targetUsd);
        return targetUsd ? (BigInt(targetUsd) * BigInt(1_000_000_000)).toString() : null;
      })();

    if (!targetUsd9) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'targetUsd9 or targetUsd is required' } });
    }
    if (!isSupportedDepositGoalTargetUsd9(targetUsd9)) {
      return res.status(400).json({
        request_id: req.id || '',
        error: { code: 'UNSUPPORTED_DEPOSIT_TARGET', message: 'Deposit target is not one of the supported USD tiers' },
      });
    }

    await setDepositStreakGoal(user.id, waveId, targetUsd9);
    const view = await getDepositStreakView(user.id, waveId);
    return res.status(201).json({ request_id: req.id || '', data: view });
  } catch (err) {
    return next(err);
  }
}
