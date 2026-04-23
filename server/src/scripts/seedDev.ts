import bcrypt from 'bcrypt';
import { closePool, query } from '../db';

const SALT_ROUNDS = 10;
const seedUsers = [
  { email: 'admin@example.com', password: 'Password123!' },
  { email: 'member@example.com', password: 'Password123!' },
  { email: 'risk@example.com', password: 'Password123!' },
];

async function main() {
  const passwordHashes = await Promise.all(
    seedUsers.map(async (user) => ({
      email: user.email,
      passwordHash: await bcrypt.hash(user.password, SALT_ROUNDS),
    }))
  );

  for (const user of passwordHashes) {
    await query(
      `INSERT INTO users (email, password_hash, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()`,
      [user.email, user.passwordHash]
    );
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${passwordHashes.length} dev users.`);
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

