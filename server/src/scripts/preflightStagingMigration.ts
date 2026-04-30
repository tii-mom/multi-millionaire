import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const REQUIRED_MIGRATIONS = [
  '001_init.sql',
  '002_squads.sql',
  '003_rewards.sql',
  '004_risk.sql',
  '005_production_chain_ops.sql',
  '006_merkle_rewards.sql',
];

const REQUIRED_TABLES_AFTER_UP = [
  'users',
  'waves',
  'positions',
  'referrals',
  'squads',
  'squad_members',
  'reward_ledgers',
  'reward_batches',
  'risk_flags',
  'app_controls',
  'chain_events',
  'admin_audit_logs',
  'merkle_reward_batches',
  'merkle_reward_proofs',
];

function redactDatabaseUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    if (url.username) url.username = `${url.username.slice(0, 2)}***`;
    return url.toString();
  } catch {
    return '<invalid DATABASE_URL>';
  }
}

function parseDatabaseUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  }

  return url;
}

function assertNotProduction(url: URL) {
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('Refusing preflight with NODE_ENV=production');
  }

  const declaredTarget = (process.env.MM_DB_TARGET_ENV || '').trim().toLowerCase();
  if (declaredTarget !== 'staging') {
    throw new Error('Set MM_DB_TARGET_ENV=staging to confirm the intended target before preflight');
  }

  const haystack = [
    url.hostname,
    url.pathname,
    decodeURIComponent(url.username || ''),
    process.env.CF_HYPERDRIVE_ID || '',
    process.env.CF_WORKER_ENV || '',
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(prod|production|mainnet)\b/.test(haystack) || haystack.includes('api-production')) {
    throw new Error('DATABASE_URL or environment hints look production/mainnet; refusing preflight');
  }

  const hasStagingSignal = /\b(staging|stage|preview|test|dev|rc1)\b/.test(haystack);
  if (!hasStagingSignal && process.env.MM_ALLOW_UNLABELED_STAGING_DATABASE_URL !== 'true') {
    throw new Error(
      'DATABASE_URL does not contain a staging/test/dev marker. If this is a generic managed staging URL, set MM_ALLOW_UNLABELED_STAGING_DATABASE_URL=true after verifying it in the provider console.'
    );
  }
}

function loadMigrationFiles() {
  const migrationDir = path.resolve(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
  const missing = REQUIRED_MIGRATIONS.filter((file) => !files.includes(file));
  return { migrationDir, files, missing };
}

async function main() {
  const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (!rawDatabaseUrl) {
    throw new Error('DATABASE_URL is required for staging migration preflight');
  }

  const url = parseDatabaseUrl(rawDatabaseUrl);
  assertNotProduction(url);

  const localMigrations = loadMigrationFiles();
  const report: Record<string, unknown> = {
    status: 'unknown',
    writes_db: false,
    database_url: redactDatabaseUrl(rawDatabaseUrl),
    target_guard: {
      node_env: process.env.NODE_ENV || null,
      mm_db_target_env: process.env.MM_DB_TARGET_ENV || null,
      cf_worker_env: process.env.CF_WORKER_ENV || null,
      cf_hyperdrive_id: process.env.CF_HYPERDRIVE_ID || null,
      unlabeled_staging_url_allowed: process.env.MM_ALLOW_UNLABELED_STAGING_DATABASE_URL === 'true',
    },
    local_migrations: localMigrations,
  };

  const client = new Client({ connectionString: rawDatabaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN READ ONLY');

    const identity = await client.query<{
      database_name: string;
      current_user: string;
      server_addr: string | null;
      server_port: number | null;
      read_only: string;
      server_version: string;
    }>(
      `SELECT
        current_database() AS database_name,
        current_user AS current_user,
        inet_server_addr()::text AS server_addr,
        inet_server_port() AS server_port,
        current_setting('transaction_read_only') AS read_only,
        current_setting('server_version') AS server_version`
    );

    const migrationTable = await client.query<{ schema_migrations_regclass: string | null }>(
      `SELECT to_regclass('public.schema_migrations')::text AS schema_migrations_regclass`
    );

    let appliedMigrations: string[] = [];
    if (migrationTable.rows[0]?.schema_migrations_regclass) {
      const applied = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename ASC');
      appliedMigrations = applied.rows.map((row) => row.filename);
    }

    const tableChecks = await client.query<{ table_name: string; exists: boolean }>(
      `SELECT table_name, to_regclass('public.' || table_name) IS NOT NULL AS exists
       FROM unnest($1::text[]) AS required(table_name)
       ORDER BY table_name ASC`,
      [REQUIRED_TABLES_AFTER_UP]
    );

    await client.query('ROLLBACK');

    const missingLocalMigrations = localMigrations.missing;
    const pendingMigrations = REQUIRED_MIGRATIONS.filter((file) => !appliedMigrations.includes(file));
    const missingTables = tableChecks.rows.filter((row) => !row.exists).map((row) => row.table_name);

    report.database_identity = identity.rows[0];
    report.remote_schema = {
      schema_migrations_table_exists: Boolean(migrationTable.rows[0]?.schema_migrations_regclass),
      applied_migrations: appliedMigrations,
      pending_required_migrations: pendingMigrations,
      checked_tables: tableChecks.rows,
      missing_required_tables_after_up: missingTables,
    };
    report.status = missingLocalMigrations.length === 0 ? 'pass' : 'fail';
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failures: the original error is more useful.
    }
    throw error;
  } finally {
    await client.end();
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
