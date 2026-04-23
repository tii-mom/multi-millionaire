import express from 'express';
import { createSquad, joinExistingSquad, listSquads } from '../controllers/squadController';
import { requireAuth } from '../middlewares/auth';

const router = express.Router({ mergeParams: true });

router.get('/', listSquads);
router.post('/', requireAuth, createSquad);
router.post('/:squadId/join', requireAuth, joinExistingSquad);

export default router;
