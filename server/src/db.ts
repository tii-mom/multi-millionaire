import { Pool, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env file. If the file does not exist,
// dotenv will silently ignore it. In production you should set these variables
// via your process manager or orchestration tool (e.g. Docker secrets).
dotenv.config();

// Create a single pool instance to be shared throughout the app. This avoids
// exhausting the database connection limit under load.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: configure SSL for production deployments (e.g. Heroku)
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
});

// Simple helper to run queries. In larger applications you may want to
// implement a more robust database access layer with prepared statements,
// transactions and pooled connections.
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('executed query', { text, duration, rows: result.rowCount });
  }
  return result;
}

// Expose a method to gracefully shut down the pool when the process exits.
export async function closePool() {
  await pool.end();
}
