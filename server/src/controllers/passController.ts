import { Request, Response, NextFunction } from 'express';
import { getPass, createPass } from '../models/passModel';

/**
 * Claim a pass for the current user on a given wave.
 *
 * For simplicity this controller expects a header `x-user-id` containing the user
 * ID. In production this should come from an authenticated JWT or session.
 * It also performs a basic check for an existing pass before attempting to
 * insert a new one. More advanced validation (e.g. wave eligibility, user
 * status) should be implemented as the product evolves.
 */
export async function claimPass(req: Request, res: Response, next: NextFunction) {
  try {
    const waveId = Number(req.params.waveId);
    const userId: string | undefined = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user identifier' } });
    }
    // Check if the user already has a pass for this wave
    const existing = await getPass(userId, waveId);
    if (existing) {
      return res.json({ request_id: req.id || '', data: existing });
    }
    const pass = await createPass(userId, waveId);
    return res.json({ request_id: req.id || '', data: pass });
  } catch (err) {
    return next(err);
  }
}