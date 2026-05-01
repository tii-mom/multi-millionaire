/// <reference path="./types/express.d.ts" />

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { query } from './db';
import { jsonBodyParser } from './middlewares/jsonBody';
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
  if (allowedOrigins.has(origin)) return true;
  // Allow Cloudflare Pages preview subdomains (hash.${project}.pages.dev) only.
  try {
    const { hostname } = new URL(origin);
    return [...allowedOrigins].some((allowed) => {
      try {
        const allowedHost = new URL(allowed).hostname;
        return allowedHost.endsWith('.pages.dev') && hostname.endsWith('.' + allowedHost);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
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

// Use a local JSON parser so the API works in both Node and Workers runtimes.
app.use(jsonBodyParser);

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
    const migrations = await query<{ ok: number }>(
      `SELECT 1
       FROM schema_migrations
       WHERE filename IN ('005_production_chain_ops.sql','006_merkle_rewards.sql')
       GROUP BY 1
       HAVING COUNT(*) = 2`
    );
    if (migrations.rows.length === 0) {
      throw new Error('Required production migrations are not applied');
    }
    const tables = await query<{
      app_controls: string | null;
      chain_events: string | null;
      admin_audit_logs: string | null;
      merkle_reward_batches: string | null;
      merkle_reward_proofs: string | null;
    }>(
      `SELECT
         to_regclass('public.app_controls') AS app_controls,
         to_regclass('public.chain_events') AS chain_events,
         to_regclass('public.admin_audit_logs') AS admin_audit_logs,
         to_regclass('public.merkle_reward_batches') AS merkle_reward_batches,
         to_regclass('public.merkle_reward_proofs') AS merkle_reward_proofs`
    );
    const tableStatus = tables.rows[0];
    if (!tableStatus || Object.values(tableStatus).some((value) => value === null)) {
      throw new Error('Required production ops tables are missing');
    }
    res.json({
      request_id: req.id || '',
      status: 'ready',
      database: 'ok',
      migrations: 'ok',
      ops_tables: 'ok',
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
