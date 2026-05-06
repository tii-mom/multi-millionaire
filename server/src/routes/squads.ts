import express from 'express';
import { createSquad, getMySquad, getSquad, joinExistingSquad, listSquads } from '../controllers/squadController';
import { requireAuth } from '../middlewares/auth';
import { requireFields, requirePositiveIntParam } from '../middlewares/validation';

const router = express.Router({ mergeParams: true });

router.get('/', requirePositiveIntParam('waveId'), listSquads);
router.get('/me', requireAuth, requirePositiveIntParam('waveId'), getMySquad);
router.post('/', requireAuth, requirePositiveIntParam('waveId'), requireFields('body', ['name']), createSquad);
router.get('/:squadId', requirePositiveIntParam('waveId'), requirePositiveIntParam('squadId'), getSquad);
router.post('/:squadId/join', requireAuth, requirePositiveIntParam('waveId'), requirePositiveIntParam('squadId'), joinExistingSquad);

export default router;
