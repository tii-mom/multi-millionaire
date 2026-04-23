import express from 'express';
import { getLatest } from '../controllers/priceController';

const router = express.Router();

// GET /v1/prices/latest
router.get('/latest', getLatest);

export default router;
