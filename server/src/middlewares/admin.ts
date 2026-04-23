import { Request, Response, NextFunction } from 'express';

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const email = req.user?.email?.toLowerCase();
  if (!email || !getAdminEmails().has(email)) {
    return res.status(403).json({ request_id: req.id || '', error: { code: 'ADMIN_REQUIRED', message: 'Admin access required' } });
  }
  return next();
}
