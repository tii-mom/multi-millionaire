import fs from 'fs';
import path from 'path';
import { closePool, query, withClient } from '../db';

const allowedResetEnvs = new Set(['development', 'local', 'staging']);

function migrationDir() {
  return path.resolve(__dirname, '../../migrations');
}

function migrationFiles() {
  return fs.readdirSync(migrationDir())
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function ensureTrackingTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
}

async function appliedMigrations(): Promise<Set<string>> {
  await ensureTrackingTable();
  const result = await query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename ASC');
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(filename: string) {
  const fullPath = path.join(migrationDir(), filename);
  const sql = fs.readFileSync(fullPath, 'utf8');
  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`Applied migration ${filename}`);
  }
}

async function migrateUp() {
  const applied = await appliedMigrations();
  for (const filename of migrationFiles()) {
    if (!applied.has(filename)) {
      await applyMigration(filename);
    }
  }
}

async function resetDatabase() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (!allowedResetEnvs.has(env)) {
    throw new Error(`migrate reset is only allowed in local/staging environments. Current NODE_ENV=${env}`);
  }

  await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(`
        DROP TABLE IF EXISTS
          schema_migrations,
          risk_flags,
          reward_batches,
          reward_ledgers,
          squad_members,
          squads,
          referrals,
          positions,
          rush_passes,
          price_rounds,
          waves,
          users
        CASCADE
      `);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });

  await migrateUp();
}

async function main() {
  const command = process.argv[2];
  if (!command || !['up', 'reset'].includes(command)) {
    throw new Error('Usage: ts-node src/scripts/migrate.ts <up|reset>');
  }

  if (command === 'up') {
    await migrateUp();
  } else {
    await resetDatabase();
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
