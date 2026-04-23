import { NextFunction, Request, Response } from 'express';

function emit(level: 'info' | 'error', event: string, payload: Record<string, unknown>) {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  res.on('finish', () => {
    emit('info', 'http.request', {
      request_id: req.id || '',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
      ip: req.ip,
    });
  });
  return next();
}

export function errorLogger(err: any, req: Request, res: Response, next: NextFunction) {
  emit('error', 'http.error', {
    request_id: req.id || '',
    method: req.method,
    path: req.originalUrl,
    status: err?.status || res.statusCode || 500,
    code: err?.code || 'INTERNAL_ERROR',
    message: err?.message || 'Internal server error',
  });
  return next(err);
}

