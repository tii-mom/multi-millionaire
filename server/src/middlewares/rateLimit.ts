import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

function readLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRouteRateLimiter(prefix: string, fallbackWindowMs: number, fallbackMax: number) {
  return rateLimit({
    windowMs: readLimit(`${prefix}_WINDOW_MS`, fallbackWindowMs),
    max: readLimit(`${prefix}_MAX`, fallbackMax),
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      ip: false,
    },
    keyGenerator: (req: Request) => {
      const headerValue = req.headers['cf-connecting-ip'];
      const forwardedIp = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      return req.ip || forwardedIp || 'unknown';
    },
    handler: (req: Request, res: Response) => {
      return res.status(429).json({
        request_id: req.id || '',
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      });
    },
  });
}
