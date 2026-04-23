import express from 'express';
import { createSquad, joinExistingSquad, listSquads } from '../controllers/squadController';
import { requireAuth } from '../middlewares/auth';
import { requireFields, requirePositiveIntParam } from '../middlewares/validation';

const router = express.Router({ mergeParams: true });

router.get('/', requirePositiveIntParam('waveId'), listSquads);
router.post('/', requireAuth, requirePositiveIntParam('waveId'), requireFields('body', ['name']), createSquad);
router.post('/:squadId/join', requireAuth, requirePositiveIntParam('waveId'), requirePositiveIntParam('squadId'), joinExistingSquad);

export default router;
