import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createUser, findByEmail } from '../models/userModel';

const SALT_ROUNDS = 10;

/**
 * Register a new user. Requires an email and password in the body. Returns
 * a signed JWT on success. If the email is already taken, returns 409.
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Email and password required' } });
    }
    const existing = await findByEmail(email);
    if (existing) {
      return res.status(409).json({ request_id: req.id || '', error: { code: 'EMAIL_TAKEN', message: 'A user with this email already exists' } });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser(email, passwordHash);
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    return res.status(201).json({ request_id: req.id || '', data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    return next(err);
  }
}

/**
 * Login a user by email and password. Returns a signed JWT on success. If
 * credentials are invalid, returns 401.
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ request_id: req.id || '', error: { code: 'INVALID_INPUT', message: 'Email and password required' } });
    }
    const user = await findByEmail(email);
    if (!user) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ request_id: req.id || '', error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    return res.json({ request_id: req.id || '', data: { token, user: { id: user.id, email: user.email } } });
  } catch (err) {
    return next(err);
  }
}