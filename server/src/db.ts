import { Client, Pool, PoolClient, QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import { getHyperdriveConnectionString } from './runtime';

// Load environment variables from .env file. If the file does not exist,
// dotenv will silently ignore it. In production you should set these variables
// via your process manager or orchestration tool (e.g. Docker secrets).
dotenv.config();

let pool: Pool | null = null;
let poolConnectionString: string | null = null;

export interface QueryExecutor {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<{ rows: T[] }>;
}

function getDatabaseConnectionString() {
  const hyperdriveConnectionString = getHyperdriveConnectionString();
  if (hyperdriveConnectionString) {
    return hyperdriveConnectionString;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error('DATABASE_URL or HYPERDRIVE binding is required');
}

function getOrCreatePool(connectionString: string) {
  if (!pool || poolConnectionString !== connectionString) {
    if (pool) {
      void pool.end();
    }

    pool = new Pool({
      connectionString,
      // Keep the existing Node deployment behavior. Hyperdrive provides its
      // own connection endpoint and does not need the Node SSL override.
      ssl:
        process.env.NODE_ENV === 'production' && !getHyperdriveConnectionString()
          ? { rejectUnauthorized: false }
          : undefined,
    });
    poolConnectionString = connectionString;
  }

  return pool;
}

function logDbEvent(level: 'info' | 'error', payload: Record<string, unknown>) {
  const entry = {
    level,
    event: 'db.query',
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

// Simple helper to run queries. In larger applications you may want to
// implement a more robust database access layer with prepared statements,
// transactions and pooled connections.
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const start = Date.now();
  const hyperdriveConnectionString = getHyperdriveConnectionString();
  const connectionString = getDatabaseConnectionString();
  try {
    const result = hyperdriveConnectionString
      ? await queryWithHyperdrive<T>(connectionString, text, params)
      : await getOrCreatePool(connectionString).query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      logDbEvent('info', { duration_ms: duration, rows: result.rowCount, text });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logDbEvent('error', {
      duration_ms: duration,
      text,
      code: (error as { code?: string }).code,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Expose a method to gracefully shut down the pool when the process exits.
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    poolConnectionString = null;
  }
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (getHyperdriveConnectionString()) {
    throw new Error('withClient is only supported for the Node/Postgres pool path');
  }

  const client = await getOrCreatePool(getDatabaseConnectionString()).connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(fn: (client: QueryExecutor) => Promise<T>): Promise<T> {
  if (getHyperdriveConnectionString()) {
    const client = new Client({ connectionString: getDatabaseConnectionString() });
    await client.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  }

  const client = await getOrCreatePool(getDatabaseConnectionString()).connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function queryWithHyperdrive<T extends QueryResultRow = QueryResultRow>(
  connectionString: string,
  text: string,
  params?: any[]
) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    return await client.query<T>(text, params);
  } finally {
    await client.end();
  }
}
