/// <reference path="./types/express.d.ts" />

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { query } from './db';
import { errorLogger, requestLogger } from './middlewares/logging';

// Load environment variables at startup
dotenv.config();

const app = express();

const fallbackOrigins = new Set(['http://localhost:3000', 'http://localhost:4173']);
const allowedOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  if (allowedOrigins.size === 0) {
    return fallbackOrigins.has(origin);
  }
  return allowedOrigins.has(origin);
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));

// JSON body parser
app.use(express.json());

// Assign simple request ID for logging and correlation
app.use((req, res, next) => {
  req.id = (Math.random().toString(36).substring(2, 8)) as any;
  next();
});

app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({
    request_id: req.id || '',
    status: 'ok',
    service: 'multi-millionaire-api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1 AS ok');
    res.json({
      request_id: req.id || '',
      status: 'ready',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      request_id: req.id || '',
      status: 'not_ready',
      database: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Versioned routes
app.use('/v1', routes);

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ request_id: (req.id as any) || '', error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use(errorLogger);

// Generic error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';
  res.status(status).json({ request_id: (req.id as any) || '', error: { code, message } });
});

export default app;
