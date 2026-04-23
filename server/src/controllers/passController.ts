import { Request, Response, NextFunction } from 'express';
import { getPass, createPass } from '../models/passModel';

/**
 * Claim a pass for the current user on a given wave.
 *
 * Identity comes from the authenticated JWT. It performs a basic check for an
 * existing pass before attempting to insert a new one. More advanced validation
 * should be implemented as the product evolves.
 */
export async function claimPass(req: Request, res: Response, next: NextFunction) {
  try {
    const waveId = Number(req.params.waveId);
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    // Check if the user already has a pass for this wave
    const existing = await getPass(user.id, waveId);
    if (existing) {
      return res.json({ request_id: req.id || '', data: existing });
    }
    const pass = await createPass(user.id, waveId);
    return res.json({ request_id: req.id || '', data: pass });
  } catch (err) {
    return next(err);
  }
}
