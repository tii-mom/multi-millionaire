import { query } from '../db';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find a user by their primary key. Returns null if the user does not exist.
 */
export async function findById(userId: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, password_hash, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by their email address. Returns null if no user exists with
 * that email. Email is unique in the users table.
 */
export async function findByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT id, email, password_hash, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Create a new user with the given email and password hash. The caller must
 * ensure the email is unique. Returns the newly created user record.
 */
export async function createUser(email: string, passwordHash: string): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (email, password_hash, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     RETURNING id, email, password_hash, created_at, updated_at`,
    [email, passwordHash]
  );
  return result.rows[0];
}