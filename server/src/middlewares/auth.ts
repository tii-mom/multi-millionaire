import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Simple JWT authentication middleware. If a valid token is present in the
 * Authorization header (Bearer <token>), the user ID and email will be
 * attached to the request object as `req.user`. Otherwise the request is
 * rejected with 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Missing Authorization header' } });
  }
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ request_id: req.id || '', error: { code: 'UNAUTHENTICATED', message: 'Invalid Authorization header' } });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string; email?: string };
    req.user = { id: decoded.userId, email: decoded.email };
    return next();
  } catch (err) {
    return res.status(401).json({ request_id: req.id || '', error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
}
