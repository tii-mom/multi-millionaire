import { NextFunction, Request, Response } from 'express';

type ValidationSource = 'body' | 'params' | 'query';

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
}

function respondInvalidInput(res: Response, requestId: string, message: string) {
  return res.status(400).json({
    request_id: requestId,
    error: { code: 'INVALID_INPUT', message },
  });
}

function readValue(req: Request, source: ValidationSource, key: string): unknown {
  if (source === 'body') return (req.body as Record<string, unknown> | undefined)?.[key];
  if (source === 'params') return req.params[key];
  return req.query[key];
}

export function requireFields(source: ValidationSource, fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter((field) => !isPresent(readValue(req, source, field)));
    if (missing.length > 0) {
      return respondInvalidInput(res, req.id || '', `Missing required field(s): ${missing.join(', ')}`);
    }
    return next();
  };
}

export function requireAnyBodyField(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const hasAny = fields.some((field) => isPresent((req.body as Record<string, unknown> | undefined)?.[field]));
    if (!hasAny) {
      return respondInvalidInput(res, req.id || '', `At least one of ${fields.join(', ')} is required`);
    }
    return next();
  };
}

export function requirePositiveIntParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.params[paramName];
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return respondInvalidInput(res, req.id || '', `Valid ${paramName} is required`);
    }
    return next();
  };
}

export function requireUuidParam(paramName: string) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = req.params[paramName];
    if (typeof raw !== 'string' || !uuidPattern.test(raw)) {
      return respondInvalidInput(res, req.id || '', `Valid ${paramName} is required`);
    }
    return next();
  };
}

