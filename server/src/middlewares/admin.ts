import { Request, Response, NextFunction } from 'express';
import { adminOperationsEnabled } from '../services/productionGuards';

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminOperationsEnabled()) {
    return res.status(404).json({ request_id: req.id || '', error: { code: 'ADMIN_OPERATIONS_DISABLED', message: 'Admin operations are disabled for this environment' } });
  }
  const email = req.user?.email?.toLowerCase();
  if (!email || !getAdminEmails().has(email)) {
    return res.status(403).json({ request_id: req.id || '', error: { code: 'ADMIN_REQUIRED', message: 'Admin access required' } });
  }
  return next();
}
