import { Request, Response, NextFunction } from 'express';
import { findByEmail } from '../models/userModel';
import { getReferral, upsertReferral } from '../models/referralModel';

/**
 * Confirm or update a referral. The inviter is supplied as an email address in
 * the request body. Only authenticated users can confirm a referral. If the
 * referral is already locked, an error is returned.
 */
export async function confirmReferral(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing user' } });
    }
    const { inviterEmail } = req.body;
    if (!inviterEmail) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'inviterEmail required' } });
    }
    const referral = await getReferral(user.id);
    if (referral && referral.status === 'locked') {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'REFERRAL_LOCKED', message: 'Referral has already been locked' } });
    }
    // Find inviter by email
    const inviter = await findByEmail(inviterEmail);
    if (!inviter) {
      return res.status(404).json({ request_id: req.id || '', error: { code: 'INVITER_NOT_FOUND', message: 'Inviter email not found' } });
    }
    // Prevent self referral
    if (inviter.id === user.id) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'SELF_REFERRAL', message: 'Cannot refer yourself' } });
    }
    const updated = await upsertReferral(user.id, inviter.id);
    return res.json({ request_id: req.id || '', data: updated });
  } catch (err) {
    return next(err);
  }
}
