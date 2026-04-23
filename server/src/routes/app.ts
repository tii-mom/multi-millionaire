import express from 'express';
import { bootstrap } from '../controllers/appController';

const router = express.Router();

// Expose the bootstrap endpoint at /v1/app/bootstrap
router.get('/bootstrap', bootstrap);

export default router;