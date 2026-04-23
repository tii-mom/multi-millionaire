import express from 'express';
import { register, login } from '../controllers/authController';

const router = express.Router();

// POST /v1/auth/register
router.post('/register', register);

// POST /v1/auth/login
router.post('/login', login);

export default router;