import { closePool, query } from '../db';

const REQUIRED_MIGRATIONS = [
  '005_production_chain_ops.sql',
  '006_merkle_rewards.sql',
  '007_deposit_streaks.sql',
];

const REQUIRED_TABLES = [
  'app_controls',
  'chain_events',
  'admin_audit_logs',
  'merkle_reward_batches',
  'merkle_reward_proofs',
  'deposit_streak_goals',
];

function redactDatabaseUrl(raw?: string) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    if (url.username) url.username = `${url.username.slice(0, 2)}***`;
    return url.toString();
  } catch {
    return '<invalid DATABASE_URL>';
  }
}

async function main() {
  const migrationRows = await query<{ filename: string }>(
    `SELECT filename
     FROM schema_migrations
     WHERE filename = ANY($1::text[])
     ORDER BY filename ASC`,
    [REQUIRED_MIGRATIONS]
  );
  const applied = new Set(migrationRows.rows.map((row) => row.filename));

  const tableRows = await query<{ table_name: string; regclass: string | null }>(
    `SELECT table_name, to_regclass('public.' || table_name) AS regclass
     FROM unnest($1::text[]) AS required(table_name)
     ORDER BY table_name ASC`,
    [REQUIRED_TABLES]
  );

  const missingMigrations = REQUIRED_MIGRATIONS.filter((name) => !applied.has(name));
  const missingTables = tableRows.rows
    .filter((row) => row.regclass === null)
    .map((row) => row.table_name);

  const report = {
    status: missingMigrations.length === 0 && missingTables.length === 0 ? 'pass' : 'fail',
    database_url: redactDatabaseUrl(process.env.DATABASE_URL),
    checked_migrations: REQUIRED_MIGRATIONS,
    missing_migrations: missingMigrations,
    checked_tables: REQUIRED_TABLES,
    missing_tables: missingTables,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));

  if (report.status === 'fail') {
    process.exitCode = 1;
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
