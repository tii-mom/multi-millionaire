import { Request, Response, NextFunction } from 'express';
import { getWaveById } from '../models/waveModel';
import {
  createSquadWithCaptain,
  getMembershipForWave,
  getMySquadView,
  getSquadById,
  getSquadDetail,
  joinSquad,
  listSquadsForWave,
} from '../models/squadModel';

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export async function createSquad(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const waveId = Number(req.params.waveId);
    const name = normalizeName(req.body.name);
    if (!Number.isInteger(waveId) || waveId <= 0 || !name) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Valid waveId and squad name are required' } });
    }

    const wave = await getWaveById(waveId);
    if (!wave) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'WAVE_NOT_FOUND', message: 'Wave not found' } });
    }

    const existingMembership = await getMembershipForWave(waveId, user.id);
    if (existingMembership) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'SQUAD_MEMBERSHIP_EXISTS', message: 'User has already joined a squad in this wave' } });
    }

    const created = await createSquadWithCaptain(waveId, name, user.id);
    return res.status(201).json({ request_id: req.id || '', data: created });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'SQUAD_MEMBERSHIP_EXISTS', message: 'User has already joined a squad in this wave' } });
    }
    return next(err);
  }
}

export async function listSquads(req: Request, res: Response, next: NextFunction) {
  try {
    const waveId = Number(req.params.waveId);
    if (!Number.isInteger(waveId) || waveId <= 0) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Valid waveId is required' } });
    }

    const wave = await getWaveById(waveId);
    if (!wave) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'WAVE_NOT_FOUND', message: 'Wave not found' } });
    }

    const squads = await listSquadsForWave(waveId);
    return res.json({ request_id: req.id || '', data: squads });
  } catch (err) {
    return next(err);
  }
}

export async function getMySquad(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const waveId = Number(req.params.waveId);
    if (!Number.isInteger(waveId) || waveId <= 0) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Valid waveId is required' } });
    }

    const wave = await getWaveById(waveId);
    if (!wave) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'WAVE_NOT_FOUND', message: 'Wave not found' } });
    }

    const view = await getMySquadView(waveId, user.id);
    return res.json({ request_id: req.id || '', data: view });
  } catch (err) {
    return next(err);
  }
}

export async function getSquad(req: Request, res: Response, next: NextFunction) {
  try {
    const waveId = Number(req.params.waveId);
    const squadId = Number(req.params.squadId);
    if (!Number.isInteger(waveId) || waveId <= 0 || !Number.isInteger(squadId) || squadId <= 0) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Valid waveId and squadId are required' } });
    }

    const wave = await getWaveById(waveId);
    if (!wave) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'WAVE_NOT_FOUND', message: 'Wave not found' } });
    }

    const detail = await getSquadDetail(waveId, squadId);
    if (!detail) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SQUAD_NOT_FOUND', message: 'Squad not found' } });
    }

    return res.json({ request_id: req.id || '', data: detail });
  } catch (err) {
    return next(err);
  }
}

export async function joinExistingSquad(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }

    const waveId = Number(req.params.waveId);
    const squadId = Number(req.params.squadId);
    if (!Number.isInteger(waveId) || waveId <= 0 || !Number.isInteger(squadId) || squadId <= 0) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Valid waveId and squadId are required' } });
    }

    const squad = await getSquadById(waveId, squadId);
    if (!squad) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'SQUAD_NOT_FOUND', message: 'Squad not found' } });
    }
    if (squad.status !== 'open') {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'SQUAD_NOT_OPEN', message: 'Squad is not open for new members' } });
    }

    const existingMembership = await getMembershipForWave(waveId, user.id);
    if (existingMembership) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'SQUAD_MEMBERSHIP_EXISTS', message: 'User has already joined a squad in this wave' } });
    }

    const member = await joinSquad(waveId, squadId, user.id);
    return res.status(201).json({ request_id: req.id || '', data: member });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'SQUAD_MEMBERSHIP_EXISTS', message: 'User has already joined a squad in this wave' } });
    }
    return next(err);
  }
}
