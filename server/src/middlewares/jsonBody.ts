import { NextFunction, Request, Response } from 'express';

const maxBodyBytes = 1024 * 1024;
const methodsWithBodies = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function wantsJsonParsing(req: Request) {
  if (!methodsWithBodies.has(req.method.toUpperCase())) {
    return false;
  }

  const contentType = req.headers['content-type'];
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
}

export function jsonBodyParser(req: Request, res: Response, next: NextFunction) {
  if (!wantsJsonParsing(req)) {
    return next();
  }

  const chunks: Uint8Array[] = [];
  let bodyLength = 0;

  req.on('data', (chunk: Uint8Array | string) => {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    bodyLength += buffer.byteLength;

    if (bodyLength > maxBodyBytes) {
      req.destroy();
      return;
    }

    chunks.push(buffer);
  });

  req.on('end', () => {
    if (bodyLength > maxBodyBytes) {
      return res.status(413).json({
        request_id: req.id || '',
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'JSON payload exceeds 1 MB limit',
        },
      });
    }

    if (chunks.length === 0) {
      req.body = {};
      return next();
    }

    try {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      req.body = raw ? JSON.parse(raw) : {};
      return next();
    } catch {
      return res.status(400).json({
        request_id: req.id || '',
        error: {
          code: 'INVALID_JSON',
          message: 'Request body must be valid JSON',
        },
      });
    }
  });

  req.on('error', (error) => {
    return next(error);
  });
}
